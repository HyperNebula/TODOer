use std::sync::Mutex;
use rusqlite::Connection;
use serde::{Serialize, Deserialize};
use std::path::Path;

pub struct CalendarDb {
    conn: Mutex<Option<Connection>>,
}

impl CalendarDb {
    pub fn new() -> Self {
        CalendarDb { conn: Mutex::new(None) }
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
    pub task_ids: Vec<String>,
}

#[tauri::command]
pub fn open_calendar_db(state: tauri::State<'_, CalendarDb>, list_path: String) -> Result<(), String> {
    let p = Path::new(&list_path);
    let mut db_path = p.to_path_buf();
    db_path.set_extension("calendar.db");
    
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS timeblocks (
            id          TEXT PRIMARY KEY,
            title       TEXT NOT NULL DEFAULT 'New Timeblock',
            start_time  TEXT NOT NULL,
            end_time    TEXT NOT NULL,
            notes       TEXT DEFAULT '',
            completed   INTEGER DEFAULT 0,
            color       TEXT,
            created_at  TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS timeblock_tasks (
            timeblock_id TEXT NOT NULL,
            task_id      TEXT NOT NULL,
            PRIMARY KEY (timeblock_id, task_id),
            FOREIGN KEY (timeblock_id) REFERENCES timeblocks(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_timeblocks_start ON timeblocks(start_time);
        CREATE INDEX IF NOT EXISTS idx_timeblocks_end ON timeblocks(end_time);"
    ).map_err(|e| e.to_string())?;

    *state.conn.lock().unwrap() = Some(conn);
    Ok(())
}

#[tauri::command]
pub fn close_calendar_db(state: tauri::State<'_, CalendarDb>) -> Result<(), String> {
    *state.conn.lock().unwrap() = None;
    Ok(())
}

#[tauri::command]
pub fn get_timeblocks_for_range(state: tauri::State<'_, CalendarDb>, start: String, end: String) -> Result<String, String> {
    let lock = state.conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No calendar database is open")?;
    
    let mut stmt = conn.prepare("SELECT id, title, start_time, end_time, notes, completed, color FROM timeblocks WHERE start_time < ? AND end_time > ?").map_err(|e| e.to_string())?;
    let block_iter = stmt.query_map([&end, &start], |row| {
        let completed: i32 = row.get(5)?;
        Ok(TimeblockRow {
            id: row.get(0)?,
            title: row.get(1)?,
            start_time: row.get(2)?,
            end_time: row.get(3)?,
            notes: row.get(4)?,
            completed: completed > 0,
            color: row.get(6)?,
            task_ids: Vec::new(),
        })
    }).map_err(|e| e.to_string())?;
    
    let mut blocks = Vec::new();
    for b in block_iter {
        let mut b = b.map_err(|e| e.to_string())?;
        
        let mut task_stmt = conn.prepare("SELECT task_id FROM timeblock_tasks WHERE timeblock_id = ?").map_err(|e| e.to_string())?;
        let task_iter = task_stmt.query_map([&b.id], |row| {
            row.get::<_, String>(0)
        }).map_err(|e| e.to_string())?;
        
        for t in task_iter {
            b.task_ids.push(t.map_err(|e| e.to_string())?);
        }
        
        blocks.push(b);
    }
    
    serde_json::to_string(&blocks).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_timeblock(state: tauri::State<'_, CalendarDb>, id: String, title: String, start_time: String, end_time: String, notes: String, color: Option<String>) -> Result<(), String> {
    let lock = state.conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No calendar database is open")?;
    
    conn.execute(
        "INSERT INTO timeblocks (id, title, start_time, end_time, notes, color) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![id, title, start_time, end_time, notes, color],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_timeblock(state: tauri::State<'_, CalendarDb>, id: String, updates_json: String) -> Result<(), String> {
    let lock = state.conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No calendar database is open")?;
    
    let updates: serde_json::Value = serde_json::from_str(&updates_json).map_err(|e| e.to_string())?;
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
            sets.push(format!("color = NULL"));
        } else if let Some(s) = col.as_str() {
            sets.push(format!("color = ?{}", param_idx));
            params.push(Box::new(s.to_string()));
            param_idx += 1;
        }
    }
    
    if sets.is_empty() {
        return Ok(());
    }
    
    sets.push(format!("updated_at = datetime('now')"));
    
    query.push_str(&sets.join(", "));
    query.push_str(&format!(" WHERE id = ?{}", param_idx));
    params.push(Box::new(id));
    
    let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();
    
    conn.execute(&query, rusqlite::params_from_iter(param_refs)).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_timeblock(state: tauri::State<'_, CalendarDb>, id: String) -> Result<(), String> {
    let lock = state.conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No calendar database is open")?;
    conn.execute("DELETE FROM timeblocks WHERE id = ?", rusqlite::params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn assign_task_to_timeblock(state: tauri::State<'_, CalendarDb>, timeblock_id: String, task_id: String) -> Result<(), String> {
    let lock = state.conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No calendar database is open")?;
    conn.execute("INSERT OR IGNORE INTO timeblock_tasks (timeblock_id, task_id) VALUES (?, ?)", rusqlite::params![timeblock_id, task_id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn remove_task_from_timeblock(state: tauri::State<'_, CalendarDb>, timeblock_id: String, task_id: String) -> Result<(), String> {
    let lock = state.conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No calendar database is open")?;
    conn.execute("DELETE FROM timeblock_tasks WHERE timeblock_id = ? AND task_id = ?", rusqlite::params![timeblock_id, task_id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn migrate_timeblocks_from_json(state: tauri::State<'_, CalendarDb>, json: String) -> Result<(), String> {
    let mut lock = state.conn.lock().unwrap();
    let conn = lock.as_mut().ok_or("No calendar database is open")?;
    
    let blocks: Vec<TimeblockRow> = serde_json::from_str(&json).map_err(|e| e.to_string())?;
    
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    
    for b in blocks {
        let comp = if b.completed { 1i32 } else { 0i32 };
        tx.execute(
            "INSERT INTO timeblocks (id, title, start_time, end_time, notes, completed, color) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![b.id, b.title, b.start_time, b.end_time, b.notes, comp, b.color],
        ).map_err(|e| e.to_string())?;
        
        for t in b.task_ids {
            tx.execute(
                "INSERT OR IGNORE INTO timeblock_tasks (timeblock_id, task_id) VALUES (?1, ?2)",
                rusqlite::params![b.id, t],
            ).map_err(|e| e.to_string())?;
        }
    }
    
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}
