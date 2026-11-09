use super::{api::CalendarApi, mapping, recurrence, storage, GoogleError, Result};
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
    let parent = recurrence::parent_local_id(conn, remote)?;
    if remote.is_null() || remote["status"] == "cancelled" {
        if let Some(parent) =
            parent.filter(|parent| storage::row(conn, parent).ok().flatten().is_some())
        {
            let original = recurrence::occurrence_key(&remote["originalStartTime"], zone)?;
            let mut row = mapping::local_row(
                id,
                &serde_json::json!({"start":{"date": "2000-01-01"},"end":{"date":"2000-01-02"}}),
                zone,
            )?;
            row.start_time = original.clone();
            row.end_time = original.clone();
            row.all_day = original.len() == 10;
            row.time_zone = if row.all_day {
                None
            } else {
                storage::row(conn, &parent)?
                    .and_then(|row| row.time_zone)
                    .or(Some(zone.into()))
            };
            row.recurrence_id = Some(parent);
            row.original_start = Some(original);
            row.is_deleted = true;
            row.title = "Deleted Exception".into();
            storage::write_row(conn, &row)?;
        } else {
            conn.execute(
                "DELETE FROM timeblocks WHERE recurrence_id=?1 OR id=?1",
                [id],
            )
            .map_err(GoogleError::storage)?;
        }
    } else {
        let mut row = mapping::local_row(id, remote, zone)?;
        if let Some(parent) = parent {
            row.recurrence_id = Some(parent);
            row.original_start = Some(recurrence::occurrence_key(
                &remote["originalStartTime"],
                zone,
            )?);
        }
        storage::write_row(conn, &row)?;
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
    let retired: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sync_retired WHERE remote_id=?1 OR remote_id=?2)",
            rusqlite::params![remote_id, remote["recurringEventId"].as_str()],
            |r| r.get(0),
        )
        .map_err(GoogleError::storage)?;
    if retired {
        return Ok(());
    }
    let mappings = storage::mappings(conn)?;
    let mapped = mappings.iter().find(|entry| entry.remote_id == remote_id);
    let mut effective = remote.clone();
    if effective["status"] == "cancelled" && !effective["recurringEventId"].is_string() {
        if let Some(raw) = mapped
            .and_then(|entry| entry.raw.as_ref())
            .filter(|raw| raw["recurringEventId"].is_string())
        {
            effective["recurringEventId"] = raw["recurringEventId"].clone();
            effective["originalStartTime"] = raw["originalStartTime"].clone();
        }
    }
    let remote = &effective;
    if mapped.is_none()
        && remote["status"] == "cancelled"
        && !remote["recurringEventId"].is_string()
    {
        return Ok(());
    }
    let identity = storage::identity(conn)?;
    let parent = recurrence::parent_local_id(conn, remote)?;
    let matching_instance = if let Some(parent) = &parent {
        let key = recurrence::occurrence_key(&remote["originalStartTime"], zone)?;
        storage::rows(conn)?
            .into_iter()
            .find(|row| {
                row.recurrence_id.as_ref() == Some(parent)
                    && row.original_start.as_deref().is_some_and(|value| {
                        recurrence::original_time(value, zone)
                            .and_then(|value| recurrence::occurrence_key(&value, zone))
                            .ok()
                            .as_deref()
                            == Some(&key)
                    })
            })
            .map(|row| row.id)
    } else {
        None
    };
    let id = if let Some(entry) = mapped {
        entry.local_id.clone()
    } else if let Some(id) = matching_instance {
        id
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
    if mapped.is_none() {
        conn.execute(
            "INSERT OR IGNORE INTO sync_events(local_id,remote_id) VALUES(?1,?2)",
            [&id, remote_id],
        )
        .map_err(GoogleError::storage)?;
    }
    let current = if remote["status"] == "cancelled" {
        Value::Null
    } else {
        match mapping::canonical(remote, zone) {
            Ok(value) => value,
            Err(error) => {
                // Retain identity even when no local schedule can be imported,
                // so a later correction or cancellation clears this conflict.
                conn.execute(
                    "UPDATE sync_events SET raw_json=?2,etag=?3,html_link=?4 WHERE local_id=?1",
                    rusqlite::params![
                        &id,
                        remote.to_string(),
                        remote["etag"].as_str(),
                        remote["htmlLink"].as_str()
                    ],
                )
                .map_err(GoogleError::storage)?;
                storage::conflict(conn, &id, remote, &error.code, None)?;
                return Ok(());
            }
        }
    };
    let desired = match local.as_ref().filter(|row| !row.is_deleted) {
        Some(row) => mapping::canonical(&recurrence::payload(conn, row, zone)?, zone)?,
        None => Value::Null,
    };
    let series = parent
        .clone()
        .or_else(|| {
            remote["recurrence"]
                .as_array()
                .filter(|array| !array.is_empty())
                .map(|_| id.clone())
        })
        .or_else(|| {
            local
                .as_ref()
                .filter(|row| row.recurrence_rule.is_some())
                .map(|row| row.id.clone())
        });
    let dirty: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sync_outbox WHERE local_id=?1 OR local_id=?2 OR parent_id=?2)",
            rusqlite::params![&id,series],
            |r| r.get(0),
        )
        .map_err(GoogleError::storage)?;
    let previous = mapped.and_then(|entry| entry.base.as_ref());
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
                    && !entry
                        .raw
                        .as_ref()
                        .is_some_and(|raw| raw["_todoerDefaultInstance"] == true)
                    && !seen.contains(entry.remote_id.as_str())
                {
                    merge_event(
                        conn,
                        &json!({"id":entry.remote_id,"status":"cancelled","recurringEventId":entry.raw.as_ref().and_then(|raw|raw["recurringEventId"].as_str()),"originalStartTime":entry.raw.as_ref().map(|raw|raw["originalStartTime"].clone())}),
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
        let mut cached = cached
            .into_iter()
            .map(|value| serde_json::from_str::<Value>(&value).map_err(GoogleError::storage))
            .collect::<Result<Vec<_>>>()?;
        cached.sort_by_key(|event| event["recurringEventId"].is_string());
        for event in cached {
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

fn family_revision(conn: &Connection, id: &str, series: Option<&str>) -> Result<i64> {
    conn.query_row("SELECT COALESCE(MAX(revision),0) FROM sync_outbox WHERE local_id=?1 OR local_id=?2 OR parent_id=?2",rusqlite::params![id,series],|r|r.get(0)).map_err(GoogleError::storage)
}

fn fresh_mapping(conn: &Connection, id: &str) -> Result<()> {
    let mut bytes = [0u8; 16];
    getrandom::fill(&mut bytes).map_err(|_| {
        GoogleError::new(
            "randomness",
            "A new calendar identity could not be created.",
        )
    })?;
    conn.execute(
        "INSERT OR IGNORE INTO sync_retired SELECT remote_id FROM sync_events WHERE local_id=?1",
        [id],
    )
    .map_err(GoogleError::storage)?;
    let fresh = mapping::stable_id(&storage::identity(conn)?, &format!("{id}:{bytes:x?}"));
    conn.execute("UPDATE sync_events SET remote_id=?2,etag=NULL,base_json=NULL,raw_json=NULL,html_link=NULL WHERE local_id=?1",[id,&fresh]).map_err(GoogleError::storage)?;
    Ok(())
}

fn resolve_series(
    conn: &Connection,
    api: &mut dyn CalendarApi,
    series: &str,
    choice: &str,
    revision: i64,
) -> Result<()> {
    if family_revision(conn, series, Some(series))? != revision {
        return Err(GoogleError::new(
            "conflict_changed",
            "This series changed locally. Review its updated versions.",
        ));
    }
    let binding = storage::binding(conn)?
        .ok_or_else(|| GoogleError::new("not_enabled", "Enable sync first."))?;
    let mut stmt=conn.prepare("SELECT ?1 UNION SELECT id FROM timeblocks WHERE recurrence_id=?1 UNION SELECT local_id FROM sync_outbox WHERE parent_id=?1 UNION SELECT local_id FROM sync_conflicts WHERE series_id=?1").map_err(GoogleError::storage)?;
    let mut ids = stmt
        .query_map([series], |r| r.get::<_, String>(0))
        .map_err(GoogleError::storage)?
        .collect::<std::result::Result<Vec<_>, _>>()
        .map_err(GoogleError::storage)?;
    drop(stmt);
    ids.sort_by_key(|id| id != series);
    let mappings = storage::mappings(conn)?;
    let mut versions = Vec::new();
    for id in &ids {
        let entry = mappings.iter().find(|entry| entry.local_id == *id);
        let remote = if let Some(entry) = entry {
            match api.get(&binding.calendar_id, &entry.remote_id) {
                Ok(value) => value,
                Err(error) if matches!(error.code.as_str(), "not_found" | "gone") => Value::Null,
                Err(error) => return Err(error),
            }
        } else {
            Value::Null
        };
        let stored: Option<String> = conn
            .query_row(
                "SELECT remote_json FROM sync_conflicts WHERE local_id=?1",
                [id],
                |r| r.get(0),
            )
            .optional()
            .map_err(GoogleError::storage)?;
        let canonical = |value: &Value| {
            if value.is_null() {
                Ok(Value::Null)
            } else {
                mapping::canonical(value, &binding.time_zone)
            }
        };
        if let Some(stored) = stored {
            let stored: Value = serde_json::from_str(&stored).map_err(GoogleError::storage)?;
            if canonical(&stored)? != canonical(&remote)? {
                storage::conflict(conn, id, &remote, "changed", Some(series))?;
                return Err(GoogleError::new(
                    "conflict_changed",
                    "Google changed this series again. Review the updated versions.",
                ));
            }
        }
        versions.push((id.clone(), entry.cloned(), remote));
    }
    let recreated = choice == "local"
        && (versions[0].2.is_null() || versions[0].2["status"] == "cancelled")
        && storage::row(conn, series)?.is_some();
    let google_deleted_root =
        choice == "google" && (versions[0].2.is_null() || versions[0].2["status"] == "cancelled");
    storage::importing(conn, |conn| {
        if family_revision(conn, series, Some(series))? != revision {
            return Err(GoogleError::new(
                "conflict_changed",
                "This series changed locally. Review its updated versions.",
            ));
        }
        for (id, entry, remote) in &versions {
            let row = storage::row(conn, id)?;
            if choice == "google" {
                if google_deleted_root && id != series {
                    conn.execute("DELETE FROM timeblocks WHERE id=?1", [id])
                        .map_err(GoogleError::storage)?;
                    if let Some(entry) = entry {
                        record(conn, id, &entry.remote_id, &Value::Null, &binding.time_zone)?;
                    }
                    conn.execute("DELETE FROM sync_outbox WHERE local_id=?1", [id])
                        .map_err(GoogleError::storage)?;
                    continue;
                }
                if remote.is_null() && id != series {
                    if let Some(mut row) = row {
                        row.is_deleted = true;
                        storage::write_row(conn, &row)?;
                    }
                } else {
                    apply(conn, id, remote, &binding.time_zone)?;
                }
                if let Some(entry) = entry {
                    record(conn, id, &entry.remote_id, remote, &binding.time_zone)?;
                }
                conn.execute("DELETE FROM sync_outbox WHERE local_id=?1", [id])
                    .map_err(GoogleError::storage)?;
            } else {
                if !recreated && id != series && remote["status"] == "cancelled" {
                    // A cancelled occurrence keeps its Google identity. Replacing
                    // it with a new ID only rediscovers the same cancelled
                    // instance and repeats the conflict on every upload.
                    if let Some(entry) = entry {
                        record(conn, id, &entry.remote_id, remote, &binding.time_zone)?;
                    }
                } else if recreated || remote.is_null() || remote["status"] == "cancelled" {
                    if entry.is_some() {
                        fresh_mapping(conn, id)?;
                    }
                } else if let Some(entry) = entry {
                    record(conn, id, &entry.remote_id, remote, &binding.time_zone)?;
                }
                if row.is_none() && (remote.is_null() || remote["status"] == "cancelled") {
                    conn.execute("DELETE FROM sync_outbox WHERE local_id=?1", [id])
                        .map_err(GoogleError::storage)?;
                    continue;
                }
                conn.execute(
                    "UPDATE sync_control SET revision=revision+1 WHERE singleton=1",
                    [],
                )
                .map_err(GoogleError::storage)?;
                let deleted = row.as_ref().is_none_or(|row| row.is_deleted);
                conn.execute("INSERT INTO sync_outbox(local_id,revision,deleted,parent_id) VALUES(?1,(SELECT revision FROM sync_control WHERE singleton=1),?2,?3)
                    ON CONFLICT(local_id) DO UPDATE SET revision=excluded.revision,deleted=excluded.deleted,parent_id=excluded.parent_id",
                    rusqlite::params![id,deleted,if id==series{None}else{Some(series)}]).map_err(GoogleError::storage)?;
            }
        }
        conn.execute(
            "DELETE FROM sync_conflicts WHERE series_id=?1 OR local_id=?1",
            [series],
        )
        .map_err(GoogleError::storage)?;
        Ok(())
    })
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
                    &recurrence::payload(conn, &row, &binding.time_zone)?,
                    &binding.time_zone,
                )?,
                None => Value::Null,
            };
            let revision = family_revision(conn, &id, series_id.as_deref())?;
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
    let series: Option<Option<String>> = conn
        .query_row(
            "SELECT series_id FROM sync_conflicts WHERE local_id=?1",
            [id],
            |r| r.get(0),
        )
        .optional()
        .map_err(GoogleError::storage)?;
    if let Some(series) = series.flatten() {
        return resolve_series(conn, api, &series, choice, revision);
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

    #[test]
    fn deleting_an_unsupported_remote_event_clears_its_review_item() {
        let db = db();
        let unsupported = json!({"id":"unsupported","summary":"Unsupported schedule","htmlLink":"https://calendar.google.com/calendar/event?eid=test"});
        storage::importing(&db, |db| merge_event(db, &unsupported, "UTC")).unwrap();
        assert_eq!(conflicts(&db).unwrap().len(), 1);
        assert_eq!(storage::mappings(&db).unwrap()[0].remote_id, "unsupported");
        storage::importing(&db, |db| {
            merge_event(db, &json!({"id":"unsupported","status":"cancelled"}), "UTC")
        })
        .unwrap();
        assert!(conflicts(&db).unwrap().is_empty());
        assert!(storage::rows(&db).unwrap().is_empty());
        assert!(storage::pending(&db).unwrap().is_empty());
    }
}
