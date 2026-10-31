use super::{
    api::HttpApi, auth::GoogleAuth, engine, incoming, scheduler, storage, GoogleError, Result,
};
use crate::calendar::CalendarDb;
use rusqlite::Connection;
use serde::Serialize;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Condvar, Mutex,
};
use tauri::{Emitter, Manager};

pub struct SyncState {
    pub gate: Mutex<()>,
    pub running: AtomicBool,
    pub plan: Mutex<scheduler::Planner>,
    pub wake: Condvar,
    pub shutdown: AtomicBool,
    pub epoch: Mutex<String>,
    pub last_error: Mutex<Option<(String, GoogleError)>>,
}
impl SyncState {
    pub fn new() -> Self {
        Self {
            gate: Mutex::new(()),
            plan: Mutex::new(scheduler::Planner::new()),
            wake: Condvar::new(),
            shutdown: AtomicBool::new(false),
            epoch: Mutex::new(String::new()),
            running: AtomicBool::new(false),
            last_error: Mutex::new(None),
        }
    }
}

#[derive(Clone, Serialize)]
pub struct SyncStatus {
    pub database_id: String,
    pub binding: Option<storage::Binding>,
    pub pending_count: i64,
    pub conflict_count: i64,
    pub event_count: i64,
    pub running: bool,
    pub error: Option<GoogleError>,
}

pub fn connection(app: &tauri::AppHandle, id: &str) -> Result<Connection> {
    let state = app.state::<CalendarDb>();
    let active = state.conn.lock().map_err(GoogleError::storage)?;
    let db = active
        .as_ref()
        .filter(|db| db.session_id == id)
        .ok_or_else(|| GoogleError::new("cancelled", "The active task list changed."))?;
    let conn = Connection::open(&db.path).map_err(GoogleError::storage)?;
    conn.busy_timeout(std::time::Duration::from_secs(5))
        .map_err(GoogleError::storage)?;
    conn.execute_batch("PRAGMA foreign_keys=ON;")
        .map_err(GoogleError::storage)?;
    Ok(conn)
}

pub fn active(app: &tauri::AppHandle, id: &str) -> bool {
    let state = app.state::<CalendarDb>();
    let Ok(current) = state.conn.lock() else {
        return false;
    };
    let Some(db) = current.as_ref().filter(|db| db.session_id == id) else {
        return false;
    };
    let epoch = app
        .state::<SyncState>()
        .epoch
        .lock()
        .map(|value| value.clone())
        .unwrap_or_default();
    storage::binding(db)
        .ok()
        .flatten()
        .is_some_and(|binding| binding.enabled && binding.connection_epoch == epoch)
}

pub fn status(app: &tauri::AppHandle, id: &str) -> Result<SyncStatus> {
    let conn = connection(app, id)?;
    let state = app.state::<SyncState>();
    let epoch = state.epoch.lock().map_err(GoogleError::storage)?.clone();
    if storage::binding(&conn)?.is_some_and(|binding| binding.connection_epoch != epoch) {
        conn.execute("UPDATE sync_binding SET enabled=0,pause_reason='Account disconnected; resume this list after reconnecting' WHERE singleton=1",[]).map_err(GoogleError::storage)?;
    }
    let count = |table: &str| {
        conn.query_row(&format!("SELECT count(*) FROM {table}"), [], |row| {
            row.get::<_, i64>(0)
        })
        .map_err(GoogleError::storage)
    };
    let error = state
        .last_error
        .lock()
        .map_err(GoogleError::storage)?
        .as_ref()
        .filter(|(session, _)| session == id)
        .map(|(_, error)| error.clone());
    Ok(SyncStatus {
        database_id: id.into(),
        binding: storage::binding(&conn)?,
        pending_count: count("sync_outbox")?,
        conflict_count: count("sync_conflicts")?,
        event_count: count("timeblocks")?,
        running: state.running.load(Ordering::SeqCst),
        error,
    })
}

fn work(
    app: &tauri::AppHandle,
    id: &str,
    allow_account_change: bool,
    operation: impl FnOnce(&Connection, &mut HttpApi<'_>) -> Result<()>,
) -> Result<SyncStatus> {
    let state = app.state::<SyncState>();
    let _guard = state
        .gate
        .try_lock()
        .map_err(|_| GoogleError::new("busy", "A Google sync operation is already running."))?;
    let conn = connection(app, id)?;
    let auth = app.state::<GoogleAuth>();
    let account = auth.status()?;
    let subject = account
        .subject
        .ok_or_else(|| GoogleError::new("reconnect", "Connect your Google account first."))?;
    if !allow_account_change
        && storage::binding(&conn)?.is_some_and(|binding| binding.subject != subject)
    {
        return Err(GoogleError::new("account_mismatch","Reconnect the Google account linked to this list, or explicitly create a replacement calendar."));
    }
    if !allow_account_change {
        let epoch = state.epoch.lock().map_err(GoogleError::storage)?.clone();
        if storage::binding(&conn)?.is_some_and(|binding| binding.connection_epoch != epoch) {
            return Err(GoogleError::new(
                "paused",
                "Resume this list after reconnecting your Google account.",
            ));
        }
    }
    state.running.store(true, Ordering::SeqCst);
    let started_revision = state.plan.lock().map_err(GoogleError::storage)?.revision;
    if let Ok(status) = status(app, id) {
        let _ = app.emit("google-sync-status", status);
    }
    let result = (|| {
        let mut api = HttpApi::new(auth.inner(), &subject)?;
        operation(&conn, &mut api)
    })();
    state.running.store(false, Ordering::SeqCst);
    *state.last_error.lock().map_err(GoogleError::storage)? = result
        .as_ref()
        .err()
        .filter(|error| error.code != "cancelled")
        .map(|error| (id.into(), error.clone()));
    if let Err(error) = &result {
        if matches!(
            error.code.as_str(),
            "calendar_unavailable" | "permission" | "account_mismatch"
        ) {
            conn.execute(
                "UPDATE sync_binding SET enabled=0,pause_reason=?1 WHERE singleton=1",
                [&error.message],
            )
            .map_err(GoogleError::storage)?;
        }
    } else {
        let _ = app.emit("calendar-changed", serde_json::json!({"database_id":id}));
        if let Ok(mut plan) = state.plan.lock() {
            plan.finish(started_revision, None);
        }
    }
    if let Ok(status) = status(app, id) {
        let _ = app.emit("google-sync-status", status);
    }
    result?;
    status(app, id)
}

pub fn run_sync(app: &tauri::AppHandle, id: &str) -> Result<SyncStatus> {
    work(app, id, false, |conn, api| {
        incoming::pull(conn,api,||active(app,id)).map_err(|error|if error.code=="not_found"{GoogleError::new("calendar_unavailable","The dedicated Google calendar is unavailable. Recover it or explicitly create a replacement in Settings.")}else{error})?;
        engine::push(conn, api, || active(app, id))
    })
}

#[tauri::command]
pub fn google_sync_status(app: tauri::AppHandle, database_id: String) -> Result<SyncStatus> {
    status(&app, &database_id)
}

#[tauri::command]
pub async fn google_enable_sync(
    app: tauri::AppHandle,
    database_id: String,
    list_name: String,
    time_zone: String,
    recovery_calendar_id: Option<String>,
    replace_existing: Option<bool>,
) -> Result<SyncStatus> {
    tauri::async_runtime::spawn_blocking(move || {
        work(&app, &database_id, true, |conn, api| {
            let epoch_before = app
                .state::<SyncState>()
                .epoch
                .lock()
                .map_err(GoogleError::storage)?
                .clone();
            let subject = app
                .state::<GoogleAuth>()
                .status()?
                .subject
                .ok_or_else(|| GoogleError::new("reconnect", "Connect Google first."))?;
            engine::enable(
                conn,
                api,
                &subject,
                &list_name,
                &time_zone,
                recovery_calendar_id.as_deref(),
                replace_existing.unwrap_or(false),
            )?;
            let epoch = app
                .state::<SyncState>()
                .epoch
                .lock()
                .map_err(GoogleError::storage)?
                .clone();
            conn.execute(
                "UPDATE sync_binding SET connection_epoch=?1 WHERE singleton=1",
                [&epoch_before],
            )
            .map_err(GoogleError::storage)?;
            if epoch != epoch_before {
                conn.execute("UPDATE sync_binding SET enabled=0 WHERE singleton=1", [])
                    .map_err(GoogleError::storage)?;
                return Err(GoogleError::new(
                    "cancelled",
                    "Sync setup was paused because the account disconnected.",
                ));
            }
            scheduler::wake(&app, false);
            Ok(())
        })
    })
    .await
    .map_err(|_| GoogleError::new("worker", "The sync setup worker stopped unexpectedly."))?
}

#[tauri::command]
pub async fn google_sync_now(app: tauri::AppHandle, database_id: String) -> Result<SyncStatus> {
    tauri::async_runtime::spawn_blocking(move || run_sync(&app, &database_id))
        .await
        .map_err(|_| GoogleError::new("worker", "The sync worker stopped unexpectedly."))?
}

#[tauri::command]
pub fn google_pause_sync(
    app: tauri::AppHandle,
    database_id: String,
    paused: bool,
) -> Result<SyncStatus> {
    let conn = connection(&app, &database_id)?;
    if !paused {
        let binding = storage::binding(&conn)?
            .ok_or_else(|| GoogleError::new("not_enabled", "Enable sync for this list first."))?;
        let account = app.state::<GoogleAuth>().status()?;
        if account.subject.as_deref() != Some(&binding.subject) {
            return Err(GoogleError::new(
                "account_mismatch",
                "Connect the Google account linked to this calendar before resuming.",
            ));
        }
        let epoch = app
            .state::<SyncState>()
            .epoch
            .lock()
            .map_err(GoogleError::storage)?
            .clone();
        conn.execute(
            "UPDATE sync_binding SET connection_epoch=?1 WHERE singleton=1",
            [epoch],
        )
        .map_err(GoogleError::storage)?;
    }
    conn.execute(
        "UPDATE sync_binding SET enabled=?1,pause_reason=?2 WHERE singleton=1",
        rusqlite::params![!paused, if paused { Some("Paused by you") } else { None }],
    )
    .map_err(GoogleError::storage)?;
    scheduler::wake(&app, false);
    let status = status(&app, &database_id)?;
    let _ = app.emit("google-sync-status", &status);
    Ok(status)
}

#[tauri::command]
pub fn google_conflicts(
    app: tauri::AppHandle,
    database_id: String,
) -> Result<Vec<incoming::ConflictView>> {
    incoming::conflicts(&connection(&app, &database_id)?)
}

#[tauri::command]
pub async fn google_resolve_conflict(
    app: tauri::AppHandle,
    database_id: String,
    local_id: String,
    choice: String,
    revision: i64,
) -> Result<SyncStatus> {
    tauri::async_runtime::spawn_blocking(move || {
        work(&app, &database_id, false, |conn, api| {
            incoming::resolve(conn, api, &local_id, &choice, revision)?;
            scheduler::wake(&app, false);
            Ok(())
        })
    })
    .await
    .map_err(|_| GoogleError::new("worker", "The conflict worker stopped unexpectedly."))?
}

#[tauri::command]
pub fn google_open_event(
    app: tauri::AppHandle,
    database_id: String,
    local_id: String,
) -> Result<()> {
    use rusqlite::OptionalExtension;
    let conn = connection(&app, &database_id)?;
    let id = local_id
        .strip_prefix("virtual_")
        .and_then(|value| value.split_once('_').map(|(parent, _)| parent))
        .unwrap_or(&local_id);
    let saved: Option<Option<String>> = conn
        .query_row(
            "SELECT html_link FROM sync_events WHERE local_id=?1",
            [id],
            |r| r.get(0),
        )
        .optional()
        .map_err(GoogleError::storage)?;
    let link = if let Some(link) = saved.flatten() {
        link
    } else {
        let raw: Option<String> = conn
            .query_row(
                "SELECT remote_json FROM sync_conflicts WHERE local_id=?1",
                [id],
                |r| r.get(0),
            )
            .optional()
            .map_err(GoogleError::storage)?;
        raw.and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
            .and_then(|value| value["htmlLink"].as_str().map(str::to_string))
            .ok_or_else(|| {
                GoogleError::new(
                    "not_synced",
                    "Sync this event first to open it in Google Calendar.",
                )
            })?
    };
    let url = reqwest::Url::parse(&link)
        .map_err(|_| GoogleError::new("invalid_link", "Google returned an invalid event link."))?;
    if url.scheme() != "https"
        || !matches!(
            url.host_str(),
            Some("calendar.google.com" | "www.google.com")
        )
        || !url.path().starts_with("/calendar/")
    {
        return Err(GoogleError::new(
            "invalid_link",
            "The saved event link is not a Google Calendar link.",
        ));
    }
    tauri_plugin_opener::open_url(url.as_str(), None::<&str>)
        .map_err(|_| GoogleError::new("browser", "The Google Calendar event could not be opened."))
}
