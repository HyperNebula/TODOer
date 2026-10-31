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
    if version > 1 {
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

#[tauri::command]
pub fn open_calendar_db(
    state: tauri::State<'_, CalendarDb>,
    list_path: String,
) -> Result<String, String> {
    let mut active = state.conn.lock().map_err(|e| e.to_string())?;
    let mut conn = Connection::open(database_path(&list_path)).map_err(|e| e.to_string())?;
    migrate(&mut conn)?;
    let session_id: String = conn
        .query_row("SELECT lower(hex(randomblob(16)))", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    *active = Some(OpenCalendar {
        connection: conn,
        session_id: session_id.clone(),
    });
    Ok(session_id)
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
                "SELECT is_deleted, link FROM timeblocks WHERE id='cancelled'",
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
) -> Result<String, String> {
    let lock = state.conn.lock().map_err(|e| e.to_string())?;
    let conn = checked(&lock, &database_id)?;
    get_timeblocks_for_range_on(conn, start, end)
}

pub fn get_timeblocks_for_range_on(
    conn: &Connection,
    start: String,
    end: String,
) -> Result<String, String> {
    let mut stmt = conn.prepare("SELECT id, title, start_time, end_time, notes, completed, color, recurrence_rule, recurrence_id, original_start, is_deleted, link FROM timeblocks WHERE start_time < ? AND end_time > ? AND is_deleted = 0").map_err(|e| e.to_string())?;
    let block_iter = stmt
        .query_map([&end, &start], |row| {
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
    let mut stmt = conn.prepare("SELECT id, title, start_time, end_time, notes, completed, color, recurrence_rule, recurrence_id, original_start, is_deleted, link FROM timeblocks WHERE recurrence_rule IS NOT NULL OR recurrence_id IS NOT NULL").map_err(|e| e.to_string())?;
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
) -> Result<(), String> {
    let is_del_val = if is_deleted.unwrap_or(false) { 1 } else { 0 };

    conn.execute(
        "INSERT INTO timeblocks (id, title, start_time, end_time, notes, color, link, recurrence_rule, recurrence_id, original_start, is_deleted) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        rusqlite::params![id, title, start_time, end_time, notes, color, link, recurrence_rule, recurrence_id, original_start, is_del_val],
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
