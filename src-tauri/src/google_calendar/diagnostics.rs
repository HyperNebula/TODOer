use super::{GoogleError, Result};
use rusqlite::Connection;
use serde::Serialize;

pub fn migrate(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS sync_runs (
        id INTEGER PRIMARY KEY, at TEXT NOT NULL, result TEXT NOT NULL,
        pending_count INTEGER NOT NULL, conflict_count INTEGER NOT NULL);",
    )
    .map_err(GoogleError::storage)
}

#[derive(Clone, Serialize)]
pub struct Run {
    pub at: String,
    pub result: String,
    pub pending_count: i64,
    pub conflict_count: i64,
}

pub fn record(conn: &Connection, result: &Result<()>) -> Result<()> {
    let tx = conn.unchecked_transaction().map_err(GoogleError::storage)?;
    tx.execute(
        "INSERT INTO sync_runs(at,result,pending_count,conflict_count)
        SELECT ?1,?2,(SELECT count(*) FROM sync_outbox),(SELECT count(*) FROM sync_conflicts)",
        rusqlite::params![
            chrono::Utc::now().to_rfc3339(),
            result
                .as_ref()
                .err()
                .map(|error| error.code.as_str())
                .unwrap_or("success")
        ],
    )
    .map_err(GoogleError::storage)?;
    tx.execute("DELETE FROM sync_runs WHERE id NOT IN (SELECT id FROM sync_runs ORDER BY id DESC LIMIT 100)", [])
        .map_err(GoogleError::storage)?;
    tx.commit().map_err(GoogleError::storage)
}

pub fn recent(conn: &Connection) -> Result<Vec<Run>> {
    let mut stmt = conn.prepare("SELECT at,result,pending_count,conflict_count FROM sync_runs ORDER BY id DESC LIMIT 10")
        .map_err(GoogleError::storage)?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Run {
                at: row.get(0)?,
                result: row.get(1)?,
                pending_count: row.get(2)?,
                conflict_count: row.get(3)?,
            })
        })
        .map_err(GoogleError::storage)?;
    rows.collect::<std::result::Result<Vec<_>, _>>()
        .map_err(GoogleError::storage)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn history_is_bounded_and_excludes_content_and_error_messages() {
        let db = crate::google_calendar::testing::db();
        crate::google_calendar::testing::local(&db, "private event");
        for _ in 0..105 {
            record(&db, &Ok(())).unwrap();
        }
        record(
            &db,
            &Err(GoogleError::new(
                "network",
                "Do not record this private response",
            )),
        )
        .unwrap();
        let recent = recent(&db).unwrap();
        assert_eq!(recent.len(), 10);
        assert_eq!(recent[0].result, "network");
        assert_eq!(recent[0].pending_count, 1);
        let serialized = serde_json::to_string(&recent).unwrap();
        assert!(!serialized.contains("private"));
        assert_eq!(
            db.query_row("SELECT count(*) FROM sync_runs", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            100
        );
    }
}
