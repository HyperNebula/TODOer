use super::{
    commands::{self, SyncState},
    GoogleError, Result,
};
use std::{
    sync::{atomic::Ordering, mpsc},
    time::{Duration, Instant},
};
use tauri::Manager;

const CLOSE_SYNC_BUDGET: Duration = Duration::from_secs(10);

fn timed_out() -> GoogleError {
    GoogleError::new(
        "close_sync_timeout",
        "Closing sync reached its time limit. Remaining changes are saved for the next launch.",
    )
}

fn bounded(
    timeout: Duration,
    operation: impl FnOnce(Instant) -> Result<()> + Send + 'static,
) -> Result<()> {
    let deadline = Instant::now() + timeout;
    let (send, receive) = mpsc::channel();
    std::thread::spawn(move || {
        let _ = send.send(operation(deadline));
    });
    receive
        .recv_timeout(deadline.saturating_duration_since(Instant::now()))
        .map_err(|_| timed_out())?
}

fn wait_for_turn(deadline: Instant, mut sync: impl FnMut() -> Result<()>) -> Result<()> {
    loop {
        if Instant::now() >= deadline {
            return Err(timed_out());
        }
        match sync() {
            Err(error) if error.code == "busy" => {
                std::thread::sleep(
                    Duration::from_millis(25)
                        .min(deadline.saturating_duration_since(Instant::now())),
                );
            }
            result => return result,
        }
    }
}

pub fn sync_before_close(app: &tauri::AppHandle) -> Result<()> {
    let state = app.state::<SyncState>();
    if state.closing.swap(true, Ordering::SeqCst) {
        return Err(GoogleError::new(
            "busy",
            "The app is already finishing its closing sync.",
        ));
    }
    // Stop new background runs while allowing an existing run to finish first.
    state.wake.notify_all();
    let worker_app = app.clone();
    let result = bounded(CLOSE_SYNC_BUDGET, move |deadline| {
        let id = worker_app
            .state::<crate::calendar::CalendarDb>()
            .conn
            .lock()
            .map_err(GoogleError::storage)?
            .as_ref()
            .map(|db| db.session_id.clone());
        let Some(id) = id.filter(|id| commands::active(&worker_app, id)) else {
            return Ok(());
        };
        wait_for_turn(deadline, || {
            commands::run_sync_until(&worker_app, &id, Some(deadline)).map(|_| ())
        })
    });
    state.close_ready.store(true, Ordering::SeqCst);
    state.closing.store(false, Ordering::SeqCst);
    state.wake.notify_all();
    result
}

#[tauri::command]
pub async fn google_sync_before_close(app: tauri::AppHandle) -> Result<()> {
    tauri::async_runtime::spawn_blocking(move || sync_before_close(&app))
        .await
        .map_err(|_| {
            GoogleError::new(
                "worker",
                "Closing sync stopped. Local changes remain saved.",
            )
        })?
}

#[tauri::command]
pub fn google_cancel_close(app: tauri::AppHandle) {
    app.state::<SyncState>()
        .close_ready
        .store(false, Ordering::SeqCst);
    super::scheduler::wake(&app, false);
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn a_blocked_network_worker_cannot_hold_up_close_indefinitely() {
        let (release, waiting) = mpsc::channel();
        let started = Instant::now();
        let result = bounded(Duration::from_millis(20), move |_| {
            let _ = waiting.recv();
            Ok(())
        });
        assert_eq!(result.unwrap_err().code, "close_sync_timeout");
        assert!(started.elapsed() < Duration::from_secs(1));
        release.send(()).unwrap();
    }
    #[test]
    fn waits_for_an_existing_sync_then_makes_one_final_attempt() {
        let mut calls = 0;
        wait_for_turn(Instant::now() + Duration::from_secs(1), || {
            calls += 1;
            if calls < 3 {
                Err(GoogleError::new("busy", "Existing run"))
            } else {
                Ok(())
            }
        })
        .unwrap();
        assert_eq!(calls, 3);
    }
    #[test]
    fn offline_failure_returns_without_a_shutdown_retry_loop() {
        let mut calls = 0;
        let error = wait_for_turn(Instant::now() + Duration::from_secs(1), || {
            calls += 1;
            Err(GoogleError::new("network", "Offline"))
        })
        .unwrap_err();
        assert_eq!(error.code, "network");
        assert_eq!(calls, 1);
    }
}
