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

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        io::{Read, Write},
        net::TcpListener,
        sync::{
            atomic::{AtomicUsize, Ordering},
            mpsc,
        },
        time::Duration,
    };

    #[derive(Default)]
    struct TestTokens(AtomicUsize);
    impl Tokens for TestTokens {
        fn access(&self) -> Result<(String, String)> {
            Ok((
                "user".into(),
                format!("test-token-{}", self.0.load(Ordering::SeqCst)),
            ))
        }
        fn invalidate(&self) {
            self.0.fetch_add(1, Ordering::SeqCst);
        }
    }

    // The configurable HTTP endpoint exists only in tests. Production stays HTTPS-only.
    fn server(
        responses: Vec<(u16, Value)>,
    ) -> (Url, mpsc::Receiver<String>, std::thread::JoinHandle<()>) {
        let listener = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0)).unwrap();
        listener.set_nonblocking(true).unwrap();
        let base = Url::parse(&format!(
            "http://{}/calendar/v3/",
            listener.local_addr().unwrap()
        ))
        .unwrap();
        let (send, receive) = mpsc::channel();
        let worker = std::thread::spawn(move || {
            for (status, body) in responses {
                let deadline = std::time::Instant::now() + Duration::from_secs(10);
                let mut stream = loop {
                    match listener.accept() {
                        Ok((stream, _)) => break stream,
                        Err(error)
                            if error.kind() == std::io::ErrorKind::WouldBlock
                                && std::time::Instant::now() < deadline =>
                        {
                            std::thread::sleep(Duration::from_millis(5))
                        }
                        other => panic!("Missing test request: {other:?}"),
                    }
                };
                stream.set_nonblocking(false).unwrap();
                stream
                    .set_read_timeout(Some(Duration::from_secs(3)))
                    .unwrap();
                let mut bytes = Vec::new();
                let mut chunk = [0; 1024];
                loop {
                    let count = stream.read(&mut chunk).unwrap();
                    assert!(count > 0 && bytes.len() < 65536);
                    bytes.extend_from_slice(&chunk[..count]);
                    if let Some(end) = bytes.windows(4).position(|part| part == b"\r\n\r\n") {
                        let headers = String::from_utf8_lossy(&bytes[..end]);
                        let length = headers
                            .lines()
                            .filter_map(|line| line.split_once(':'))
                            .find(|(name, _)| name.eq_ignore_ascii_case("content-length"))
                            .map(|(_, value)| value.trim().parse::<usize>().unwrap())
                            .unwrap_or(0);
                        if bytes.len() >= end + 4 + length {
                            break;
                        }
                    }
                }
                send.send(String::from_utf8(bytes).unwrap()).unwrap();
                let body = if status == 204 {
                    String::new()
                } else {
                    body.to_string()
                };
                write!(stream, "HTTP/1.1 {status} Test\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).unwrap();
            }
        });
        (base, receive, worker)
    }
    fn client<'a>(tokens: &'a TestTokens, base: Url) -> HttpApi<'a> {
        let _ = rustls::crypto::ring::default_provider().install_default();
        HttpApi {
            tokens,
            subject: "user".into(),
            client: Client::builder()
                .no_proxy()
                .timeout(Duration::from_secs(5))
                .build()
                .unwrap(),
            base,
        }
    }

    #[test]
    fn wire_format_escapes_ids_and_preserves_sync_parameters_and_etags() {
        let (base, requests, worker) = server(vec![
            (200, serde_json::json!({"items":[]})),
            (200, serde_json::json!({"id":"event"})),
            (204, Value::Null),
        ]);
        let tokens = TestTokens::default();
        let mut api = client(&tokens, base);
        api.list(
            "user/calendar@example.com",
            Some("sync+/= token"),
            Some("page&next"),
        )
        .unwrap();
        api.patch(
            "calendar",
            "event/id",
            &serde_json::json!({"summary":"Changed"}),
            "\"v1\"",
        )
        .unwrap();
        api.delete("calendar", "event/id", Some("\"v2\"")).unwrap();
        worker.join().unwrap();
        let list = requests.recv().unwrap();
        let target = list
            .lines()
            .next()
            .unwrap()
            .split_whitespace()
            .nth(1)
            .unwrap();
        assert!(target.starts_with("/calendar/v3/calendars/user%2Fcalendar@example.com/events?"));
        let query: std::collections::HashMap<_, _> =
            Url::parse(&format!("http://localhost{target}"))
                .unwrap()
                .query_pairs()
                .into_owned()
                .collect();
        assert_eq!(query["syncToken"], "sync+/= token");
        assert_eq!(query["pageToken"], "page&next");
        assert_eq!(query["singleEvents"], "false");
        assert_eq!(query["showDeleted"], "true");
        assert_eq!(query["maxResults"], "2500");
        let patch = requests.recv().unwrap();
        assert!(patch.starts_with(
            "PATCH /calendar/v3/calendars/calendar/events/event%2Fid?sendUpdates=none "
        ));
        assert!(patch.to_lowercase().contains("if-match: \"v1\"\r\n"));
        assert!(patch.ends_with("{\"summary\":\"Changed\"}"));
        let delete = requests.recv().unwrap();
        assert!(delete.starts_with("DELETE "));
        assert!(delete.to_lowercase().contains("if-match: \"v2\"\r\n"));
    }

    #[test]
    fn unauthorized_refreshes_once_and_never_loops() {
        for final_status in [200, 401] {
            let (base, requests, worker) = server(vec![
                (401, Value::Null),
                (final_status, serde_json::json!({})),
            ]);
            let tokens = TestTokens::default();
            let result = client(&tokens, base).calendar("calendar");
            if final_status == 200 {
                assert!(result.is_ok());
            } else {
                assert_eq!(result.unwrap_err().code, "reconnect");
            }
            worker.join().unwrap();
            assert_eq!(tokens.0.load(Ordering::SeqCst), 1);
            assert!(requests.recv().unwrap().contains("Bearer test-token-0"));
            assert!(requests.recv().unwrap().contains("Bearer test-token-1"));
            assert!(requests.try_recv().is_err());
        }
    }

    #[test]
    fn http_failures_have_safe_codes_and_retry_policy() {
        for (status, reason, code, retryable) in [
            (403, "forbidden", "permission", false),
            (403, "userRateLimitExceeded", "rate_limit", true),
            (429, "", "rate_limit", true),
            (503, "", "server", true),
            (410, "", "gone", false),
            (412, "", "precondition", false),
        ] {
            let (base, _requests, worker) = server(vec![(
                status,
                serde_json::json!({"error":{"message":"private event data","errors":[{"reason":reason}]}}),
            )]);
            let tokens = TestTokens::default();
            let error = client(&tokens, base).calendar("calendar").unwrap_err();
            worker.join().unwrap();
            assert_eq!(error.code, code);
            assert_eq!(error.retryable, retryable);
            assert!(!error.message.contains("private event data"));
        }
    }
}
