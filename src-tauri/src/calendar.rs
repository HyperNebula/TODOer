use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::ops::Deref;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub struct CalendarDb {
    conn: Mutex<Option<OpenCalendar>>,
}

impl CalendarDb {
    pub fn new() -> Self {
        CalendarDb {
            conn: Mutex::new(None),
        }
    }
}

#[derive(Serialize, Deserialize, Clone)]
pub struct TimeblockRow {
    pub id: String,
    pub title: String,
    pub start_time: String,
    pub end_time: String,
    pub all_day: bool,
    pub time_zone: Option<String>,
    pub notes: String,
    pub completed: bool,
    pub color: Option<String>,
    pub recurrence_rule: Option<String>,
    pub recurrence_id: Option<String>,
    pub original_start: Option<String>,
    pub is_deleted: bool,
    pub link: Option<String>,
    pub task_ids: Vec<String>,
}

pub struct OpenCalendar {
    pub connection: Connection,
    pub session_id: String,
}

impl Deref for OpenCalendar {
    type Target = Connection;
    fn deref(&self) -> &Connection {
        &self.connection
    }
}

fn database_path(list_path: &str) -> PathBuf {
    Path::new(list_path).with_extension("calendar.db")
}

pub fn migrate(conn: &mut Connection) -> Result<(), String> {
    conn.execute_batch("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;")
        .map_err(|e| e.to_string())?;
    let version: u32 = conn
        .pragma_query_value(None, "user_version", |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if version > 2 {
        return Err("This calendar was created by a newer TODOer version".into());
    }
    if version < 1 {
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        tx.execute_batch("CREATE TABLE IF NOT EXISTS timeblocks (
            id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT 'New Timeblock',
            start_time TEXT NOT NULL, end_time TEXT NOT NULL, notes TEXT DEFAULT '',
            completed INTEGER DEFAULT 0, color TEXT, link TEXT,
            recurrence_rule TEXT, recurrence_id TEXT, original_start TEXT,
            is_deleted INTEGER DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')));
            CREATE TABLE IF NOT EXISTS timeblock_tasks (
                timeblock_id TEXT NOT NULL, task_id TEXT NOT NULL,
                PRIMARY KEY (timeblock_id, task_id),
                FOREIGN KEY (timeblock_id) REFERENCES timeblocks(id) ON DELETE CASCADE);
            CREATE INDEX IF NOT EXISTS idx_timeblocks_start ON timeblocks(start_time);
            CREATE INDEX IF NOT EXISTS idx_timeblocks_end ON timeblocks(end_time);
            CREATE TABLE IF NOT EXISTS calendar_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            INSERT OR IGNORE INTO calendar_metadata VALUES ('calendar_id', lower(hex(randomblob(16))));")
            .map_err(|e| e.to_string())?;
        let has_link = {
            let mut stmt = tx
                .prepare("PRAGMA table_info(timeblocks)")
                .map_err(|e| e.to_string())?;
            let names = stmt
                .query_map([], |r| r.get::<_, String>(1))
                .map_err(|e| e.to_string())?;
            names
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?
                .iter()
                .any(|n| n == "link")
        };
        if !has_link {
            tx.execute_batch("ALTER TABLE timeblocks ADD COLUMN link TEXT;")
                .map_err(|e| e.to_string())?;
        }
        tx.execute(
            "UPDATE timeblocks SET is_deleted = 1 WHERE title = 'Deleted Exception'",
            [],
        )
        .map_err(|e| e.to_string())?;
        tx.pragma_update(None, "user_version", 1)
            .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
    }
    if version < 2 {
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        tx.execute_batch(
            "ALTER TABLE timeblocks ADD COLUMN all_day INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE timeblocks ADD COLUMN time_zone TEXT;
            PRAGMA user_version = 2;",
        )
        .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn checked<'a>(
    active: &'a Option<OpenCalendar>,
    database_id: &str,
) -> Result<&'a OpenCalendar, String> {
    active
        .as_ref()
        .filter(|db| db.session_id == database_id)
        .ok_or_else(|| "The active calendar changed; please retry the operation".into())
}

/// Capture a list's display zone once; reopening it after travel must not reinterpret its clock times.
fn display_time_zone_on(conn: &Connection, default_zone: &str) -> Result<String, String> {
    conn.execute(
        "INSERT OR IGNORE INTO calendar_metadata VALUES ('display_time_zone', ?1)",
        [default_zone],
    )
    .map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT value FROM calendar_metadata WHERE key='display_time_zone'",
        [],
        |row| row.get(0),
    )
    .map_err(|e| e.to_string())
}

#[derive(Serialize)]
pub struct CalendarSession {
    database_id: String,
    time_zone: String,
}

#[tauri::command]
pub fn open_calendar_db(
    state: tauri::State<'_, CalendarDb>,
    list_path: String,
    default_time_zone: Option<String>,
) -> Result<CalendarSession, String> {
    let mut active = state.conn.lock().map_err(|e| e.to_string())?;
    let mut conn = Connection::open(database_path(&list_path)).map_err(|e| e.to_string())?;
    migrate(&mut conn)?;
    let default_zone = default_time_zone
        .filter(|zone| !zone.trim().is_empty())
        .unwrap_or_else(|| "UTC".into());
    let time_zone = display_time_zone_on(&conn, &default_zone)?;
    let session_id: String = conn
        .query_row("SELECT lower(hex(randomblob(16)))", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    *active = Some(OpenCalendar {
        connection: conn,
        session_id: session_id.clone(),
    });
    Ok(CalendarSession {
        database_id: session_id,
        time_zone,
    })
}

#[tauri::command]
pub fn close_calendar_db(state: tauri::State<'_, CalendarDb>) -> Result<(), String> {
    *state.conn.lock().map_err(|e| e.to_string())? = None;
    Ok(())
}

pub fn copy_calendar(source: &Path, target: &Path) -> Result<(), String> {
    if !source.exists() {
        return if target.exists() {
            Err(
                "The destination already has a calendar. Choose a new filename to preserve it."
                    .into(),
            )
        } else {
            Ok(())
        };
    }
    if target.exists()
        && source.canonicalize().map_err(|e| e.to_string())?
            == target.canonicalize().map_err(|e| e.to_string())?
    {
        return Ok(());
    }
    if target.exists() {
        return Err(
            "The destination already has a calendar. Choose a new filename to preserve it.".into(),
        );
    }
    let mut source_db = Connection::open(source).map_err(|e| e.to_string())?;
    migrate(&mut source_db)?;
    source_db
        .backup(rusqlite::DatabaseName::Main, target, None)
        .map_err(|e| e.to_string())?;
    let target_db = Connection::open(target).map_err(|e| e.to_string())?;
    target_db.execute("UPDATE calendar_metadata SET value = lower(hex(randomblob(16))) WHERE key = 'calendar_id'", []).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn copy_calendar_db(source_list_path: String, target_list_path: String) -> Result<(), String> {
    copy_calendar(
        &database_path(&source_list_path),
        &database_path(&target_list_path),
    )
}

#[cfg(test)]
mod storage_tests {
    use super::*;

    fn insert_event(
        conn: &Connection,
        id: &str,
        start: &str,
        end: &str,
        all_day: bool,
        zone: Option<&str>,
    ) {
        add_timeblock_on(
            conn,
            id.into(),
            id.into(),
            start.into(),
            end.into(),
            "notes".into(),
            None,
            None,
            None,
            None,
            None,
            None,
            Some(all_day),
            zone.map(str::to_string),
        )
        .unwrap();
    }

    fn range(
        conn: &Connection,
        start: &str,
        end: &str,
        start_instant: &str,
        end_instant: &str,
    ) -> Vec<TimeblockRow> {
        serde_json::from_str(
            &get_timeblocks_for_range_on(
                conn,
                start.into(),
                end.into(),
                Some(start_instant.into()),
                Some(end_instant.into()),
            )
            .unwrap(),
        )
        .unwrap()
    }

    #[test]
    fn a_calendar_keeps_its_display_zone_when_the_system_zone_changes() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrate(&mut conn).unwrap();
        assert_eq!(
            display_time_zone_on(&conn, "America/Denver").unwrap(),
            "America/Denver"
        );
        assert_eq!(
            display_time_zone_on(&conn, "Asia/Tokyo").unwrap(),
            "America/Denver"
        );
    }

    #[test]
    fn version_two_preserves_legacy_times_and_task_links() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrate(&mut conn).unwrap();
        conn.execute_batch("ALTER TABLE timeblocks DROP COLUMN all_day;
            ALTER TABLE timeblocks DROP COLUMN time_zone;
            PRAGMA user_version = 1;
            INSERT INTO timeblocks (id, start_time, end_time, notes, completed) VALUES ('legacy', '2026-10-31T09:00:00', '2026-10-31T10:00:00', 'preserve', 1);
            INSERT INTO timeblock_tasks VALUES ('legacy', 'task');").unwrap();
        migrate(&mut conn).unwrap();
        let rows = range(
            &conn,
            "2026-10-31T00:00:00",
            "2026-11-01T00:00:00",
            "2026-10-31T06:00:00Z",
            "2026-11-01T06:00:00Z",
        );
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].start_time, "2026-10-31T09:00:00");
        assert_eq!(rows[0].task_ids, vec!["task"]);
        assert!(rows[0].completed);
        assert!(!rows[0].all_day);
        assert!(rows[0].time_zone.is_none());
    }

    #[test]
    fn ranges_compare_instants_for_offsets_and_dates_for_all_day_events() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrate(&mut conn).unwrap();
        insert_event(
            &conn,
            "tokyo",
            "2026-11-01T00:30:00+09:00",
            "2026-11-01T01:30:00+09:00",
            false,
            Some("Asia/Tokyo"),
        );
        insert_event(
            &conn,
            "west",
            "2026-10-30T23:00:00-07:00",
            "2026-10-31T00:30:00-07:00",
            false,
            Some("America/Los_Angeles"),
        );
        insert_event(
            &conn,
            "outside",
            "2026-10-31T23:00:00-07:00",
            "2026-11-01T00:30:00-07:00",
            false,
            Some("America/Los_Angeles"),
        );
        insert_event(
            &conn,
            "boundary",
            "2026-10-30T23:00:00Z",
            "2026-10-31T00:00:00Z",
            false,
            Some("UTC"),
        );
        insert_event(&conn, "day", "2026-10-31", "2026-11-01", true, None);
        insert_event(&conn, "next-day", "2026-11-01", "2026-11-02", true, None);
        let rows = range(
            &conn,
            "2026-10-31T00:00:00",
            "2026-11-01T00:00:00",
            "2026-10-31T00:00:00Z",
            "2026-11-01T00:00:00Z",
        );
        let mut ids: Vec<_> = rows.iter().map(|row| row.id.as_str()).collect();
        ids.sort();
        assert_eq!(ids, vec!["day", "tokyo", "west"]);
    }

    #[test]
    fn ranges_use_wall_bounds_for_legacy_and_instant_bounds_for_zoned_rows() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrate(&mut conn).unwrap();
        insert_event(
            &conn,
            "legacy",
            "2026-10-31T02:00:00",
            "2026-10-31T03:00:00",
            false,
            None,
        );
        insert_event(
            &conn,
            "instant",
            "2026-10-31T02:00:00Z",
            "2026-10-31T03:00:00Z",
            false,
            Some("UTC"),
        );
        let rows = range(
            &conn,
            "2026-10-31T00:00:00",
            "2026-11-01T00:00:00",
            "2026-10-31T06:00:00Z",
            "2026-11-01T06:00:00Z",
        );
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].id, "legacy");
    }

    #[test]
    fn schedule_validation_prevents_partial_invalid_updates_and_allows_all_day_conversion() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrate(&mut conn).unwrap();
        insert_event(
            &conn,
            "one",
            "2026-10-31T09:00:00-06:00",
            "2026-10-31T10:00:00-06:00",
            false,
            Some("America/Denver"),
        );
        assert!(update_timeblock_on(
            &conn,
            "one".into(),
            r#"{"title":"corrupted","end_time":"2026-10-31T08:00:00-06:00"}"#.into()
        )
        .is_err());
        let title: String = conn
            .query_row("SELECT title FROM timeblocks WHERE id='one'", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(title, "one");
        update_timeblock_on(&conn, "one".into(), r#"{"all_day":true,"time_zone":null,"start_time":"2026-10-31","end_time":"2026-11-02"}"#.into()).unwrap();
        let rows = range(
            &conn,
            "2026-11-01T00:00:00",
            "2026-11-02T00:00:00",
            "2026-11-01T00:00:00Z",
            "2026-11-02T00:00:00Z",
        );
        assert_eq!(rows.len(), 1);
        assert!(rows[0].all_day);
        assert!(rows[0].time_zone.is_none());
        assert_eq!(rows[0].notes, "notes");
        assert!(validate_schedule("2026-11-01", "2026-11-01", true, None, false).is_err());
        assert!(validate_schedule("2026-11-01", "2026-11-01", true, None, true).is_ok());
    }

    #[test]
    fn migration_is_idempotent_and_preserves_identity() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrate(&mut conn).unwrap();
        let id: String = conn
            .query_row(
                "SELECT value FROM calendar_metadata WHERE key = 'calendar_id'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        conn.execute("INSERT INTO timeblocks (id, title, start_time, end_time) VALUES ('one', 'Keep me', '2026-01-01T09:00:00', '2026-01-01T10:00:00')", []).unwrap();
        migrate(&mut conn).unwrap();
        let after: String = conn
            .query_row(
                "SELECT value FROM calendar_metadata WHERE key = 'calendar_id'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(id, after);
        assert_eq!(
            conn.query_row("SELECT title FROM timeblocks WHERE id='one'", [], |r| {
                r.get::<_, String>(0)
            })
            .unwrap(),
            "Keep me"
        );
    }

    #[test]
    fn rejects_future_schema_and_stale_sessions() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "user_version", 999).unwrap();
        assert!(migrate(&mut conn).is_err());
        let active = Some(OpenCalendar {
            connection: conn,
            session_id: "new".into(),
        });
        assert!(checked(&active, "old").is_err());
        assert!(checked(&active, "new").is_ok());
    }

    #[test]
    fn upgrades_legacy_schema_without_link_and_heals_cancelled_exceptions() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE timeblocks (
            id TEXT PRIMARY KEY, title TEXT, start_time TEXT, end_time TEXT,
            notes TEXT, completed INTEGER, color TEXT, recurrence_rule TEXT,
            recurrence_id TEXT, original_start TEXT, is_deleted INTEGER,
            created_at TEXT, updated_at TEXT);
            INSERT INTO timeblocks (id, title, start_time, end_time, is_deleted)
            VALUES ('cancelled', 'Deleted Exception', 'start', 'end', 0);",
        )
        .unwrap();
        migrate(&mut conn).unwrap();
        let (deleted, link): (bool, Option<String>) = conn
            .query_row(
                "SELECT is_deleted, link, all_day, time_zone FROM timeblocks WHERE id='cancelled'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert!(deleted);
        assert!(link.is_none());
    }

    #[test]
    fn backup_includes_wal_and_task_links_but_has_independent_identity() {
        let root = std::env::temp_dir().join(format!(
            "todoer-calendar-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir(&root).unwrap();
        let source = root.join("source.db");
        let target = root.join("copy.db");
        {
            let mut conn = Connection::open(&source).unwrap();
            migrate(&mut conn).unwrap();
            conn.execute(
                "INSERT INTO timeblocks (id, start_time, end_time) VALUES ('one', 'start', 'end')",
                [],
            )
            .unwrap();
            conn.execute("INSERT INTO timeblock_tasks VALUES ('one', 'task')", [])
                .unwrap();
            let id: String = conn
                .query_row(
                    "SELECT value FROM calendar_metadata WHERE key='calendar_id'",
                    [],
                    |r| r.get(0),
                )
                .unwrap();
            copy_calendar(&source, &source).unwrap();
            copy_calendar(&source, &target).unwrap();
            assert!(copy_calendar(&source, &target).is_err());
            let copied = Connection::open(&target).unwrap();
            let copied_id: String = copied
                .query_row(
                    "SELECT value FROM calendar_metadata WHERE key='calendar_id'",
                    [],
                    |r| r.get(0),
                )
                .unwrap();
            assert_ne!(id, copied_id);
            assert_eq!(
                copied
                    .query_row("SELECT task_id FROM timeblock_tasks", [], |r| r
                        .get::<_, String>(0))
                    .unwrap(),
                "task"
            );
        }
        std::fs::remove_dir_all(root).unwrap();
    }
}

#[tauri::command]
pub fn get_timeblocks_for_range(
    state: tauri::State<'_, CalendarDb>,
    database_id: String,
    start: String,
    end: String,
    start_instant: Option<String>,
    end_instant: Option<String>,
) -> Result<String, String> {
    let lock = state.conn.lock().map_err(|e| e.to_string())?;
    let conn = checked(&lock, &database_id)?;
    get_timeblocks_for_range_on(conn, start, end, start_instant, end_instant)
}

pub fn get_timeblocks_for_range_on(
    conn: &Connection,
    start: String,
    end: String,
    start_instant: Option<String>,
    end_instant: Option<String>,
) -> Result<String, String> {
    let mut stmt = conn.prepare("SELECT id, title, start_time, end_time, notes, completed, color, recurrence_rule, recurrence_id, original_start, is_deleted, link, all_day, time_zone FROM timeblocks WHERE is_deleted = 0 AND (
        (all_day = 1 AND start_time < substr(?2,1,10) AND end_time > substr(?1,1,10)) OR
        (all_day = 0 AND CASE WHEN start_time GLOB '*Z' OR start_time GLOB '*z' OR start_time GLOB '*[+-]??:??'
            THEN julianday(start_time) < julianday(?4) AND julianday(end_time) > julianday(?3)
            ELSE julianday(start_time) < julianday(?2) AND julianday(end_time) > julianday(?1) END))").map_err(|e| e.to_string())?;
    let block_iter = stmt
        .query_map(
            rusqlite::params![
                &start,
                &end,
                start_instant.as_deref().unwrap_or(&start),
                end_instant.as_deref().unwrap_or(&end)
            ],
            |row| {
                let completed: i32 = row.get(5)?;
                let is_deleted: i32 = row.get(10).unwrap_or(0);
                Ok(TimeblockRow {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    start_time: row.get(2)?,
                    end_time: row.get(3)?,
                    notes: row.get(4)?,
                    completed: completed > 0,
                    color: row.get(6)?,
                    recurrence_rule: row.get(7)?,
                    recurrence_id: row.get(8)?,
                    original_start: row.get(9)?,
                    is_deleted: is_deleted > 0,
                    link: row.get(11)?,
                    task_ids: Vec::new(),
                    all_day: row.get(12)?,
                    time_zone: row.get(13)?,
                })
            },
        )
        .map_err(|e| e.to_string())?;

    let mut blocks = Vec::new();
    for b in block_iter {
        let mut b = b.map_err(|e| e.to_string())?;

        let mut task_stmt = conn
            .prepare("SELECT task_id FROM timeblock_tasks WHERE timeblock_id = ?")
            .map_err(|e| e.to_string())?;
        let task_iter = task_stmt
            .query_map([&b.id], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?;

        for t in task_iter {
            b.task_ids.push(t.map_err(|e| e.to_string())?);
        }

        blocks.push(b);
    }

    serde_json::to_string(&blocks).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_recurring_timeblocks(
    state: tauri::State<'_, CalendarDb>,
    database_id: String,
) -> Result<String, String> {
    let lock = state.conn.lock().map_err(|e| e.to_string())?;
    let conn = checked(&lock, &database_id)?;
    get_recurring_timeblocks_on(conn)
}

pub fn get_recurring_timeblocks_on(conn: &Connection) -> Result<String, String> {
    // Fetch parent recurring blocks and all exceptions
    let mut stmt = conn.prepare("SELECT id, title, start_time, end_time, notes, completed, color, recurrence_rule, recurrence_id, original_start, is_deleted, link, all_day, time_zone FROM timeblocks WHERE recurrence_rule IS NOT NULL OR recurrence_id IS NOT NULL").map_err(|e| e.to_string())?;
    let block_iter = stmt
        .query_map([], |row| {
            let completed: i32 = row.get(5)?;
            let is_deleted: i32 = row.get(10).unwrap_or(0);
            Ok(TimeblockRow {
                id: row.get(0)?,
                title: row.get(1)?,
                start_time: row.get(2)?,
                end_time: row.get(3)?,
                notes: row.get(4)?,
                completed: completed > 0,
                color: row.get(6)?,
                recurrence_rule: row.get(7)?,
                recurrence_id: row.get(8)?,
                original_start: row.get(9)?,
                is_deleted: is_deleted > 0,
                link: row.get(11)?,
                task_ids: Vec::new(),
                all_day: row.get(12)?,
                time_zone: row.get(13)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut blocks = Vec::new();
    for b in block_iter {
        let mut b = b.map_err(|e| e.to_string())?;

        let mut task_stmt = conn
            .prepare("SELECT task_id FROM timeblock_tasks WHERE timeblock_id = ?")
            .map_err(|e| e.to_string())?;
        let task_iter = task_stmt
            .query_map([&b.id], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?;

        for t in task_iter {
            b.task_ids.push(t.map_err(|e| e.to_string())?);
        }

        blocks.push(b);
    }

    serde_json::to_string(&blocks).map_err(|e| e.to_string())
}

pub fn validate_schedule(
    start: &str,
    end: &str,
    all_day: bool,
    zone: Option<&str>,
    deleted: bool,
) -> Result<(), String> {
    let ordered = if all_day {
        if zone.is_some() {
            return Err("All-day events must not have a time zone".into());
        }
        let parse = |value: &str| -> Result<chrono::NaiveDate, String> {
            let date =
                chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d").map_err(|e| e.to_string())?;
            if date.format("%Y-%m-%d").to_string() != value {
                return Err("Use YYYY-MM-DD dates".into());
            }
            Ok(date)
        };
        parse(start)?.cmp(&parse(end)?)
    } else if let (Ok(start), Ok(end)) = (
        chrono::DateTime::parse_from_rfc3339(start),
        chrono::DateTime::parse_from_rfc3339(end),
    ) {
        if zone.is_some_and(|value| value.trim().is_empty()) {
            return Err("The event time zone must not be empty".into());
        }
        start.cmp(&end)
    } else {
        if zone.is_some() {
            return Err("Zoned events require timestamps with explicit offsets".into());
        }
        let parse = |value: &str| {
            chrono::NaiveDateTime::parse_from_str(value, "%Y-%m-%dT%H:%M:%S%.f")
                .or_else(|_| chrono::NaiveDateTime::parse_from_str(value, "%Y-%m-%dT%H:%M"))
                .map_err(|e| e.to_string())
        };
        parse(start)?.cmp(&parse(end)?)
    };
    if ordered.is_lt() || (deleted && ordered.is_eq()) {
        Ok(())
    } else {
        Err("The event end must be after its start".into())
    }
}

#[tauri::command]
pub fn add_timeblock(
    state: tauri::State<'_, CalendarDb>,
    database_id: String,
    id: String,
    title: String,
    start_time: String,
    end_time: String,
    notes: String,
    color: Option<String>,
    link: Option<String>,
    recurrence_rule: Option<String>,
    recurrence_id: Option<String>,
    original_start: Option<String>,
    is_deleted: Option<bool>,
    all_day: Option<bool>,
    time_zone: Option<String>,
) -> Result<(), String> {
    let lock = state.conn.lock().map_err(|e| e.to_string())?;
    let conn = checked(&lock, &database_id)?;
    add_timeblock_on(
        conn,
        id,
        title,
        start_time,
        end_time,
        notes,
        color,
        link,
        recurrence_rule,
        recurrence_id,
        original_start,
        is_deleted,
        all_day,
        time_zone,
    )
}

pub fn add_timeblock_on(
    conn: &Connection,
    id: String,
    title: String,
    start_time: String,
    end_time: String,
    notes: String,
    color: Option<String>,
    link: Option<String>,
    recurrence_rule: Option<String>,
    recurrence_id: Option<String>,
    original_start: Option<String>,
    is_deleted: Option<bool>,
    all_day: Option<bool>,
    time_zone: Option<String>,
) -> Result<(), String> {
    validate_schedule(
        &start_time,
        &end_time,
        all_day.unwrap_or(false),
        time_zone.as_deref(),
        is_deleted.unwrap_or(false),
    )?;
    let is_del_val = if is_deleted.unwrap_or(false) { 1 } else { 0 };

    conn.execute(
        "INSERT INTO timeblocks (id, title, start_time, end_time, notes, color, link, recurrence_rule, recurrence_id, original_start, is_deleted, all_day, time_zone) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        rusqlite::params![id, title, start_time, end_time, notes, color, link, recurrence_rule, recurrence_id, original_start, is_del_val, all_day.unwrap_or(false), time_zone],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_timeblock(
    state: tauri::State<'_, CalendarDb>,
    database_id: String,
    id: String,
    updates_json: String,
) -> Result<(), String> {
    let lock = state.conn.lock().map_err(|e| e.to_string())?;
    let conn = checked(&lock, &database_id)?;
    update_timeblock_on(conn, id, updates_json)
}

pub fn update_timeblock_on(
    conn: &Connection,
    id: String,
    updates_json: String,
) -> Result<(), String> {
    let updates: serde_json::Value =
        serde_json::from_str(&updates_json).map_err(|e| e.to_string())?;
    let obj = updates.as_object().ok_or("updates must be a JSON object")?;

    if obj.is_empty() {
        return Ok(());
    }

    if [
        "start_time",
        "end_time",
        "all_day",
        "time_zone",
        "is_deleted",
    ]
    .iter()
    .any(|key| obj.contains_key(*key))
    {
        let (start, end, day, zone, deleted): (String, String, bool, Option<String>, bool) = conn.query_row(
            "SELECT start_time, end_time, all_day, time_zone, is_deleted FROM timeblocks WHERE id=?1", [&id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
        ).map_err(|e| e.to_string())?;
        let zone = match obj.get("time_zone") {
            Some(value) => value.as_str(),
            None => zone.as_deref(),
        };
        validate_schedule(
            obj.get("start_time")
                .and_then(|v| v.as_str())
                .unwrap_or(&start),
            obj.get("end_time").and_then(|v| v.as_str()).unwrap_or(&end),
            obj.get("all_day").and_then(|v| v.as_bool()).unwrap_or(day),
            zone,
            obj.get("is_deleted")
                .and_then(|v| v.as_bool())
                .unwrap_or(deleted),
        )?;
    }

    let mut query = String::from("UPDATE timeblocks SET ");
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    let mut param_idx = 1;
    let mut sets = Vec::new();

    if let Some(title) = obj.get("title").and_then(|v| v.as_str()) {
        sets.push(format!("title = ?{}", param_idx));
        params.push(Box::new(title.to_string()));
        param_idx += 1;
    }
    if let Some(st) = obj.get("start_time").and_then(|v| v.as_str()) {
        sets.push(format!("start_time = ?{}", param_idx));
        params.push(Box::new(st.to_string()));
        param_idx += 1;
    }
    if let Some(et) = obj.get("end_time").and_then(|v| v.as_str()) {
        sets.push(format!("end_time = ?{}", param_idx));
        params.push(Box::new(et.to_string()));
        param_idx += 1;
    }
    if let Some(n) = obj.get("notes").and_then(|v| v.as_str()) {
        sets.push(format!("notes = ?{}", param_idx));
        params.push(Box::new(n.to_string()));
        param_idx += 1;
    }
    if let Some(c) = obj.get("completed").and_then(|v| v.as_bool()) {
        sets.push(format!("completed = ?{}", param_idx));
        params.push(Box::new(if c { 1i32 } else { 0i32 }));
        param_idx += 1;
    }
    if let Some(col) = obj.get("color") {
        if col.is_null() {
            sets.push("color = NULL".to_string());
        } else if let Some(s) = col.as_str() {
            sets.push(format!("color = ?{}", param_idx));
            params.push(Box::new(s.to_string()));
            param_idx += 1;
        }
    }
    if let Some(lnk) = obj.get("link") {
        if lnk.is_null() {
            sets.push("link = NULL".to_string());
        } else if let Some(s) = lnk.as_str() {
            sets.push(format!("link = ?{}", param_idx));
            params.push(Box::new(s.to_string()));
            param_idx += 1;
        }
    }
    if let Some(rr) = obj.get("recurrence_rule") {
        if rr.is_null() {
            sets.push("recurrence_rule = NULL".to_string());
        } else if let Some(s) = rr.as_str() {
            sets.push(format!("recurrence_rule = ?{}", param_idx));
            params.push(Box::new(s.to_string()));
            param_idx += 1;
        }
    }
    if let Some(rid) = obj.get("recurrence_id") {
        if rid.is_null() {
            sets.push("recurrence_id = NULL".to_string());
        } else if let Some(s) = rid.as_str() {
            sets.push(format!("recurrence_id = ?{}", param_idx));
            params.push(Box::new(s.to_string()));
            param_idx += 1;
        }
    }
    if let Some(ost) = obj.get("original_start") {
        if ost.is_null() {
            sets.push("original_start = NULL".to_string());
        } else if let Some(s) = ost.as_str() {
            sets.push(format!("original_start = ?{}", param_idx));
            params.push(Box::new(s.to_string()));
            param_idx += 1;
        }
    }
    if let Some(del) = obj.get("is_deleted").and_then(|v| v.as_bool()) {
        sets.push(format!("is_deleted = ?{}", param_idx));
        params.push(Box::new(if del { 1i32 } else { 0i32 }));
        param_idx += 1;
    }

    if let Some(day) = obj.get("all_day").and_then(|v| v.as_bool()) {
        sets.push(format!("all_day = ?{}", param_idx));
        params.push(Box::new(day as i32));
        param_idx += 1;
    }
    if let Some(zone) = obj.get("time_zone") {
        if zone.is_null() {
            sets.push("time_zone = NULL".to_string());
        } else if let Some(zone) = zone.as_str() {
            sets.push(format!("time_zone = ?{}", param_idx));
            params.push(Box::new(zone.to_string()));
            param_idx += 1;
        }
    }

    if sets.is_empty() {
        return Ok(());
    }

    sets.push("updated_at = datetime('now')".to_string());

    query.push_str(&sets.join(", "));
    query.push_str(&format!(" WHERE id = ?{}", param_idx));
    params.push(Box::new(id));

    let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();

    conn.execute(&query, rusqlite::params_from_iter(param_refs))
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_timeblock(
    state: tauri::State<'_, CalendarDb>,
    database_id: String,
    id: String,
) -> Result<(), String> {
    let lock = state.conn.lock().map_err(|e| e.to_string())?;
    let conn = checked(&lock, &database_id)?;
    delete_timeblock_on(conn, id)
}

pub fn delete_timeblock_on(conn: &Connection, id: String) -> Result<(), String> {
    conn.execute("DELETE FROM timeblocks WHERE id = ?", rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn assign_task_to_timeblock(
    state: tauri::State<'_, CalendarDb>,
    database_id: String,
    timeblock_id: String,
    task_id: String,
) -> Result<(), String> {
    let lock = state.conn.lock().map_err(|e| e.to_string())?;
    let conn = checked(&lock, &database_id)?;
    assign_task_to_timeblock_on(conn, timeblock_id, task_id)
}

pub fn assign_task_to_timeblock_on(
    conn: &Connection,
    timeblock_id: String,
    task_id: String,
) -> Result<(), String> {
    conn.execute(
        "INSERT OR IGNORE INTO timeblock_tasks (timeblock_id, task_id) VALUES (?, ?)",
        rusqlite::params![timeblock_id, task_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn remove_task_from_timeblock(
    state: tauri::State<'_, CalendarDb>,
    database_id: String,
    timeblock_id: String,
    task_id: String,
) -> Result<(), String> {
    let lock = state.conn.lock().map_err(|e| e.to_string())?;
    let conn = checked(&lock, &database_id)?;
    remove_task_from_timeblock_on(conn, timeblock_id, task_id)
}

pub fn remove_task_from_timeblock_on(
    conn: &Connection,
    timeblock_id: String,
    task_id: String,
) -> Result<(), String> {
    conn.execute(
        "DELETE FROM timeblock_tasks WHERE timeblock_id = ? AND task_id = ?",
        rusqlite::params![timeblock_id, task_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
