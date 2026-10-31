use super::{api::CalendarApi, GoogleError, Result};
use serde_json::{json, Value};
use std::collections::{HashMap, VecDeque};

#[derive(Default)]
pub struct FakeApi<'a> {
    pub events: HashMap<String, Value>,
    pub pages: VecDeque<Result<Value>>,
    pub list_calls: Vec<(Option<String>, Option<String>)>,
    pub writes: usize,
    pub fail_after_write: bool,
    pub on_write: Option<Box<dyn FnMut() + 'a>>,
    pub missing_calendar: bool,
    pub instance_events: Vec<Value>,
}
impl FakeApi<'_> {
    fn wrote(&mut self) -> Result<()> {
        self.writes += 1;
        if let Some(callback) = &mut self.on_write {
            callback();
        }
        if self.fail_after_write {
            self.fail_after_write = false;
            return Err(GoogleError {
                code: "network".into(),
                message: "Simulated lost response".into(),
                retryable: true,
            });
        }
        Ok(())
    }
}
impl CalendarApi for FakeApi<'_> {
    fn create_calendar(&mut self, name: &str, zone: &str, identity: &str) -> Result<Value> {
        Ok(
            json!({"id":"calendar","summary":name,"timeZone":zone,"description":format!("TODOer:{identity}")}),
        )
    }
    fn calendar(&mut self, id: &str) -> Result<Value> {
        if self.missing_calendar {
            Err(GoogleError::new("not_found", "Missing"))
        } else {
            Ok(json!({"id":id,"timeZone":"UTC"}))
        }
    }
    fn list(&mut self, _: &str, sync: Option<&str>, page: Option<&str>) -> Result<Value> {
        self.list_calls
            .push((sync.map(str::to_string), page.map(str::to_string)));
        self.pages
            .pop_front()
            .unwrap_or_else(|| Ok(json!({"items":[],"nextSyncToken":"next"})))
    }
    fn get(&mut self, _: &str, id: &str) -> Result<Value> {
        self.events
            .get(id)
            .cloned()
            .ok_or_else(|| GoogleError::new("not_found", "Missing"))
    }
    fn insert(&mut self, _: &str, event: &Value) -> Result<Value> {
        let id = event["id"].as_str().unwrap().to_string();
        if self.events.contains_key(&id) {
            return Err(GoogleError::new("already_exists", "Exists"));
        }
        let mut remote = event.clone();
        remote["etag"] = json!(format!("v{}", self.writes + 1));
        remote["htmlLink"] = json!("https://calendar.google.com/calendar/event?eid=test");
        self.events.insert(id, remote.clone());
        self.wrote()?;
        Ok(remote)
    }
    fn patch(&mut self, _: &str, id: &str, value: &Value, etag: &str) -> Result<Value> {
        let event = self
            .events
            .get_mut(id)
            .ok_or_else(|| GoogleError::new("not_found", "Missing"))?;
        if event["etag"].as_str() != Some(etag) {
            return Err(GoogleError::new("precondition", "Changed"));
        }
        for (key, value) in value.as_object().unwrap() {
            event[key] = value.clone();
        }
        event["etag"] = json!(format!("v{}", self.writes + 1));
        let result = event.clone();
        self.wrote()?;
        Ok(result)
    }
    fn delete(&mut self, _: &str, id: &str, etag: Option<&str>) -> Result<()> {
        let event = self
            .events
            .get_mut(id)
            .ok_or_else(|| GoogleError::new("not_found", "Missing"))?;
        if etag.is_some() && event["etag"].as_str() != etag {
            return Err(GoogleError::new("precondition", "Changed"));
        }
        event["status"] = json!("cancelled");
        self.wrote()
    }
    fn instances(&mut self, _: &str, _: &str, _: &str, _: &str, _: Option<&str>) -> Result<Value> {
        for event in &self.instance_events {
            self.events
                .entry(event["id"].as_str().unwrap().into())
                .or_insert_with(|| event.clone());
        }
        Ok(json!({"items":self.instance_events}))
    }
}

pub fn db() -> rusqlite::Connection {
    let mut db = rusqlite::Connection::open_in_memory().unwrap();
    crate::calendar::migrate(&mut db).unwrap();
    db.execute("INSERT INTO sync_binding(singleton,subject,calendar_id,time_zone,enabled,setup_state) VALUES(1,'user','calendar','UTC',1,'ready')",[]).unwrap();
    db
}
pub fn local(db: &rusqlite::Connection, id: &str) {
    db.execute("INSERT INTO timeblocks(id,title,start_time,end_time,time_zone) VALUES(?1,'Local','2026-01-01T09:00:00Z','2026-01-01T10:00:00Z','UTC')",[id]).unwrap();
}
