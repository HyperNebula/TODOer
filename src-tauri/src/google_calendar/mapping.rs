use super::{GoogleError, Result};
use crate::calendar::TimeblockRow;
use chrono::{DateTime, NaiveDate, NaiveDateTime, SecondsFormat, TimeZone};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

pub fn stable_id(identity: &str, local_id: &str) -> String {
    format!(
        "td{:x}",
        Sha256::digest(format!("{identity}:{local_id}").as_bytes())
    )
}

pub fn zoned(value: &str, zone: &str) -> Result<String> {
    if let Ok(instant) = DateTime::parse_from_rfc3339(value) {
        return Ok(instant.to_rfc3339_opts(SecondsFormat::AutoSi, false));
    }
    let tz: chrono_tz::Tz = zone
        .parse()
        .map_err(|_| GoogleError::new("time_zone", "Select a valid IANA calendar time zone."))?;
    let wall = NaiveDateTime::parse_from_str(value, "%Y-%m-%dT%H:%M:%S%.f")
        .or_else(|_| NaiveDateTime::parse_from_str(value, "%Y-%m-%dT%H:%M"))
        .map_err(|_| {
            GoogleError::new(
                "invalid_event",
                "A calendar event has an invalid date or time.",
            )
        })?;
    tz.from_local_datetime(&wall).earliest().map(|date| date.to_rfc3339_opts(SecondsFormat::AutoSi, false))
        .ok_or_else(|| GoogleError::new("invalid_event", "A legacy calendar event uses a clock time skipped by daylight saving. Edit its time before enabling sync."))
}

pub fn normalize_legacy(row: &mut TimeblockRow, zone: &str) -> Result<()> {
    if row.all_day {
        return Ok(());
    }
    let legacy = DateTime::parse_from_rfc3339(&row.start_time).is_err();
    row.start_time = zoned(&row.start_time, zone)?;
    row.end_time = zoned(&row.end_time, zone)?;
    if let Some(original) = row.original_start.as_mut() {
        *original = zoned(original, zone)?;
    }
    if row.time_zone.is_none() {
        row.time_zone = Some(zone.into());
    }
    if legacy {
        if let Some(rule) = row.recurrence_rule.as_mut() {
            // Old UNTIL values were wall-clock numbers serialized with a Z suffix.
            let mut parts = Vec::new();
            for part in rule.split(';') {
                if let Some(until) = part.strip_prefix("UNTIL=") {
                    let wall =
                        NaiveDateTime::parse_from_str(until, "%Y%m%dT%H%M%SZ").map_err(|_| {
                            GoogleError::new(
                                "recurrence",
                                "A legacy recurrence end date is invalid.",
                            )
                        })?;
                    let instant = DateTime::parse_from_rfc3339(&zoned(
                        &wall.format("%Y-%m-%dT%H:%M:%S").to_string(),
                        zone,
                    )?)
                    .unwrap();
                    parts.push(format!(
                        "UNTIL={}",
                        instant.with_timezone(&chrono::Utc).format("%Y%m%dT%H%M%SZ")
                    ));
                } else {
                    parts.push(part.into());
                }
            }
            *rule = parts.join(";");
        }
    }
    Ok(())
}

pub fn event_payload(row: &TimeblockRow, zone: &str) -> Result<Value> {
    let time = |value: &str| -> Result<Value> {
        if row.all_day {
            NaiveDate::parse_from_str(value, "%Y-%m-%d").map_err(|_| {
                GoogleError::new("invalid_event", "An all-day event has an invalid date.")
            })?;
            Ok(json!({ "date": value }))
        } else {
            Ok(
                json!({ "dateTime": zoned(value, row.time_zone.as_deref().unwrap_or(zone))?, "timeZone": row.time_zone.as_deref().unwrap_or(zone) }),
            )
        }
    };
    let recurrence: Vec<_> = row
        .recurrence_rule
        .as_deref()
        .unwrap_or("")
        .lines()
        .filter(|line| {
            line.starts_with("RRULE:") || line.starts_with("EXDATE") || line.starts_with("RDATE")
        })
        .map(str::to_string)
        .collect();
    Ok(
        json!({ "summary": row.title, "description": row.notes, "start": time(&row.start_time)?, "end": time(&row.end_time)?, "recurrence": recurrence }),
    )
}

pub fn canonical(event: &Value, zone: &str) -> Result<Value> {
    if event["status"] == "cancelled" {
        return Ok(Value::Null);
    }
    let time = |value: &Value| -> Result<Value> {
        if let Some(date) = value["date"].as_str() {
            return Ok(json!({ "date": date }));
        }
        let date = value["dateTime"].as_str().ok_or_else(|| {
            GoogleError::new(
                "unsupported_event",
                "This Google event has no supported schedule. Open it in Google Calendar.",
            )
        })?;
        let instant = DateTime::parse_from_rfc3339(date).map_err(|_| {
            GoogleError::new(
                "invalid_event",
                "Google returned an invalid event timestamp.",
            )
        })?;
        Ok(
            json!({ "dateTime": instant.with_timezone(&chrono::Utc).to_rfc3339_opts(SecondsFormat::AutoSi, true), "timeZone": value["timeZone"].as_str().unwrap_or(zone) }),
        )
    };
    let mut recurrence = event["recurrence"].as_array().cloned().unwrap_or_default();
    recurrence.sort_by_key(Value::to_string);
    Ok(
        json!({ "summary": event["summary"].as_str().unwrap_or(""), "description": event["description"].as_str().unwrap_or(""), "start": time(&event["start"])?, "end": time(&event["end"])?, "recurrence": recurrence }),
    )
}

pub fn local_row(id: &str, event: &Value, zone: &str) -> Result<TimeblockRow> {
    let value = canonical(event, zone)?;
    let all_day = value["start"]["date"].is_string();
    let field = if all_day { "date" } else { "dateTime" };
    Ok(TimeblockRow {
        id: id.into(),
        title: value["summary"].as_str().unwrap_or("").into(),
        notes: value["description"].as_str().unwrap_or("").into(),
        start_time: value["start"][field].as_str().unwrap_or("").into(),
        end_time: value["end"][field].as_str().unwrap_or("").into(),
        all_day,
        time_zone: if all_day {
            None
        } else {
            Some(value["start"]["timeZone"].as_str().unwrap_or(zone).into())
        },
        recurrence_rule: value["recurrence"]
            .as_array()
            .filter(|array| !array.is_empty())
            .map(|array| {
                array
                    .iter()
                    .filter_map(Value::as_str)
                    .collect::<Vec<_>>()
                    .join("\n")
            }),
        recurrence_id: None,
        original_start: None,
        is_deleted: false,
        completed: false,
        color: None,
        link: None,
        task_ids: vec![],
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn equivalent_offsets_compare_equal_and_extra_google_fields_are_ignored() {
        let a = json!({"summary":"Test","start":{"dateTime":"2026-11-01T09:00:00-07:00","timeZone":"America/Denver"},"end":{"dateTime":"2026-11-01T10:00:00-07:00","timeZone":"America/Denver"}});
        let mut b = a.clone();
        b["start"]["dateTime"] = json!("2026-11-01T16:00:00Z");
        b["end"]["dateTime"] = json!("2026-11-01T17:00:00Z");
        b["attendees"] = json!([{"email":"guest@example.com"}]);
        assert_eq!(canonical(&a, "UTC").unwrap(), canonical(&b, "UTC").unwrap());
        assert!(!canonical(&b, "UTC")
            .unwrap()
            .to_string()
            .contains("attendees"));
    }
    #[test]
    fn stable_ids_use_google_base32hex_characters() {
        let id = stable_id("calendar", "local");
        assert!(id
            .chars()
            .all(|ch| ('0'..='9').contains(&ch) || ('a'..='v').contains(&ch)));
        assert_ne!(id, stable_id("other", "local"));
    }
    #[test]
    fn legacy_conversion_preserves_wall_time_and_rejects_skipped_hours() {
        assert_eq!(
            zoned("2026-11-01T09:00:00", "America/Denver").unwrap(),
            "2026-11-01T09:00:00-07:00"
        );
        assert!(zoned("2026-03-08T02:30:00", "America/Denver").is_err());
    }
}
