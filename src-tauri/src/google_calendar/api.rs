use super::{
    auth::{http_client, network_error, GoogleAuth},
    GoogleError, Result,
};
use reqwest::{blocking::Client, Method, Url};
use serde_json::Value;

pub trait Tokens: Send + Sync {
    fn access(&self) -> Result<(String, String)>;
    fn invalidate(&self);
}
impl Tokens for GoogleAuth {
    fn access(&self) -> Result<(String, String)> {
        self.access_token()
    }
    fn invalidate(&self) {
        self.invalidate_access();
    }
}

pub trait CalendarApi {
    fn create_calendar(&mut self, name: &str, zone: &str, identity: &str) -> Result<Value>;
    fn calendar(&mut self, calendar: &str) -> Result<Value>;
    fn list(&mut self, calendar: &str, sync: Option<&str>, page: Option<&str>) -> Result<Value>;
    fn get(&mut self, calendar: &str, event: &str) -> Result<Value>;
    fn insert(&mut self, calendar: &str, event: &Value) -> Result<Value>;
    fn patch(&mut self, calendar: &str, event: &str, value: &Value, etag: &str) -> Result<Value>;
    fn delete(&mut self, calendar: &str, event: &str, etag: Option<&str>) -> Result<()>;
    fn instances(
        &mut self,
        calendar: &str,
        event: &str,
        start: &str,
        end: &str,
        page: Option<&str>,
    ) -> Result<Value>;
}

pub struct HttpApi<'a> {
    tokens: &'a dyn Tokens,
    subject: String,
    client: Client,
    base: Url,
}

impl<'a> HttpApi<'a> {
    pub fn new(tokens: &'a dyn Tokens, subject: &str) -> Result<Self> {
        Ok(Self {
            tokens,
            subject: subject.into(),
            client: http_client()?,
            base: Url::parse("https://www.googleapis.com/calendar/v3/").unwrap(),
        })
    }

    fn request(
        &mut self,
        method: Method,
        path: &[&str],
        value: Option<&Value>,
        etag: Option<&str>,
        query: &[(&str, &str)],
    ) -> Result<Value> {
        let mut url = self.base.clone();
        url.path_segments_mut()
            .map_err(|_| GoogleError::new("configuration", "Invalid Calendar API endpoint."))?
            .pop_if_empty()
            .extend(path);
        url.query_pairs_mut().extend_pairs(query.iter().copied());
        for attempt in 0..2 {
            let (subject, token) = self.tokens.access()?;
            if subject != self.subject {
                return Err(GoogleError::new("account_mismatch", "This task list belongs to another Google account. Reconnect its account or explicitly set up a new calendar."));
            }
            let mut request = self
                .client
                .request(method.clone(), url.clone())
                .bearer_auth(token);
            if let Some(value) = value {
                request = request.json(value);
            }
            if let Some(etag) = etag {
                request = request.header(reqwest::header::IF_MATCH, etag);
            }
            let response = request.send().map_err(network_error)?;
            let status = response.status().as_u16();
            if status == 401 && attempt == 0 {
                self.tokens.invalidate();
                continue;
            }
            if status == 204 {
                return Ok(Value::Null);
            }
            if (200..300).contains(&status) {
                return response.json().map_err(network_error);
            }
            let error: Value = response.json().unwrap_or(Value::Null);
            let rate_limited = status == 429
                || (status == 403
                    && error["error"]["errors"].as_array().is_some_and(|items| {
                        items.iter().any(|item| {
                            matches!(
                                item["reason"].as_str(),
                                Some(
                                    "rateLimitExceeded" | "userRateLimitExceeded" | "quotaExceeded"
                                )
                            )
                        })
                    }));
            let (code, message) = match status {
                401 => ("reconnect", "Google authorization expired. Reconnect your account."),
                403 if !rate_limited => ("permission", "Google denied access to this calendar. Check your account permissions."),
                404 => ("not_found", "The Google calendar or event is no longer available."),
                409 => ("already_exists", "The Google event already exists."),
                410 => ("gone", "Google requires a fresh sync or the event was already deleted."),
                412 => ("precondition", "The Google event changed while syncing. Both versions have been preserved."),
                _ if rate_limited => ("rate_limit", "Google temporarily limited sync requests. TODOer will retry."),
                _ if status >= 500 => ("server", "Google Calendar is temporarily unavailable. TODOer will retry."),
                _ => ("invalid_event", "Google could not accept this calendar change. Review its schedule and recurrence."),
            };
            return Err(GoogleError {
                code: code.into(),
                message: message.into(),
                retryable: rate_limited || status >= 500,
            });
        }
        unreachable!()
    }
}

impl CalendarApi for HttpApi<'_> {
    fn create_calendar(&mut self, name: &str, zone: &str, identity: &str) -> Result<Value> {
        self.request(Method::POST, &["calendars"], Some(&serde_json::json!({ "summary": name, "timeZone": zone, "description": format!("TODOer:{identity}") })), None, &[])
    }
    fn calendar(&mut self, calendar: &str) -> Result<Value> {
        self.request(Method::GET, &["calendars", calendar], None, None, &[])
    }
    fn list(&mut self, calendar: &str, sync: Option<&str>, page: Option<&str>) -> Result<Value> {
        let mut query = vec![
            ("singleEvents", "false"),
            ("showDeleted", "true"),
            ("maxResults", "2500"),
        ];
        if let Some(token) = sync {
            query.push(("syncToken", token));
        }
        if let Some(token) = page {
            query.push(("pageToken", token));
        }
        self.request(
            Method::GET,
            &["calendars", calendar, "events"],
            None,
            None,
            &query,
        )
    }
    fn get(&mut self, calendar: &str, event: &str) -> Result<Value> {
        self.request(
            Method::GET,
            &["calendars", calendar, "events", event],
            None,
            None,
            &[],
        )
    }
    fn insert(&mut self, calendar: &str, event: &Value) -> Result<Value> {
        self.request(
            Method::POST,
            &["calendars", calendar, "events"],
            Some(event),
            None,
            &[("sendUpdates", "none")],
        )
    }
    fn patch(&mut self, calendar: &str, event: &str, value: &Value, etag: &str) -> Result<Value> {
        self.request(
            Method::PATCH,
            &["calendars", calendar, "events", event],
            Some(value),
            Some(etag),
            &[("sendUpdates", "none")],
        )
    }
    fn delete(&mut self, calendar: &str, event: &str, etag: Option<&str>) -> Result<()> {
        self.request(
            Method::DELETE,
            &["calendars", calendar, "events", event],
            None,
            etag,
            &[("sendUpdates", "none")],
        )
        .map(|_| ())
    }
    fn instances(
        &mut self,
        calendar: &str,
        event: &str,
        start: &str,
        end: &str,
        page: Option<&str>,
    ) -> Result<Value> {
        let mut query = vec![
            ("showDeleted", "true"),
            ("timeMin", start),
            ("timeMax", end),
            ("maxResults", "2500"),
        ];
        if let Some(page) = page {
            query.push(("pageToken", page));
        }
        self.request(
            Method::GET,
            &["calendars", calendar, "events", event, "instances"],
            None,
            None,
            &query,
        )
    }
}
