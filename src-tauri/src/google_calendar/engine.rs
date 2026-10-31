use super::{api::CalendarApi, mapping, recurrence, storage, GoogleError, Result};
use rusqlite::Connection;
use serde_json::{json, Value};

pub fn enable(
    conn: &Connection,
    api: &mut dyn CalendarApi,
    subject: &str,
    name: &str,
    zone: &str,
    recovery: Option<&str>,
    replace: bool,
) -> Result<()> {
    zone.parse::<chrono_tz::Tz>()
        .map_err(|_| GoogleError::new("time_zone", "Choose a valid IANA calendar time zone."))?;
    let existing = storage::binding(conn)?;
    if existing.as_ref().is_some_and(|b| b.subject != subject) && !replace {
        return Err(GoogleError::new("account_mismatch", "This list is connected to another account. Explicitly create a replacement calendar to use this account."));
    }
    // Validate the entire legacy schedule before any remote calendar is created.
    let mut normalized = storage::rows(conn)?;
    for row in &mut normalized {
        mapping::normalize_legacy(row, zone)?;
    }
    let identity = storage::identity(conn)?;
    let calendar = if let Some(recovery) = recovery.filter(|id| !id.trim().is_empty()) {
        let value = api.calendar(recovery)?;
        if value["description"].as_str() != Some(&format!("TODOer:{identity}")) {
            return Err(GoogleError::new(
                "recovery",
                "That calendar does not belong to this TODOer list.",
            ));
        }
        recovery.to_string()
    } else if let Some(binding) = existing
        .as_ref()
        .filter(|b| b.setup_state == "ready" && b.subject == subject && !replace)
    {
        api.calendar(&binding.calendar_id)?;
        binding.calendar_id.clone()
    } else {
        if existing
            .as_ref()
            .is_some_and(|b| b.setup_state == "creating")
            && !replace
        {
            return Err(GoogleError::new("setup_recovery", "Calendar creation was interrupted. Recover its calendar ID from Google Calendar settings, or explicitly retry creation."));
        }
        storage::importing(conn, |conn| {
            storage::clear_binding(conn)?;
            conn.execute(
                "INSERT INTO sync_binding(singleton,subject,time_zone) VALUES(1,?1,?2)",
                [subject, zone],
            )
            .map_err(GoogleError::storage)?;
            Ok(())
        })?;
        let created = api.create_calendar(
            &format!("TODOer — {}", name.chars().take(120).collect::<String>()),
            zone,
            &identity,
        )?;
        let id=created["id"].as_str().ok_or_else(||GoogleError::new("setup_recovery","Google did not return the created calendar ID. Recover it from Google Calendar settings."))?;
        // Persist the ID immediately, including if the active list changed during the request.
        conn.execute("UPDATE sync_binding SET calendar_id=?1,setup_state='ready',enabled=0 WHERE singleton=1",[id]).map_err(GoogleError::storage)?;
        id.into()
    };
    let same_binding = existing.as_ref().is_some_and(|binding| {
        binding.calendar_id == calendar
            && binding.subject == subject
            && binding.setup_state == "ready"
    });
    storage::importing(conn, |conn| {
        if existing.as_ref().is_some_and(|b| b.calendar_id != calendar) {
            storage::clear_binding(conn)?;
        }
        // Re-read local rows: edits may have occurred while Google created the calendar.
        for mut row in storage::rows(conn)? {
            mapping::normalize_legacy(&mut row, zone)?;
            storage::write_row(conn, &row)?;
        }
        conn.execute("INSERT INTO sync_binding(singleton,subject,calendar_id,time_zone,enabled,setup_state) VALUES(1,?1,?2,?3,1,'ready')
            ON CONFLICT(singleton) DO UPDATE SET subject=excluded.subject,calendar_id=excluded.calendar_id,time_zone=excluded.time_zone,enabled=1,setup_state='ready',pause_reason=NULL",
            [subject,&calendar,zone]).map_err(GoogleError::storage)?;
        conn.execute("INSERT INTO calendar_metadata(key,value) VALUES('display_time_zone',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[zone]).map_err(GoogleError::storage)?;
        if !same_binding {
            storage::queue_all(conn)?;
        }
        Ok(())
    })
}

fn current_remote(api: &mut dyn CalendarApi, calendar: &str, id: &str) -> Result<Value> {
    match api.get(calendar, id) {
        Ok(value) => Ok(value),
        Err(error) if matches!(error.code.as_str(), "not_found" | "gone") => Ok(Value::Null),
        Err(error) => Err(error),
    }
}

pub fn push(conn: &Connection, api: &mut dyn CalendarApi, active: impl Fn() -> bool) -> Result<()> {
    let binding = storage::binding(conn)?
        .ok_or_else(|| GoogleError::new("not_enabled", "Enable sync for this task list first."))?;
    if !binding.enabled {
        return Ok(());
    }
    api.calendar(&binding.calendar_id).map_err(|error| if matches!(error.code.as_str(),"not_found"|"gone") { GoogleError::new("calendar_unavailable","The dedicated Google calendar was removed. Your local schedule is intact. Recover or explicitly replace its calendar in Settings.") } else { error })?;
    let mut operations = storage::pending(conn)?;
    operations.sort_by_key(|operation| {
        (
            if operation.deleted {
                if operation.parent_id.is_some() {
                    2
                } else {
                    3
                }
            } else if operation.parent_id.is_some() {
                1
            } else {
                0
            },
            operation.revision,
        )
    });
    for pending in operations {
        if !storage::pending(conn)?
            .iter()
            .any(|entry| entry.local_id == pending.local_id)
        {
            continue;
        }
        if !storage::binding(conn)?.is_some_and(|binding| binding.enabled) {
            return Ok(());
        }
        if !active() {
            return Err(GoogleError::new(
                "cancelled",
                "The active task list changed. Remaining changes will sync when it is reopened.",
            ));
        }
        let row = storage::row(conn, &pending.local_id)?;
        let entry = if let Some(row) = row.as_ref().filter(|row| row.recurrence_id.is_some()) {
            match recurrence::ensure_instance(conn, api, row, &binding)? {
                Some(entry) => entry,
                None => continue,
            }
        } else {
            storage::ensure_mapping(conn, &pending.local_id)?
        };
        let deleted = pending.deleted || row.is_none();
        if deleted {
            let remote = current_remote(api, &binding.calendar_id, &entry.remote_id)?;
            if !remote.is_null() && remote["status"] != "cancelled" {
                if entry.base.is_none() {
                    storage::conflict(conn, &pending.local_id, &remote, "edit_delete", None)?;
                    continue;
                }
                if let Some(base) = &entry.base {
                    if mapping::canonical(&remote, &binding.time_zone)? != *base {
                        storage::conflict(conn, &pending.local_id, &remote, "edit_delete", None)?;
                        continue;
                    }
                }
                if !active() {
                    return Err(GoogleError::new(
                        "cancelled",
                        "Sync was paused or the active list changed.",
                    ));
                }
                match api.delete(
                    &binding.calendar_id,
                    &entry.remote_id,
                    remote["etag"].as_str(),
                ) {
                    Ok(()) => (),
                    Err(error) if matches!(error.code.as_str(), "not_found" | "gone") => (),
                    Err(error) if error.code == "precondition" => {
                        let remote = current_remote(api, &binding.calendar_id, &entry.remote_id)?;
                        storage::conflict(conn, &pending.local_id, &remote, "edit_delete", None)?;
                        continue;
                    }
                    Err(error) => return Err(error),
                }
            }
            storage::acknowledge(
                conn,
                &storage::Pending {
                    deleted: true,
                    ..pending
                },
                &Value::Null,
                &binding.time_zone,
            )?;
            continue;
        }
        let mut payload = recurrence::payload(conn, row.as_ref().unwrap(), &binding.time_zone)?;
        let desired = mapping::canonical(&payload, &binding.time_zone)?;
        let response = if entry.base.is_some() {
            let mut remote = current_remote(api, &binding.calendar_id, &entry.remote_id)?;
            let current = if remote.is_null() {
                Value::Null
            } else {
                mapping::canonical(&remote, &binding.time_zone)?
            };
            if current == desired {
                if entry
                    .raw
                    .as_ref()
                    .is_some_and(|raw| raw["_todoerDefaultInstance"] == true)
                {
                    remote["_todoerDefaultInstance"] = json!(true);
                }
                storage::acknowledge(conn, &pending, &remote, &binding.time_zone)?;
                continue;
            }
            if Some(&current) != entry.base.as_ref()
                || remote.is_null()
                || remote["status"] == "cancelled"
            {
                storage::conflict(conn, &pending.local_id, &remote, "changed", None)?;
                continue;
            }
            let etag = remote["etag"].as_str().ok_or_else(|| {
                GoogleError::new(
                    "invalid_response",
                    "Google returned an event without a version.",
                )
            })?;
            let mut patch = payload.clone();
            patch.as_object_mut().unwrap().remove("recurringEventId");
            patch.as_object_mut().unwrap().remove("originalStartTime");
            if row.as_ref().unwrap().recurrence_id.is_some() {
                patch.as_object_mut().unwrap().remove("recurrence");
            }
            if !active() {
                return Err(GoogleError::new(
                    "cancelled",
                    "Sync was paused or the active list changed.",
                ));
            }
            api.patch(&binding.calendar_id, &entry.remote_id, &patch, etag)
        } else {
            payload["id"] = json!(entry.remote_id);
            payload["extendedProperties"] = json!({"private":{"todoerLocalId":pending.local_id,"todoerCalendarId":storage::identity(conn)?}});
            if !active() {
                return Err(GoogleError::new(
                    "cancelled",
                    "Sync was paused or the active list changed.",
                ));
            }
            match api.insert(&binding.calendar_id, &payload) {
                Err(error) if error.code == "already_exists" => {
                    let remote = api.get(&binding.calendar_id, &entry.remote_id)?;
                    if mapping::canonical(&remote, &binding.time_zone)? == desired {
                        Ok(remote)
                    } else {
                        storage::conflict(conn, &pending.local_id, &remote, "changed", None)?;
                        continue;
                    }
                }
                result => result,
            }
        };
        match response {
            Ok(remote) => storage::acknowledge(conn, &pending, &remote, &binding.time_zone)?,
            Err(error) if matches!(error.code.as_str(), "precondition" | "not_found" | "gone") => {
                let remote = current_remote(api, &binding.calendar_id, &entry.remote_id)?;
                storage::conflict(conn, &pending.local_id, &remote, "changed", None)?;
            }
            Err(error) => return Err(error),
        }
    }
    conn.execute(
        "UPDATE sync_binding SET last_success=?1,pause_reason=NULL WHERE singleton=1",
        [chrono::Utc::now().to_rfc3339()],
    )
    .map_err(GoogleError::storage)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::google_calendar::testing::{db, local, FakeApi};
    #[test]
    fn lost_response_then_process_restart_keeps_the_mapping_and_outbox() {
        let path = std::env::temp_dir().join(format!(
            "todoer-restart-{}-{}.db",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let mut api = FakeApi {
            fail_after_write: true,
            ..Default::default()
        };
        let identity;
        let remote_id;
        {
            let db = db();
            local(&db, "one");
            assert!(push(&db, &mut api, || true).is_err());
            identity = storage::identity(&db).unwrap();
            remote_id = storage::mappings(&db).unwrap()[0].remote_id.clone();
            db.backup(rusqlite::DatabaseName::Main, &path, None)
                .unwrap();
        }
        {
            let mut db = Connection::open(&path).unwrap();
            crate::calendar::migrate(&mut db).unwrap();
            assert_eq!(storage::identity(&db).unwrap(), identity);
            assert_eq!(storage::mappings(&db).unwrap()[0].remote_id, remote_id);
            assert_eq!(storage::pending(&db).unwrap().len(), 1);
            push(&db, &mut api, || true).unwrap();
            assert_eq!(api.events.len(), 1);
            assert_eq!(api.writes, 1);
            assert!(storage::pending(&db).unwrap().is_empty());
        }
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn missing_calendar_preserves_local_schedule_and_pending_changes() {
        let db = db();
        local(&db, "one");
        let mut api = FakeApi {
            missing_calendar: true,
            ..Default::default()
        };
        assert_eq!(
            push(&db, &mut api, || true).unwrap_err().code,
            "calendar_unavailable"
        );
        assert_eq!(storage::rows(&db).unwrap().len(), 1);
        assert_eq!(storage::pending(&db).unwrap().len(), 1);
        assert_eq!(api.writes, 0);
    }

    #[test]
    fn recovering_the_same_binding_does_not_queue_unchanged_local_events() {
        let db = db();
        local(&db, "one");
        let mut api = FakeApi::default();
        push(&db, &mut api, || true).unwrap();
        api.events.values_mut().next().unwrap()["summary"] = json!("Phone edit");
        enable(&db, &mut api, "user", "List", "UTC", None, false).unwrap();
        assert!(storage::pending(&db).unwrap().is_empty());
    }
    #[test]
    fn lost_insert_response_retries_without_duplicates() {
        let db = db();
        local(&db, "one");
        let mut api = FakeApi {
            fail_after_write: true,
            ..Default::default()
        };
        assert!(push(&db, &mut api, || true).is_err());
        assert_eq!(storage::pending(&db).unwrap().len(), 1);
        push(&db, &mut api, || true).unwrap();
        assert_eq!(api.events.len(), 1);
        assert!(storage::pending(&db).unwrap().is_empty());
    }
    #[test]
    fn an_edit_during_upload_is_retained_for_the_next_run() {
        let db = db();
        local(&db, "one");
        let mut api = FakeApi {
            on_write: Some(Box::new(|| {
                db.execute("UPDATE timeblocks SET title='Newer' WHERE id='one'", [])
                    .unwrap();
            })),
            ..Default::default()
        };
        push(&db, &mut api, || true).unwrap();
        assert_eq!(storage::pending(&db).unwrap().len(), 1);
        api.on_write = None;
        push(&db, &mut api, || true).unwrap();
        assert!(storage::pending(&db).unwrap().is_empty());
        assert_eq!(api.events.values().next().unwrap()["summary"], "Newer");
    }
    #[test]
    fn remote_edits_are_not_silently_overwritten() {
        let db = db();
        local(&db, "one");
        let mut api = FakeApi::default();
        push(&db, &mut api, || true).unwrap();
        api.events.values_mut().next().unwrap()["summary"] = json!("Phone edit");
        db.execute(
            "UPDATE timeblocks SET title='Desktop edit' WHERE id='one'",
            [],
        )
        .unwrap();
        push(&db, &mut api, || true).unwrap();
        assert_eq!(api.events.values().next().unwrap()["summary"], "Phone edit");
        assert_eq!(
            db.query_row("SELECT count(*) FROM sync_conflicts", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            1
        );
    }
    #[test]
    fn local_patch_preserves_google_only_details_and_save_as_clears_bindings() {
        let db = db();
        local(&db, "one");
        let mut api = FakeApi::default();
        push(&db, &mut api, || true).unwrap();
        api.events.values_mut().next().unwrap()["attendees"] =
            json!([{"email":"guest@example.com"}]);
        db.execute("UPDATE timeblocks SET title='Updated' WHERE id='one'", [])
            .unwrap();
        push(&db, &mut api, || true).unwrap();
        assert_eq!(
            api.events.values().next().unwrap()["attendees"][0]["email"],
            "guest@example.com"
        );
        storage::clear_binding(&db).unwrap();
        assert!(storage::binding(&db).unwrap().is_none());
        assert_eq!(storage::rows(&db).unwrap().len(), 1);
    }
}
