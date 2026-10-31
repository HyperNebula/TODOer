use super::{mapping, GoogleError, Result};
use crate::calendar::TimeblockRow;
use rusqlite::{Connection, OptionalExtension};
use serde::Serialize;
use serde_json::Value;

pub fn migrate(conn: &Connection) -> Result<()> {
    conn.execute_batch("CREATE TABLE IF NOT EXISTS sync_binding (
        singleton INTEGER PRIMARY KEY CHECK(singleton=1), subject TEXT NOT NULL,
        calendar_id TEXT NOT NULL DEFAULT '', time_zone TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 0, setup_state TEXT NOT NULL DEFAULT 'creating',
        sync_token TEXT, last_success TEXT, pause_reason TEXT, connection_epoch TEXT NOT NULL DEFAULT '');
        CREATE TABLE IF NOT EXISTS sync_control (singleton INTEGER PRIMARY KEY CHECK(singleton=1), importing INTEGER NOT NULL DEFAULT 0, revision INTEGER NOT NULL DEFAULT 0);
        INSERT OR IGNORE INTO sync_control(singleton) VALUES(1);
        CREATE TABLE IF NOT EXISTS sync_events (local_id TEXT PRIMARY KEY, remote_id TEXT NOT NULL UNIQUE, etag TEXT, base_json TEXT, raw_json TEXT, html_link TEXT);
        CREATE TABLE IF NOT EXISTS sync_outbox (local_id TEXT PRIMARY KEY, revision INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS sync_conflicts (local_id TEXT PRIMARY KEY, remote_json TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'changed', series_id TEXT);
        CREATE TABLE IF NOT EXISTS sync_remote_cache (remote_id TEXT PRIMARY KEY, raw_json TEXT NOT NULL);").map_err(GoogleError::storage)?;
    let changed = [
        "title",
        "notes",
        "start_time",
        "end_time",
        "all_day",
        "time_zone",
        "recurrence_rule",
        "recurrence_id",
        "original_start",
        "is_deleted",
    ];
    for (name, action, record, condition, deleted) in [
        (
            "sync_local_insert",
            "INSERT".to_string(),
            "NEW",
            "1".to_string(),
            "NEW.is_deleted",
        ),
        (
            "sync_local_update",
            format!("UPDATE OF {}", changed.join(",")),
            "NEW",
            changed
                .iter()
                .map(|field| format!("OLD.{field} IS NOT NEW.{field}"))
                .collect::<Vec<_>>()
                .join(" OR "),
            "NEW.is_deleted",
        ),
        (
            "sync_local_delete",
            "DELETE".to_string(),
            "OLD",
            "1".to_string(),
            "1",
        ),
    ] {
        conn.execute_batch(&format!("CREATE TRIGGER IF NOT EXISTS {name} AFTER {action} ON timeblocks
            WHEN (SELECT importing FROM sync_control WHERE singleton=1)=0 AND EXISTS(SELECT 1 FROM sync_binding) AND ({condition})
            BEGIN
                UPDATE sync_control SET revision=revision+1 WHERE singleton=1;
                INSERT INTO sync_outbox(local_id,revision,deleted) VALUES({record}.id,(SELECT revision FROM sync_control WHERE singleton=1),{deleted})
                ON CONFLICT(local_id) DO UPDATE SET revision=excluded.revision,deleted=excluded.deleted;
            END;")).map_err(GoogleError::storage)?;
    }
    Ok(())
}

#[derive(Clone, Serialize)]
pub struct Binding {
    pub subject: String,
    pub calendar_id: String,
    pub time_zone: String,
    pub enabled: bool,
    pub setup_state: String,
    #[serde(skip_serializing)]
    pub sync_token: Option<String>,
    pub last_success: Option<String>,
    pub pause_reason: Option<String>,
    #[serde(skip_serializing)]
    pub connection_epoch: String,
}

pub fn binding(conn: &Connection) -> Result<Option<Binding>> {
    conn.query_row("SELECT subject,calendar_id,time_zone,enabled,setup_state,sync_token,last_success,pause_reason,connection_epoch FROM sync_binding WHERE singleton=1", [], |row| Ok(Binding {
        subject: row.get(0)?, calendar_id: row.get(1)?, time_zone: row.get(2)?, enabled: row.get(3)?, setup_state: row.get(4)?,
        sync_token: row.get(5)?, last_success: row.get(6)?, pause_reason: row.get(7)?, connection_epoch: row.get(8)?,
    })).optional().map_err(GoogleError::storage)
}

pub fn identity(conn: &Connection) -> Result<String> {
    conn.query_row(
        "SELECT value FROM calendar_metadata WHERE key='calendar_id'",
        [],
        |r| r.get(0),
    )
    .map_err(GoogleError::storage)
}

pub fn rows(conn: &Connection) -> Result<Vec<TimeblockRow>> {
    let mut stmt = conn.prepare("SELECT id,title,start_time,end_time,notes,completed,color,link,recurrence_rule,recurrence_id,original_start,is_deleted,all_day,time_zone FROM timeblocks").map_err(GoogleError::storage)?;
    let rows = stmt
        .query_map([], |r| {
            Ok(TimeblockRow {
                id: r.get(0)?,
                title: r.get(1)?,
                start_time: r.get(2)?,
                end_time: r.get(3)?,
                notes: r.get(4)?,
                completed: r.get(5)?,
                color: r.get(6)?,
                link: r.get(7)?,
                recurrence_rule: r.get(8)?,
                recurrence_id: r.get(9)?,
                original_start: r.get(10)?,
                is_deleted: r.get(11)?,
                all_day: r.get(12)?,
                time_zone: r.get(13)?,
                task_ids: vec![],
            })
        })
        .map_err(GoogleError::storage)?;
    rows.collect::<std::result::Result<Vec<_>, _>>()
        .map_err(GoogleError::storage)
}

pub fn row(conn: &Connection, id: &str) -> Result<Option<TimeblockRow>> {
    Ok(rows(conn)?.into_iter().find(|row| row.id == id))
}

pub fn importing<T>(
    conn: &Connection,
    operation: impl FnOnce(&Connection) -> Result<T>,
) -> Result<T> {
    let tx = conn.unchecked_transaction().map_err(GoogleError::storage)?;
    tx.execute("UPDATE sync_control SET importing=1 WHERE singleton=1", [])
        .map_err(GoogleError::storage)?;
    let result = operation(&tx)?;
    tx.execute("UPDATE sync_control SET importing=0 WHERE singleton=1", [])
        .map_err(GoogleError::storage)?;
    tx.commit().map_err(GoogleError::storage)?;
    Ok(result)
}

pub fn write_row(conn: &Connection, row: &TimeblockRow) -> Result<()> {
    crate::calendar::validate_schedule(
        &row.start_time,
        &row.end_time,
        row.all_day,
        row.time_zone.as_deref(),
        row.is_deleted,
    )
    .map_err(GoogleError::storage)?;
    conn.execute("INSERT INTO timeblocks(id,title,start_time,end_time,notes,all_day,time_zone,recurrence_rule,recurrence_id,original_start,is_deleted)
        VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)
        ON CONFLICT(id) DO UPDATE SET title=excluded.title,start_time=excluded.start_time,end_time=excluded.end_time,notes=excluded.notes,
        all_day=excluded.all_day,time_zone=excluded.time_zone,recurrence_rule=excluded.recurrence_rule,recurrence_id=excluded.recurrence_id,original_start=excluded.original_start,is_deleted=excluded.is_deleted,updated_at=datetime('now')",
        rusqlite::params![row.id,row.title,row.start_time,row.end_time,row.notes,row.all_day,row.time_zone,row.recurrence_rule,row.recurrence_id,row.original_start,row.is_deleted]).map_err(GoogleError::storage)?;
    Ok(())
}

pub fn queue_all(conn: &Connection) -> Result<()> {
    conn.execute_batch("UPDATE sync_control SET revision=revision+1 WHERE singleton=1;
        INSERT INTO sync_outbox(local_id,revision,deleted) SELECT id,(SELECT revision FROM sync_control WHERE singleton=1),is_deleted FROM timeblocks WHERE 1
        ON CONFLICT(local_id) DO UPDATE SET revision=excluded.revision,deleted=excluded.deleted;").map_err(GoogleError::storage)
}

#[derive(Clone)]
pub struct Pending {
    pub local_id: String,
    pub revision: i64,
    pub deleted: bool,
}
pub fn pending(conn: &Connection) -> Result<Vec<Pending>> {
    let mut stmt=conn.prepare("SELECT local_id,revision,deleted FROM sync_outbox WHERE local_id NOT IN (SELECT local_id FROM sync_conflicts) ORDER BY revision,local_id").map_err(GoogleError::storage)?;
    let result = stmt
        .query_map([], |r| {
            Ok(Pending {
                local_id: r.get(0)?,
                revision: r.get(1)?,
                deleted: r.get(2)?,
            })
        })
        .map_err(GoogleError::storage)?;
    result
        .collect::<std::result::Result<Vec<_>, _>>()
        .map_err(GoogleError::storage)
}

#[derive(Clone)]
pub struct EventMapping {
    pub local_id: String,
    pub remote_id: String,
    pub etag: Option<String>,
    pub base: Option<Value>,
    pub raw: Option<Value>,
}
pub fn mappings(conn: &Connection) -> Result<Vec<EventMapping>> {
    let mut stmt = conn
        .prepare("SELECT local_id,remote_id,etag,base_json,raw_json FROM sync_events")
        .map_err(GoogleError::storage)?;
    let result = stmt
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, Option<String>>(2)?,
                r.get::<_, Option<String>>(3)?,
                r.get::<_, Option<String>>(4)?,
            ))
        })
        .map_err(GoogleError::storage)?;
    result
        .map(|r| {
            let (local_id, remote_id, etag, base, raw) = r.map_err(GoogleError::storage)?;
            Ok(EventMapping {
                local_id,
                remote_id,
                etag,
                base: base
                    .map(|s| serde_json::from_str(&s))
                    .transpose()
                    .map_err(GoogleError::storage)?,
                raw: raw
                    .map(|s| serde_json::from_str(&s))
                    .transpose()
                    .map_err(GoogleError::storage)?,
            })
        })
        .collect()
}

pub fn ensure_mapping(conn: &Connection, local_id: &str) -> Result<EventMapping> {
    let remote_id = mapping::stable_id(&identity(conn)?, local_id);
    conn.execute(
        "INSERT OR IGNORE INTO sync_events(local_id,remote_id) VALUES(?1,?2)",
        [local_id, &remote_id],
    )
    .map_err(GoogleError::storage)?;
    mappings(conn)?
        .into_iter()
        .find(|entry| entry.local_id == local_id)
        .ok_or_else(|| GoogleError::new("storage", "An event mapping could not be created."))
}

pub fn acknowledge(conn: &Connection, pending: &Pending, remote: &Value, zone: &str) -> Result<()> {
    let base = if pending.deleted {
        Value::Null
    } else {
        mapping::canonical(remote, zone)?
    };
    let tx = conn.unchecked_transaction().map_err(GoogleError::storage)?;
    tx.execute(
        "UPDATE sync_events SET etag=?2,base_json=?3,raw_json=?4,html_link=?5 WHERE local_id=?1",
        rusqlite::params![
            pending.local_id,
            remote["etag"].as_str(),
            base.to_string(),
            remote.to_string(),
            remote["htmlLink"].as_str()
        ],
    )
    .map_err(GoogleError::storage)?;
    tx.execute(
        "DELETE FROM sync_outbox WHERE local_id=?1 AND revision=?2",
        rusqlite::params![pending.local_id, pending.revision],
    )
    .map_err(GoogleError::storage)?;
    tx.commit().map_err(GoogleError::storage)
}

pub fn conflict(
    conn: &Connection,
    local_id: &str,
    remote: &Value,
    kind: &str,
    series: Option<&str>,
) -> Result<()> {
    conn.execute("INSERT INTO sync_conflicts(local_id,remote_json,kind,series_id) VALUES(?1,?2,?3,?4) ON CONFLICT(local_id) DO UPDATE SET remote_json=excluded.remote_json,kind=excluded.kind,series_id=excluded.series_id",rusqlite::params![local_id,remote.to_string(),kind,series]).map_err(GoogleError::storage)?;
    Ok(())
}

pub fn clear_binding(conn: &Connection) -> Result<()> {
    conn.execute_batch("DELETE FROM sync_binding; DELETE FROM sync_events; DELETE FROM sync_outbox; DELETE FROM sync_conflicts; DELETE FROM sync_remote_cache;").map_err(GoogleError::storage)
}

#[cfg(test)]
mod tests {
    use super::*;
    pub fn db() -> Connection {
        let mut db = Connection::open_in_memory().unwrap();
        crate::calendar::migrate(&mut db).unwrap();
        db.execute("INSERT INTO sync_binding(singleton,subject,calendar_id,time_zone,enabled,setup_state) VALUES(1,'user','calendar','UTC',1,'ready')",[]).unwrap();
        db
    }
    #[test]
    fn changes_are_durable_coalesced_and_metadata_does_not_queue() {
        let db = db();
        db.execute("INSERT INTO timeblocks(id,title,start_time,end_time) VALUES('one','First','2026-01-01T09:00:00','2026-01-01T10:00:00')",[]).unwrap();
        let first = pending(&db).unwrap()[0].revision;
        db.execute("UPDATE timeblocks SET title='Second' WHERE id='one'", [])
            .unwrap();
        assert_eq!(pending(&db).unwrap().len(), 1);
        assert!(pending(&db).unwrap()[0].revision > first);
        let revision = pending(&db).unwrap()[0].revision;
        db.execute(
            "UPDATE timeblocks SET completed=1,color='red' WHERE id='one'",
            [],
        )
        .unwrap();
        assert_eq!(pending(&db).unwrap()[0].revision, revision);
        db.execute("DELETE FROM timeblocks WHERE id='one'", [])
            .unwrap();
        assert!(pending(&db).unwrap()[0].deleted);
    }
    #[test]
    fn imported_changes_do_not_echo_and_failed_transactions_roll_back() {
        let db = db();
        importing(&db, |db| {
            db.execute(
                "INSERT INTO timeblocks(id,start_time,end_time) VALUES('one','start','end')",
                [],
            )
            .map_err(GoogleError::storage)?;
            Ok(())
        })
        .unwrap();
        assert!(pending(&db).unwrap().is_empty());
        let failed: Result<()> = importing(&db, |db| {
            db.execute("UPDATE timeblocks SET title='bad'", []).unwrap();
            Err(GoogleError::new("test", "rollback"))
        });
        assert!(failed.is_err());
        assert_ne!(rows(&db).unwrap()[0].title, "bad");
        db.execute("UPDATE timeblocks SET title='local'", [])
            .unwrap();
        assert_eq!(pending(&db).unwrap().len(), 1);
    }
    #[test]
    fn acknowledging_an_older_upload_retains_a_newer_local_revision() {
        let db = db();
        db.execute(
            "INSERT INTO timeblocks(id,start_time,end_time) VALUES('one','start','end')",
            [],
        )
        .unwrap();
        ensure_mapping(&db, "one").unwrap();
        let old = pending(&db).unwrap().remove(0);
        db.execute("DELETE FROM timeblocks WHERE id='one'", [])
            .unwrap();
        acknowledge(
            &db,
            &Pending {
                deleted: true,
                ..old
            },
            &Value::Null,
            "UTC",
        )
        .unwrap();
        assert_eq!(pending(&db).unwrap().len(), 1);
    }
}
