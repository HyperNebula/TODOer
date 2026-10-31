use super::{
    commands::{self, SyncState},
    storage, GoogleError, Result,
};
use crate::calendar::CalendarDb;
use std::sync::atomic::Ordering;
use std::time::{Duration, Instant};
use tauri::{Emitter, Manager};

pub struct Planner {
    pub session: Option<String>,
    pub due: Option<Instant>,
    pub revision: u64,
    failures: u32,
}
impl Planner {
    pub fn new() -> Self {
        Self {
            session: None,
            due: None,
            revision: 0,
            failures: 0,
        }
    }
    pub fn session(&mut self, id: Option<String>) {
        if self.session != id {
            self.session = id;
            self.failures = 0;
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
                self.due = Some(Instant::now() + Duration::from_secs(60));
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
        if !ready || session.is_none() {
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
pub fn google_schedule_sync(app: tauri::AppHandle, database_id: String) -> Result<()> {
    let _ = commands::connection(&app, &database_id)?;
    wake(&app, false);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
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
