use super::{api::CalendarApi, incoming, mapping, storage, GoogleError, Result};
use crate::calendar::TimeblockRow;
use chrono::{DateTime, Duration, NaiveDate, SecondsFormat};
use rusqlite::Connection;
use serde_json::{json, Value};

pub fn occurrence_key(value: &Value, zone: &str) -> Result<String> {
    if let Some(date) = value["date"].as_str() {
        return Ok(date.into());
    }
    let value = value["dateTime"].as_str().ok_or_else(|| {
        GoogleError::new(
            "recurrence",
            "A recurring event has no original occurrence time.",
        )
    })?;
    Ok(DateTime::parse_from_rfc3339(&mapping::zoned(value, zone)?)
        .unwrap()
        .with_timezone(&chrono::Utc)
        .to_rfc3339_opts(SecondsFormat::AutoSi, true))
}

pub fn original_time(value: &str, zone: &str) -> Result<Value> {
    if value.len() == 10 {
        Ok(json!({"date":value}))
    } else {
        Ok(json!({"dateTime":mapping::zoned(value,zone)?,"timeZone":zone}))
    }
}

pub fn payload(conn: &Connection, row: &TimeblockRow, zone: &str) -> Result<Value> {
    let mut value = mapping::event_payload(row, zone)?;
    if let Some(parent) = &row.recurrence_id {
        let parent_map = storage::ensure_mapping(conn, parent)?;
        let parent_row = storage::row(conn, parent)?;
        let event_zone = parent_row
            .as_ref()
            .and_then(|row| row.time_zone.as_deref())
            .unwrap_or(zone);
        let original = row.original_start.as_deref().ok_or_else(|| {
            GoogleError::new("recurrence", "A recurring exception has no original start.")
        })?;
        value["recurringEventId"] = json!(parent_map.remote_id);
        value["originalStartTime"] = original_time(original, event_zone)?;
    }
    Ok(value)
}

pub fn inherited(parent: &TimeblockRow, original: &str, zone: &str) -> Result<TimeblockRow> {
    let mut row = parent.clone();
    row.recurrence_rule = None;
    row.recurrence_id = Some(parent.id.clone());
    row.original_start = Some(original.into());
    row.start_time = original.into();
    row.is_deleted = false;
    row.end_time = if parent.all_day {
        let parse = |value: &str| {
            NaiveDate::parse_from_str(value, "%Y-%m-%d").map_err(GoogleError::storage)
        };
        (parse(original)? + (parse(&parent.end_time)? - parse(&parent.start_time)?))
            .format("%Y-%m-%d")
            .to_string()
    } else {
        let parse = |value: &str| {
            DateTime::parse_from_rfc3339(&mapping::zoned(
                value,
                parent.time_zone.as_deref().unwrap_or(zone),
            )?)
            .map_err(GoogleError::storage)
        };
        (parse(original)? + (parse(&parent.end_time)? - parse(&parent.start_time)?))
            .to_rfc3339_opts(SecondsFormat::AutoSi, false)
    };
    Ok(row)
}

pub enum InstanceLookup {
    Ready(storage::EventMapping),
    Deferred,
    ParentAbsent,
}

pub fn ensure_instance(
    conn: &Connection,
    api: &mut dyn CalendarApi,
    row: &TimeblockRow,
    binding: &storage::Binding,
) -> Result<InstanceLookup> {
    let parent_id = row.recurrence_id.as_deref().unwrap();
    let existing = storage::mappings(conn)?
        .into_iter()
        .find(|entry| entry.local_id == row.id);
    if existing.as_ref().is_some_and(|entry| {
        entry.base.is_some()
            && (entry.etag.is_some() || entry.base.as_ref().is_some_and(Value::is_null))
    }) {
        return Ok(InstanceLookup::Ready(existing.unwrap()));
    }
    let parent_map = storage::ensure_mapping(conn, parent_id)?;
    let parent = storage::row(conn, parent_id)?;
    if row.is_deleted && parent.is_none() && existing.is_none() {
        // Legacy calendars can retain deletion markers after their series was
        // removed. There is no instance identity to upload, and waiting for the
        // absent parent leaves this queue entry stuck forever. Confirm Google
        // has no live parent before considering the deletion finished.
        match api.get(&binding.calendar_id, &parent_map.remote_id) {
            Ok(remote) if remote["status"] == "cancelled" => {
                return Ok(InstanceLookup::ParentAbsent);
            }
            Err(error) if matches!(error.code.as_str(), "not_found" | "gone") => {
                return Ok(InstanceLookup::ParentAbsent);
            }
            Err(error) => return Err(error),
            Ok(remote) => {
                storage::conflict(conn, parent_id, &remote, "edit_delete", Some(parent_id))?;
                return Ok(InstanceLookup::Deferred);
            }
        }
    }
    if parent_map.base.is_none() {
        return Ok(InstanceLookup::Deferred);
    }
    let parent = parent
        .ok_or_else(|| GoogleError::new("recurrence", "The recurring parent is unavailable."))?;
    let zone = parent.time_zone.as_deref().unwrap_or(&binding.time_zone);
    let original = row.original_start.as_deref().ok_or_else(|| {
        GoogleError::new("recurrence", "A recurring exception has no original start.")
    })?;
    let original_value = original_time(original, zone)?;
    let key = occurrence_key(&original_value, zone)?;
    let instant = if original.len() == 10 {
        mapping::zoned(&format!("{original}T12:00:00"), zone)?
    } else {
        mapping::zoned(original, zone)?
    };
    let instant = DateTime::parse_from_rfc3339(&instant).unwrap();
    let start = (instant - Duration::days(2)).to_rfc3339();
    let end = (instant + Duration::days(2)).to_rfc3339();
    let mut page = None;
    loop {
        let response = api.instances(
            &binding.calendar_id,
            &parent_map.remote_id,
            &start,
            &end,
            page.as_deref(),
        )?;
        let items = response["items"].as_array().ok_or_else(|| {
            GoogleError::new(
                "invalid_response",
                "Google returned an invalid recurrence page.",
            )
        })?;
        for item in items {
            if occurrence_key(&item["originalStartTime"], zone)? != key {
                continue;
            }
            let remote_id = item["id"].as_str().ok_or_else(|| {
                GoogleError::new(
                    "invalid_response",
                    "Google returned an instance without an ID.",
                )
            })?;
            let mut remote = item.clone();
            let current = mapping::canonical(item, &binding.time_zone)?;
            let expected = mapping::canonical(
                &payload(
                    conn,
                    &inherited(&parent, original, &binding.time_zone)?,
                    &binding.time_zone,
                )?,
                &binding.time_zone,
            )?;
            let desired = if row.is_deleted {
                Value::Null
            } else {
                mapping::canonical(&payload(conn, row, &binding.time_zone)?, &binding.time_zone)?
            };
            conn.execute("INSERT INTO sync_events(local_id,remote_id) VALUES(?1,?2) ON CONFLICT(local_id) DO UPDATE SET remote_id=excluded.remote_id",[&row.id,remote_id]).map_err(GoogleError::storage)?;
            if current != expected && current != desired {
                storage::conflict(conn, &row.id, item, "changed", Some(parent_id))?;
                return Ok(InstanceLookup::Deferred);
            }
            if current == expected {
                remote["_todoerDefaultInstance"] = json!(true);
            }
            incoming::record(conn, &row.id, remote_id, &remote, &binding.time_zone)?;
            return Ok(storage::mappings(conn)?
                .into_iter()
                .find(|entry| entry.local_id == row.id)
                .map(InstanceLookup::Ready)
                .unwrap_or(InstanceLookup::Deferred));
        }
        match response["nextPageToken"].as_str() {
            Some(next) if page.as_deref() != Some(next) => page = Some(next.to_string()),
            _ => break,
        }
    }
    storage::conflict(
        conn,
        &row.id,
        &Value::Null,
        "missing_instance",
        Some(parent_id),
    )?;
    Ok(InstanceLookup::Deferred)
}

pub fn parent_local_id(conn: &Connection, event: &Value) -> Result<Option<String>> {
    let Some(remote) = event["recurringEventId"].as_str() else {
        return Ok(None);
    };
    storage::mappings(conn)?
        .into_iter()
        .find(|entry| entry.remote_id == remote)
        .map(|entry| Some(entry.local_id))
        .ok_or_else(|| {
            GoogleError::new(
                "recurrence",
                "Google returned an exception before its recurring parent. Sync will retry.",
            )
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::google_calendar::{
        engine,
        testing::{db, local, FakeApi},
    };
    fn series(db: &Connection) {
        local(db, "series");
        db.execute(
            "UPDATE timeblocks SET recurrence_rule='RRULE:FREQ=DAILY' WHERE id='series'",
            [],
        )
        .unwrap();
    }
    fn instance(parent: &str) -> Value {
        json!({"id":"instance","etag":"instance-v1","summary":"Local","description":"","recurringEventId":parent,"originalStartTime":{"dateTime":"2026-01-02T09:00:00Z"},"start":{"dateTime":"2026-01-02T09:00:00Z","timeZone":"UTC"},"end":{"dateTime":"2026-01-02T10:00:00Z","timeZone":"UTC"}})
    }
    #[test]
    fn keeping_a_locally_edited_cancelled_instance_restores_it_without_a_conflict_loop() {
        let db = db();
        series(&db);
        let mut api = FakeApi::default();
        engine::push(&db, &mut api, || true).unwrap();
        let parent = storage::mappings(&db).unwrap()[0].remote_id.clone();
        let mut cancelled = instance(&parent);
        cancelled["status"] = json!("cancelled");
        api.instance_events.push(cancelled);
        db.execute("INSERT INTO timeblocks(id,title,start_time,end_time,time_zone,recurrence_id,original_start) VALUES('exception','Keep desktop','2026-01-02T11:00:00Z','2026-01-02T12:00:00Z','UTC','series','2026-01-02T09:00:00Z')", []).unwrap();
        engine::push(&db, &mut api, || true).unwrap();
        let conflict = incoming::conflicts(&db).unwrap().remove(0);
        incoming::resolve(&db, &mut api, "exception", "local", conflict.revision).unwrap();
        api.pages.push_back(Ok(json!({"items":[api.events[&parent],api.events["instance"]],"nextSyncToken":"after-resolution"})));
        incoming::pull(&db, &mut api, || true).unwrap();
        engine::push(&db, &mut api, || true).unwrap();
        assert!(incoming::conflicts(&db).unwrap().is_empty());
        assert!(storage::pending(&db).unwrap().is_empty());
        assert_eq!(api.events["instance"]["status"], "confirmed");
        assert_eq!(api.events["instance"]["summary"], "Keep desktop");
        assert_eq!(api.events.len(), 2);
    }
    #[test]
    fn uploads_master_once_and_patches_an_instance_instead_of_inserting_it() {
        let db = db();
        series(&db);
        let mut api = FakeApi::default();
        engine::push(&db, &mut api, || true).unwrap();
        let parent = storage::mappings(&db).unwrap()[0].remote_id.clone();
        api.instance_events.push(instance(&parent));
        db.execute("INSERT INTO timeblocks(id,title,start_time,end_time,time_zone,recurrence_id,original_start) VALUES('exception','Changed instance','2026-01-02T11:00:00Z','2026-01-02T12:00:00Z','UTC','series','2026-01-02T09:00:00Z')",[]).unwrap();
        engine::push(&db, &mut api, || true).unwrap();
        assert_eq!(api.events.len(), 2);
        assert_eq!(api.events["instance"]["summary"], "Changed instance");
        assert!(storage::pending(&db).unwrap().is_empty());
        assert_eq!(
            api.events[&parent]["recurrence"],
            json!(["RRULE:FREQ=DAILY"])
        );
    }
    #[test]
    fn imports_moved_and_cancelled_instances_with_original_occurrence_keys() {
        let db = db();
        series(&db);
        let mut api = FakeApi::default();
        engine::push(&db, &mut api, || true).unwrap();
        let parent = storage::mappings(&db).unwrap()[0].remote_id.clone();
        let mut moved = instance(&parent);
        moved["start"]["dateTime"] = json!("2026-01-03T11:00:00Z");
        moved["end"]["dateTime"] = json!("2026-01-03T12:00:00Z");
        storage::importing(&db, |db| incoming::merge_event(db, &moved, "UTC")).unwrap();
        let row = storage::rows(&db)
            .unwrap()
            .into_iter()
            .find(|row| row.recurrence_id.is_some())
            .unwrap();
        assert_eq!(row.original_start.as_deref(), Some("2026-01-02T09:00:00Z"));
        assert!(row.start_time.starts_with("2026-01-03"));
        storage::importing(&db, |db| {
            incoming::merge_event(db, &json!({"id":"instance","status":"cancelled"}), "UTC")
        })
        .unwrap();
        assert!(storage::row(&db, &row.id).unwrap().unwrap().is_deleted);
    }
    #[test]
    fn a_parent_conflict_blocks_pending_children_until_the_series_is_resolved() {
        let db = db();
        series(&db);
        let mut api = FakeApi::default();
        engine::push(&db, &mut api, || true).unwrap();
        let parent = storage::mappings(&db).unwrap()[0].remote_id.clone();
        db.execute("INSERT INTO timeblocks(id,title,start_time,end_time,time_zone,recurrence_id,original_start) VALUES('exception','Desktop','2026-01-02T11:00:00Z','2026-01-02T12:00:00Z','UTC','series','2026-01-02T09:00:00Z')",[]).unwrap();
        api.events.get_mut(&parent).unwrap()["summary"] = json!("Phone series");
        storage::importing(&db, |db| {
            incoming::merge_event(db, &api.events[&parent], "UTC")
        })
        .unwrap();
        assert!(storage::pending(&db).unwrap().is_empty());
        let conflicts = incoming::conflicts(&db).unwrap();
        assert_eq!(conflicts[0].series_id.as_deref(), Some("series"));
        incoming::resolve(&db, &mut api, "series", "local", conflicts[0].revision).unwrap();
        assert!(!storage::pending(&db).unwrap().is_empty());
        assert!(incoming::conflicts(&db).unwrap().is_empty());
    }
    #[test]
    fn atomic_series_edits_roll_back_both_data_and_outbox_on_failure() {
        use crate::calendar::{apply_batch_on, CalendarMutation};
        let db = db();
        series(&db);
        db.execute("DELETE FROM sync_outbox", []).unwrap();
        let failed = apply_batch_on(
            &db,
            vec![
                CalendarMutation::Update {
                    id: "series".into(),
                    updates: json!({"title":"Should roll back"}),
                },
                CalendarMutation::Update {
                    id: "missing".into(),
                    updates: json!({"start_time":"bad"}),
                },
            ],
        );
        assert!(failed.is_err());
        assert_eq!(storage::row(&db, "series").unwrap().unwrap().title, "Local");
        assert!(storage::pending(&db).unwrap().is_empty());
    }

    #[test]
    fn local_completion_of_a_default_instance_survives_a_full_sync_without_google_writes() {
        let db = db();
        series(&db);
        let mut api = FakeApi::default();
        engine::push(&db, &mut api, || true).unwrap();
        let parent = storage::mappings(&db).unwrap()[0].remote_id.clone();
        api.instance_events.push(instance(&parent));
        db.execute("INSERT INTO timeblocks(id,title,start_time,end_time,time_zone,recurrence_id,original_start,completed) VALUES('completed','Local','2026-01-02T09:00:00Z','2026-01-02T10:00:00Z','UTC','series','2026-01-02T09:00:00Z',1)",[]).unwrap();
        engine::push(&db, &mut api, || true).unwrap();
        assert_eq!(api.writes, 1);
        api.pages.push_back(Ok(
            json!({"items":[api.events[&parent]],"nextSyncToken":"fresh"}),
        ));
        incoming::pull(&db, &mut api, || true).unwrap();
        let row = storage::row(&db, "completed").unwrap().unwrap();
        assert!(row.completed);
        assert!(!row.is_deleted);
    }

    #[test]
    fn imports_previously_unmapped_cancelled_instances_as_tombstones() {
        let db = db();
        series(&db);
        let mut api = FakeApi::default();
        engine::push(&db, &mut api, || true).unwrap();
        let parent = storage::mappings(&db).unwrap()[0].remote_id.clone();
        storage::importing(&db,|db|incoming::merge_event(db,&json!({"id":"cancelled-instance","status":"cancelled","recurringEventId":parent,"originalStartTime":{"dateTime":"2026-01-02T09:00:00Z"}}),"UTC")).unwrap();
        assert!(storage::rows(&db)
            .unwrap()
            .iter()
            .any(|row| row.recurrence_id.as_deref() == Some("series") && row.is_deleted));
    }
}
