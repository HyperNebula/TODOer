use super::{api::CalendarApi, mapping, storage, GoogleError, Result};
use rusqlite::{Connection, OptionalExtension};
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashSet;

pub fn record(
    conn: &Connection,
    id: &str,
    remote_id: &str,
    remote: &Value,
    zone: &str,
) -> Result<()> {
    let base = if remote.is_null() {
        Value::Null
    } else {
        mapping::canonical(remote, zone)?
    };
    conn.execute("INSERT INTO sync_events(local_id,remote_id,etag,base_json,raw_json,html_link) VALUES(?1,?2,?3,?4,?5,?6)
        ON CONFLICT(local_id) DO UPDATE SET remote_id=excluded.remote_id,etag=excluded.etag,base_json=excluded.base_json,raw_json=excluded.raw_json,html_link=excluded.html_link",
        rusqlite::params![id,remote_id,remote["etag"].as_str(),base.to_string(),remote.to_string(),remote["htmlLink"].as_str()]).map_err(GoogleError::storage)?;
    Ok(())
}

pub fn apply(conn: &Connection, id: &str, remote: &Value, zone: &str) -> Result<()> {
    if remote.is_null() || remote["status"] == "cancelled" {
        conn.execute("DELETE FROM timeblocks WHERE id=?1", [id])
            .map_err(GoogleError::storage)?;
    } else {
        storage::write_row(conn, &mapping::local_row(id, remote, zone)?)?;
    }
    Ok(())
}

pub fn merge_event(conn: &Connection, remote: &Value, zone: &str) -> Result<()> {
    let remote_id = remote["id"].as_str().ok_or_else(|| {
        GoogleError::new(
            "invalid_response",
            "Google returned an event without an ID.",
        )
    })?;
    let mappings = storage::mappings(conn)?;
    let mapped = mappings.iter().find(|entry| entry.remote_id == remote_id);
    if mapped.is_none() && remote["status"] == "cancelled" {
        return Ok(());
    }
    let identity = storage::identity(conn)?;
    let id = if let Some(entry) = mapped {
        entry.local_id.clone()
    } else {
        let claimed = remote["extendedProperties"]["private"]["todoerLocalId"].as_str();
        if remote["extendedProperties"]["private"]["todoerCalendarId"].as_str()
            == Some(identity.as_str())
            && claimed.is_some_and(|id| !mappings.iter().any(|entry| entry.local_id == id))
        {
            claimed.unwrap().into()
        } else {
            format!("g{}", mapping::stable_id(&identity, remote_id))
        }
    };
    let local = storage::row(conn, &id)?;
    // Recurring records are imported in Phase 6; retaining the cache makes the upgrade lossless.
    if remote["recurrence"]
        .as_array()
        .is_some_and(|values| !values.is_empty())
        || remote["recurringEventId"].is_string()
        || local
            .as_ref()
            .is_some_and(|row| row.recurrence_rule.is_some() || row.recurrence_id.is_some())
    {
        return Ok(());
    }
    let current = if remote["status"] == "cancelled" {
        Value::Null
    } else {
        match mapping::canonical(remote, zone) {
            Ok(value) => value,
            Err(error) => {
                storage::conflict(conn, &id, remote, &error.code, None)?;
                return Ok(());
            }
        }
    };
    let desired = match local.as_ref().filter(|row| !row.is_deleted) {
        Some(row) => mapping::canonical(&mapping::event_payload(row, zone)?, zone)?,
        None => Value::Null,
    };
    let dirty: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sync_outbox WHERE local_id=?1)",
            [&id],
            |r| r.get(0),
        )
        .map_err(GoogleError::storage)?;
    let previous = mapped.and_then(|entry| entry.base.as_ref());
    if mapped.is_none() {
        conn.execute(
            "INSERT OR IGNORE INTO sync_events(local_id,remote_id) VALUES(?1,?2)",
            [&id, remote_id],
        )
        .map_err(GoogleError::storage)?;
    }
    if dirty && current != desired && Some(&current) != previous {
        storage::conflict(
            conn,
            &id,
            remote,
            if current.is_null() || desired.is_null() {
                "edit_delete"
            } else {
                "changed"
            },
            None,
        )?;
        return Ok(());
    }
    if !dirty || current == desired {
        apply(conn, &id, remote, zone)?;
        conn.execute("DELETE FROM sync_outbox WHERE local_id=?1", [&id])
            .map_err(GoogleError::storage)?;
        conn.execute("DELETE FROM sync_conflicts WHERE local_id=?1", [&id])
            .map_err(GoogleError::storage)?;
    }
    record(conn, &id, remote_id, remote, zone)
}

pub fn pull(conn: &Connection, api: &mut dyn CalendarApi, active: impl Fn() -> bool) -> Result<()> {
    let binding = storage::binding(conn)?
        .ok_or_else(|| GoogleError::new("not_enabled", "Enable sync first."))?;
    if !binding.enabled {
        return Ok(());
    }
    let mut token = binding.sync_token.clone();
    let mut retried = false;
    let (events, next_token, full) = loop {
        let mut events = Vec::new();
        let mut page: Option<String> = None;
        let mut seen_pages = HashSet::new();
        let outcome = loop {
            if !active() {
                return Err(GoogleError::new(
                    "cancelled",
                    "The active task list changed.",
                ));
            }
            match api.list(&binding.calendar_id, token.as_deref(), page.as_deref()) {
                Err(error) if error.code == "gone" && token.is_some() && !retried => break None,
                Err(error) => return Err(error),
                Ok(response) => {
                    let items = response["items"].as_array().ok_or_else(|| {
                        GoogleError::new(
                            "invalid_response",
                            "Google returned an invalid calendar page.",
                        )
                    })?;
                    events.extend(items.iter().cloned());
                    if let Some(next) = response["nextPageToken"].as_str() {
                        if !seen_pages.insert(next.to_string()) {
                            return Err(GoogleError::new("invalid_response","Google repeated a page token; sync stopped without changing the cursor."));
                        }
                        page = Some(next.into());
                    } else {
                        let next = response["nextSyncToken"].as_str().ok_or_else(|| {
                            GoogleError::new(
                                "invalid_response",
                                "Google did not return a completed sync cursor.",
                            )
                        })?;
                        break Some(next.to_string());
                    }
                }
            }
        };
        if let Some(next) = outcome {
            break (events, next, token.is_none());
        }
        token = None;
        retried = true;
    };
    if !active() {
        return Err(GoogleError::new(
            "cancelled",
            "The active task list changed.",
        ));
    }
    storage::importing(conn, |conn| {
        if full {
            let seen: HashSet<_> = events
                .iter()
                .filter_map(|event| event["id"].as_str())
                .collect();
            for entry in storage::mappings(conn)? {
                if entry.base.as_ref().is_some_and(|base| !base.is_null())
                    && !seen.contains(entry.remote_id.as_str())
                {
                    merge_event(
                        conn,
                        &json!({"id":entry.remote_id,"status":"cancelled"}),
                        &binding.time_zone,
                    )?;
                }
            }
            conn.execute("DELETE FROM sync_remote_cache", [])
                .map_err(GoogleError::storage)?;
        }
        for event in &events {
            let id = event["id"].as_str().ok_or_else(|| {
                GoogleError::new(
                    "invalid_response",
                    "Google returned an event without an ID.",
                )
            })?;
            conn.execute("INSERT INTO sync_remote_cache(remote_id,raw_json) VALUES(?1,?2) ON CONFLICT(remote_id) DO UPDATE SET raw_json=excluded.raw_json",rusqlite::params![id,event.to_string()]).map_err(GoogleError::storage)?;
        }
        // Process cached records as well: unsupported records remain recoverable across feature upgrades.
        let mut stmt = conn
            .prepare("SELECT raw_json FROM sync_remote_cache ORDER BY remote_id")
            .map_err(GoogleError::storage)?;
        let cached = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(GoogleError::storage)?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(GoogleError::storage)?;
        drop(stmt);
        let downloaded: HashSet<_> = events
            .iter()
            .filter_map(|event| event["id"].as_str())
            .collect();
        let known = storage::mappings(conn)?;
        for value in cached {
            let event: Value = serde_json::from_str(&value).map_err(GoogleError::storage)?;
            let id = event["id"].as_str().unwrap_or("");
            if downloaded.contains(id) || !known.iter().any(|entry| entry.remote_id == id) {
                merge_event(conn, &event, &binding.time_zone)?;
            }
        }
        conn.execute(
            "UPDATE sync_binding SET sync_token=?1 WHERE singleton=1",
            [next_token],
        )
        .map_err(GoogleError::storage)?;
        Ok(())
    })
}

#[derive(Serialize)]
pub struct ConflictView {
    pub local_id: String,
    pub local: Value,
    pub google: Value,
    pub revision: i64,
    pub kind: String,
    pub series_id: Option<String>,
}
pub fn conflicts(conn: &Connection) -> Result<Vec<ConflictView>> {
    let binding = storage::binding(conn)?
        .ok_or_else(|| GoogleError::new("not_enabled", "Enable sync first."))?;
    let mut stmt = conn
        .prepare("SELECT local_id,remote_json,kind,series_id FROM sync_conflicts ORDER BY local_id")
        .map_err(GoogleError::storage)?;
    let values = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
            ))
        })
        .map_err(GoogleError::storage)?
        .collect::<std::result::Result<Vec<_>, _>>()
        .map_err(GoogleError::storage)?;
    values
        .into_iter()
        .map(|(id, raw, kind, series_id)| {
            let google: Value = serde_json::from_str(&raw).map_err(GoogleError::storage)?;
            let local = match storage::row(conn, &id)?.filter(|row| !row.is_deleted) {
                Some(row) => mapping::canonical(
                    &mapping::event_payload(&row, &binding.time_zone)?,
                    &binding.time_zone,
                )?,
                None => Value::Null,
            };
            let revision = conn
                .query_row(
                    "SELECT revision FROM sync_outbox WHERE local_id=?1",
                    [&id],
                    |r| r.get(0),
                )
                .optional()
                .map_err(GoogleError::storage)?
                .unwrap_or(0);
            Ok(ConflictView {
                local_id: id,
                local,
                google: mapping::canonical(&google, &binding.time_zone).unwrap_or(google),
                revision,
                kind,
                series_id,
            })
        })
        .collect()
}

pub fn resolve(
    conn: &Connection,
    api: &mut dyn CalendarApi,
    id: &str,
    choice: &str,
    revision: i64,
) -> Result<()> {
    if !matches!(choice, "local" | "google") {
        return Err(GoogleError::new(
            "choice",
            "Choose the TODOer or Google version.",
        ));
    }
    let binding = storage::binding(conn)?
        .ok_or_else(|| GoogleError::new("not_enabled", "Enable sync first."))?;
    let stored: Option<String> = conn
        .query_row(
            "SELECT remote_json FROM sync_conflicts WHERE local_id=?1",
            [id],
            |r| r.get(0),
        )
        .optional()
        .map_err(GoogleError::storage)?;
    let stored: Value = serde_json::from_str(&stored.ok_or_else(|| {
        GoogleError::new(
            "conflict_changed",
            "This conflict has already been resolved.",
        )
    })?)
    .map_err(GoogleError::storage)?;
    let entry = storage::mappings(conn)?
        .into_iter()
        .find(|entry| entry.local_id == id)
        .ok_or_else(|| {
            GoogleError::new(
                "unsupported_event",
                "Open this unsupported event in Google Calendar to correct or remove it.",
            )
        })?;
    let remote = match api.get(&binding.calendar_id, &entry.remote_id) {
        Ok(value) => value,
        Err(error) if matches!(error.code.as_str(), "not_found" | "gone") => Value::Null,
        Err(error) => return Err(error),
    };
    let projection = |value: &Value| {
        if value.is_null() {
            Ok(Value::Null)
        } else {
            mapping::canonical(value, &binding.time_zone)
        }
    };
    if projection(&remote)? != projection(&stored)? {
        storage::conflict(conn, id, &remote, "changed", None)?;
        return Err(GoogleError::new(
            "conflict_changed",
            "Google changed this event again. Review the updated versions before choosing.",
        ));
    }
    storage::importing(conn, |conn| {
        let current: i64 = conn
            .query_row(
                "SELECT revision FROM sync_outbox WHERE local_id=?1",
                [id],
                |r| r.get(0),
            )
            .optional()
            .map_err(GoogleError::storage)?
            .unwrap_or(0);
        if current != revision {
            return Err(GoogleError::new(
                "conflict_changed",
                "The local event changed again. Review the updated versions before choosing.",
            ));
        }
        if choice == "google" {
            apply(conn, id, &remote, &binding.time_zone)?;
            record(conn, id, &entry.remote_id, &remote, &binding.time_zone)?;
            conn.execute("DELETE FROM sync_outbox WHERE local_id=?1", [id])
                .map_err(GoogleError::storage)?;
        } else {
            if remote.is_null() || remote["status"] == "cancelled" {
                let mut bytes = [0u8; 16];
                getrandom::fill(&mut bytes).map_err(|_| {
                    GoogleError::new("randomness", "Could not create a new event identity.")
                })?;
                let fresh =
                    mapping::stable_id(&storage::identity(conn)?, &format!("{id}:{bytes:x?}"));
                conn.execute("UPDATE sync_events SET remote_id=?2,etag=NULL,base_json=NULL,raw_json=NULL,html_link=NULL WHERE local_id=?1",[id,&fresh]).map_err(GoogleError::storage)?;
            } else {
                record(conn, id, &entry.remote_id, &remote, &binding.time_zone)?;
            }
            conn.execute(
                "UPDATE sync_control SET revision=revision+1 WHERE singleton=1",
                [],
            )
            .map_err(GoogleError::storage)?;
            let deleted = storage::row(conn, id)?.is_none_or(|row| row.is_deleted);
            conn.execute("INSERT INTO sync_outbox(local_id,revision,deleted) VALUES(?1,(SELECT revision FROM sync_control WHERE singleton=1),?2) ON CONFLICT(local_id) DO UPDATE SET revision=excluded.revision,deleted=excluded.deleted",rusqlite::params![id,deleted]).map_err(GoogleError::storage)?;
        }
        conn.execute("DELETE FROM sync_conflicts WHERE local_id=?1", [id])
            .map_err(GoogleError::storage)?;
        Ok(())
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::google_calendar::{
        engine,
        testing::{db, local, FakeApi},
    };
    fn day(id: &str) -> Value {
        json!({"id":id,"etag":"v1","summary":"Phone day","start":{"date":"2026-01-01"},"end":{"date":"2026-01-03"}})
    }
    #[test]
    fn imports_all_day_events_without_echoing_them() {
        let db = db();
        let mut api = FakeApi::default();
        api.pages
            .push_back(Ok(json!({"items":[day("phone")],"nextSyncToken":"new"})));
        pull(&db, &mut api, || true).unwrap();
        let rows = storage::rows(&db).unwrap();
        assert_eq!(rows.len(), 1);
        assert!(rows[0].all_day);
        assert_eq!(rows[0].end_time, "2026-01-03");
        assert!(storage::pending(&db).unwrap().is_empty());
    }
    #[test]
    fn pagination_failure_keeps_the_old_cursor_and_no_partial_imports() {
        let db = db();
        db.execute("UPDATE sync_binding SET sync_token='old'", [])
            .unwrap();
        let mut api = FakeApi::default();
        api.pages
            .push_back(Ok(json!({"items":[day("first")],"nextPageToken":"page2"})));
        api.pages
            .push_back(Err(GoogleError::new("network", "Interrupted")));
        assert!(pull(&db, &mut api, || true).is_err());
        assert!(storage::rows(&db).unwrap().is_empty());
        assert_eq!(
            storage::binding(&db)
                .unwrap()
                .unwrap()
                .sync_token
                .as_deref(),
            Some("old")
        );
        api.pages
            .push_back(Ok(json!({"items":[day("first")],"nextPageToken":"page2"})));
        api.pages
            .push_back(Ok(json!({"items":[day("second")],"nextSyncToken":"new"})));
        pull(&db, &mut api, || true).unwrap();
        assert_eq!(storage::rows(&db).unwrap().len(), 2);
        assert_eq!(
            api.list_calls[1],
            (Some("old".into()), Some("page2".into()))
        );
        assert_eq!(
            storage::binding(&db)
                .unwrap()
                .unwrap()
                .sync_token
                .as_deref(),
            Some("new")
        );
    }
    #[test]
    fn expired_tokens_trigger_full_resync_without_erasing_dirty_local_events() {
        let db = db();
        local(&db, "one");
        local(&db, "two");
        let mut api = FakeApi::default();
        engine::push(&db, &mut api, || true).unwrap();
        db.execute("UPDATE sync_binding SET sync_token='expired'", [])
            .unwrap();
        db.execute(
            "UPDATE timeblocks SET title='Keep local' WHERE id='one'",
            [],
        )
        .unwrap();
        let second = storage::mappings(&db)
            .unwrap()
            .into_iter()
            .find(|mapping| mapping.local_id == "two")
            .unwrap();
        api.pages
            .push_back(Err(GoogleError::new("gone", "Expired")));
        api.pages.push_back(Ok(
            json!({"items":[api.events[&second.remote_id]],"nextSyncToken":"fresh"}),
        ));
        pull(&db, &mut api, || true).unwrap();
        assert_eq!(
            storage::row(&db, "one").unwrap().unwrap().title,
            "Keep local"
        );
        assert_eq!(conflicts(&db).unwrap().len(), 1);
        assert_eq!(api.list_calls[1], (None, None));
    }
    #[test]
    fn conflict_resolution_rechecks_local_revision_and_google_version() {
        let db = db();
        local(&db, "one");
        let mut api = FakeApi::default();
        engine::push(&db, &mut api, || true).unwrap();
        let remote_id = storage::mappings(&db).unwrap()[0].remote_id.clone();
        db.execute("INSERT INTO timeblock_tasks VALUES('one','task')", [])
            .unwrap();
        db.execute(
            "UPDATE timeblocks SET title='Desktop',completed=1 WHERE id='one'",
            [],
        )
        .unwrap();
        api.events.get_mut(&remote_id).unwrap()["summary"] = json!("Phone");
        storage::importing(&db, |db| merge_event(db, &api.events[&remote_id], "UTC")).unwrap();
        let old = conflicts(&db).unwrap().remove(0);
        db.execute(
            "UPDATE timeblocks SET title='Newer desktop' WHERE id='one'",
            [],
        )
        .unwrap();
        assert_eq!(
            resolve(&db, &mut api, "one", "local", old.revision)
                .unwrap_err()
                .code,
            "conflict_changed"
        );
        let current = conflicts(&db).unwrap().remove(0);
        api.events.get_mut(&remote_id).unwrap()["summary"] = json!("Newer phone");
        assert_eq!(
            resolve(&db, &mut api, "one", "google", current.revision)
                .unwrap_err()
                .code,
            "conflict_changed"
        );
        let current = conflicts(&db).unwrap().remove(0);
        resolve(&db, &mut api, "one", "google", current.revision).unwrap();
        assert_eq!(
            storage::row(&db, "one").unwrap().unwrap().title,
            "Newer phone"
        );
        assert!(storage::row(&db, "one").unwrap().unwrap().completed);
        assert!(storage::pending(&db).unwrap().is_empty());
        assert_eq!(
            db.query_row(
                "SELECT task_id FROM timeblock_tasks WHERE timeblock_id='one'",
                [],
                |r| r.get::<_, String>(0)
            )
            .unwrap(),
            "task"
        );
    }
    #[test]
    fn keeping_local_after_remote_deletion_allocates_a_fresh_google_identity() {
        let db = db();
        local(&db, "one");
        let mut api = FakeApi::default();
        engine::push(&db, &mut api, || true).unwrap();
        let old = storage::mappings(&db).unwrap()[0].remote_id.clone();
        api.events.get_mut(&old).unwrap()["status"] = json!("cancelled");
        db.execute(
            "UPDATE timeblocks SET title='Restore local' WHERE id='one'",
            [],
        )
        .unwrap();
        storage::importing(&db, |db| merge_event(db, &api.events[&old], "UTC")).unwrap();
        let conflict = conflicts(&db).unwrap().remove(0);
        resolve(&db, &mut api, "one", "local", conflict.revision).unwrap();
        assert_ne!(storage::mappings(&db).unwrap()[0].remote_id, old);
        engine::push(&db, &mut api, || true).unwrap();
        assert!(storage::pending(&db).unwrap().is_empty());
        assert_eq!(api.events.len(), 2);
    }
}
