use super::{
    commands::{self, SyncState},
    storage, GoogleError, Result,
};
use crate::calendar::CalendarDb;
use std::sync::atomic::Ordering;
use std::time::{Duration, Instant};
use tauri::{Emitter, Manager};

const IDLE_SYNC_INTERVAL: Duration = Duration::from_secs(15 * 60);
const FOCUS_SYNC_INTERVAL: Duration = Duration::from_secs(60);

pub struct Planner {
    pub session: Option<String>,
    pub due: Option<Instant>,
    pub revision: u64,
    failures: u32,
    last_attempt: Option<Instant>,
}
impl Planner {
    pub fn new() -> Self {
        Self {
            session: None,
            due: None,
            revision: 0,
            failures: 0,
            last_attempt: None,
        }
    }
    pub fn session(&mut self, id: Option<String>) {
        if self.session != id {
            self.session = id;
            self.failures = 0;
            self.last_attempt = None;
            self.revision += 1;
            self.due = Some(Instant::now());
        }
    }
    pub fn wake(&mut self, edit: bool) {
        self.revision += 1;
        if self.failures == 0 || self.due.is_none() {
            self.due = Some(Instant::now() + Duration::from_secs(if edit { 2 } else { 0 }));
        }
    }
    pub fn started(&mut self) {
        self.last_attempt = Some(Instant::now());
    }
    pub fn refresh(&mut self, force: bool) {
        if !force
            && self
                .last_attempt
                .is_some_and(|last| last.elapsed() < FOCUS_SYNC_INTERVAL)
        {
            return;
        }
        self.wake(false);
    }
    pub fn finish(&mut self, revision: u64, error: Option<&GoogleError>) {
        if let Some(error) = error {
            if error.code == "busy" {
                self.due = Some(Instant::now() + Duration::from_secs(2));
                return;
            }
            if !error.retryable {
                self.due = None;
                return;
            }
            self.failures = (self.failures + 1).min(8);
            let base = (5u64 * 2u64.pow(self.failures - 1)).min(900);
            let mut byte = [0u8; 1];
            let _ = getrandom::fill(&mut byte);
            self.due = Some(
                Instant::now() + Duration::from_secs(base + (u64::from(byte[0]) * base / 1024)),
            );
        } else {
            self.failures = 0;
            if self.revision == revision || self.due.is_none() {
                self.due = Some(Instant::now() + IDLE_SYNC_INTERVAL);
            }
        }
    }
}

pub fn wake(app: &tauri::AppHandle, edit: bool) {
    let state = app.state::<SyncState>();
    if let Ok(mut plan) = state.plan.lock() {
        plan.wake(edit);
    }
    state.wake.notify_all();
}

pub fn local_change(app: &tauri::AppHandle, id: &str) {
    wake(app, true);
    let _ = app.emit("google-local-change", serde_json::json!({"database_id":id}));
}

pub fn initialize(app: &tauri::AppHandle) -> Result<()> {
    let path = app
        .path()
        .app_local_data_dir()
        .map_err(GoogleError::storage)?
        .join("google_sync_epoch");
    let epoch = match std::fs::read_to_string(path) {
        Ok(value) => value.trim().into(),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(error) => return Err(GoogleError::storage(error)),
    };
    *app.state::<SyncState>()
        .epoch
        .lock()
        .map_err(GoogleError::storage)? = epoch;
    Ok(())
}

pub fn disconnect_lists(app: &tauri::AppHandle) -> Result<()> {
    let mut bytes = [0u8; 16];
    getrandom::fill(&mut bytes)
        .map_err(|_| GoogleError::new("randomness", "Could not pause Google sync."))?;
    let epoch = bytes
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    let path = app
        .path()
        .app_local_data_dir()
        .map_err(GoogleError::storage)?
        .join("google_sync_epoch");
    crate::atomic_write(&path, &epoch).map_err(GoogleError::storage)?;
    *app.state::<SyncState>()
        .epoch
        .lock()
        .map_err(GoogleError::storage)? = epoch;
    wake(app, false);
    Ok(())
}

pub fn start(app: tauri::AppHandle) {
    std::thread::spawn(move || loop {
        let state = app.state::<SyncState>();
        if state.shutdown.load(Ordering::SeqCst) {
            break;
        }
        let session = app
            .state::<CalendarDb>()
            .conn
            .lock()
            .ok()
            .and_then(|db| db.as_ref().map(|db| db.session_id.clone()));
        let Ok(mut plan) = state.plan.lock() else {
            break;
        };
        plan.session(session.clone());
        let ready = plan.due.is_some_and(|due| due <= Instant::now());
        if !ready || session.is_none() || state.closing.load(Ordering::SeqCst) {
            let _ = state.wake.wait_timeout(plan, Duration::from_millis(250));
            continue;
        }
        plan.due = None;
        let revision = plan.revision;
        drop(plan);
        let id = session.unwrap();
        let enabled = commands::connection(&app, &id)
            .ok()
            .and_then(|conn| storage::binding(&conn).ok().flatten())
            .is_some_and(|binding| binding.enabled && binding.setup_state == "ready");
        if !enabled {
            continue;
        }
        let result = commands::run_sync(&app, &id);
        if let Ok(mut plan) = state.plan.lock() {
            if plan.session.as_deref() == Some(&id) {
                plan.finish(revision, result.as_ref().err());
            }
        };
    });
}

#[tauri::command]
pub fn google_schedule_sync(
    app: tauri::AppHandle,
    database_id: String,
    force: Option<bool>,
) -> Result<()> {
    let _ = commands::connection(&app, &database_id)?;
    let state = app.state::<SyncState>();
    state
        .plan
        .lock()
        .map_err(GoogleError::storage)?
        .refresh(force.unwrap_or(false));
    state.wake.notify_all();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn idle_runs_wait_fifteen_minutes_and_focus_checks_are_throttled() {
        let mut plan = Planner::new();
        plan.session(Some("one".into()));
        plan.started();
        let revision = plan.revision;
        plan.finish(revision, None);
        let due = plan.due;
        assert!(due.unwrap().duration_since(Instant::now()) > Duration::from_secs(14 * 60));
        plan.refresh(false);
        assert_eq!(plan.due, due);
        assert_eq!(plan.revision, revision);
        plan.last_attempt = Some(Instant::now() - FOCUS_SYNC_INTERVAL);
        plan.refresh(false);
        assert!(plan.due.unwrap() <= Instant::now());
    }
    #[test]
    fn reconnect_and_edits_can_sync_immediately_after_a_recent_check() {
        let mut plan = Planner::new();
        plan.started();
        plan.refresh(true);
        assert!(plan.due.unwrap() <= Instant::now());
        plan.wake(true);
        let wait = plan.due.unwrap().duration_since(Instant::now());
        assert!(wait > Duration::from_secs(1) && wait <= Duration::from_secs(2));
    }
    #[test]
    fn edits_during_a_successful_run_remain_scheduled() {
        let mut plan = Planner::new();
        plan.session(Some("one".into()));
        let revision = plan.revision;
        plan.due = None;
        plan.wake(true);
        let due = plan.due;
        plan.finish(revision, None);
        assert_eq!(plan.due, due);
        plan.session(Some("two".into()));
        assert_eq!(plan.session.as_deref(), Some("two"));
    }
    #[test]
    fn retry_backoff_is_not_bypassed_by_more_local_edits() {
        let mut plan = Planner::new();
        plan.finish(
            0,
            Some(&GoogleError {
                code: "network".into(),
                message: "offline".into(),
                retryable: true,
            }),
        );
        let due = plan.due;
        plan.wake(true);
        assert_eq!(plan.due, due);
        plan.finish(0, Some(&GoogleError::new("reconnect", "Reconnect")));
        assert!(plan.due.is_none());
    }
}
