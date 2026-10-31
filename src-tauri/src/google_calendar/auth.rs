use super::{GoogleError, Result};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Mutex,
};
use std::time::{Duration, Instant};

pub const CALENDAR_SCOPE: &str = "https://www.googleapis.com/auth/calendar.app.created";
const SCOPES: &str = "openid email https://www.googleapis.com/auth/calendar.app.created";

#[derive(Serialize, Deserialize, Clone)]
struct SavedAccount {
    subject: String,
    email: String,
    refresh_token: String,
    client_id: String,
}

struct AccessToken {
    value: String,
    expires: Instant,
}

pub struct GoogleAuth {
    flow: AtomicU64,
    connecting: AtomicBool,
    access: Mutex<Option<AccessToken>>,
    gate: Mutex<()>,
}

#[derive(Clone, Serialize)]
pub struct AccountStatus {
    pub configured: bool,
    pub connected: bool,
    pub connecting: bool,
    pub subject: Option<String>,
    pub email: Option<String>,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    expires_in: u64,
    refresh_token: Option<String>,
    scope: Option<String>,
}

#[derive(Deserialize)]
struct UserInfo {
    sub: String,
    email: String,
    email_verified: bool,
}

fn client_id() -> Result<String> {
    let value = option_env!("TODOER_GOOGLE_CLIENT_ID").unwrap_or("").trim();
    if value.is_empty() {
        return Err(GoogleError::new("not_configured", "This build has no Google desktop OAuth client configured. See the Google sync setup guide."));
    }
    Ok(value.into())
}

fn credential() -> Result<keyring::Entry> {
    keyring::Entry::new("com.david.todoer-plus.google-calendar", &client_id()?).map_err(|_| {
        GoogleError::new(
            "credentials",
            "The operating system credential store is unavailable.",
        )
    })
}

fn load_account() -> Result<Option<SavedAccount>> {
    match credential()?.get_password() {
        Ok(value) => serde_json::from_str::<SavedAccount>(&value).map(Some)
            .map_err(|_| GoogleError::new("credentials", "The saved Google connection is invalid. Disconnect and connect again.")),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err(GoogleError::new("credentials", "The saved Google connection could not be read from the operating system credential store.")),
    }
}

fn save_account(account: &SavedAccount) -> Result<()> {
    credential()?
        .set_password(&serde_json::to_string(account).map_err(GoogleError::storage)?)
        .map_err(|_| {
            GoogleError::new(
                "credentials",
                "Google credentials could not be saved in the operating system credential store.",
            )
        })
}

pub fn http_client() -> Result<Client> {
    Client::builder()
        .https_only(true)
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(30))
        .connect_timeout(Duration::from_secs(10))
        .build()
        .map_err(|_| {
            GoogleError::new(
                "network",
                "The secure Google connection could not be initialized.",
            )
        })
}

pub fn network_error(_: reqwest::Error) -> GoogleError {
    GoogleError {
        code: "network".into(),
        message: "Google could not be reached. Your local changes are saved and will be retried."
            .into(),
        retryable: true,
    }
}

fn nonce() -> Result<String> {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).map_err(|_| {
        GoogleError::new("authorization", "Secure sign-in randomness is unavailable.")
    })?;
    Ok(URL_SAFE_NO_PAD.encode(bytes))
}

fn challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

fn parse_callback(target: &str, expected_state: &str) -> Result<Option<String>> {
    let url = reqwest::Url::parse(&format!("http://127.0.0.1{target}"))
        .map_err(|_| GoogleError::new("callback", "Invalid sign-in callback."))?;
    if url.path() != "/oauth2/callback" {
        return Ok(None);
    }
    let values: std::collections::HashMap<_, _> = url.query_pairs().into_owned().collect();
    if values.get("state").map(String::as_str) != Some(expected_state) {
        return Ok(None);
    }
    if values.contains_key("error") {
        return Err(GoogleError::new(
            "access_denied",
            "Google sign-in was declined. You can try connecting again.",
        ));
    }
    Ok(values
        .get("code")
        .filter(|value| !value.is_empty())
        .cloned())
}

impl GoogleAuth {
    pub fn new() -> Self {
        Self {
            flow: AtomicU64::new(0),
            connecting: AtomicBool::new(false),
            access: Mutex::new(None),
            gate: Mutex::new(()),
        }
    }

    pub fn status(&self) -> Result<AccountStatus> {
        if client_id().is_err() {
            return Ok(AccountStatus {
                configured: false,
                connected: false,
                connecting: false,
                subject: None,
                email: None,
            });
        }
        let account = load_account()?;
        Ok(AccountStatus {
            configured: true,
            connected: account.is_some(),
            connecting: self.connecting.load(Ordering::SeqCst),
            subject: account.as_ref().map(|a| a.subject.clone()),
            email: account.map(|a| a.email),
        })
    }

    pub fn cancel(&self) {
        self.flow.fetch_add(1, Ordering::SeqCst);
    }

    pub fn connect(&self) -> Result<AccountStatus> {
        let id = client_id()?;
        if self.connecting.swap(true, Ordering::SeqCst) {
            return Err(GoogleError::new(
                "busy",
                "Google sign-in is already in progress.",
            ));
        }
        let generation = self.flow.fetch_add(1, Ordering::SeqCst) + 1;
        let result = self.connect_inner(&id, generation);
        self.connecting.store(false, Ordering::SeqCst);
        result
    }

    fn connect_inner(&self, id: &str, generation: u64) -> Result<AccountStatus> {
        let verifier = nonce()?;
        let state = nonce()?;
        let listener = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0)).map_err(|_| {
            GoogleError::new("callback", "A local sign-in callback could not be opened.")
        })?;
        listener
            .set_nonblocking(true)
            .map_err(GoogleError::storage)?;
        let address = listener.local_addr().map_err(GoogleError::storage)?;
        let redirect = format!("http://127.0.0.1:{}/oauth2/callback", address.port());
        let mut url = reqwest::Url::parse("https://accounts.google.com/o/oauth2/v2/auth").unwrap();
        url.query_pairs_mut().extend_pairs([
            ("client_id", id),
            ("redirect_uri", &redirect),
            ("response_type", "code"),
            ("scope", SCOPES),
            ("state", &state),
            ("code_challenge", &challenge(&verifier)),
            ("code_challenge_method", "S256"),
            ("access_type", "offline"),
            ("prompt", "consent select_account"),
        ]);
        tauri_plugin_opener::open_url(url.as_str(), None::<&str>).map_err(|_| {
            GoogleError::new(
                "browser",
                "The system browser could not be opened for Google sign-in.",
            )
        })?;
        let deadline = Instant::now() + Duration::from_secs(180);
        let code = loop {
            if self.flow.load(Ordering::SeqCst) != generation {
                return Err(GoogleError::new(
                    "cancelled",
                    "Google sign-in was cancelled.",
                ));
            }
            if Instant::now() >= deadline {
                return Err(GoogleError::new(
                    "timeout",
                    "Google sign-in timed out. Try connecting again.",
                ));
            }
            match listener.accept() {
                Ok((mut stream, _)) => {
                    let _ = stream.set_read_timeout(Some(Duration::from_secs(1)));
                    let _ = stream.set_write_timeout(Some(Duration::from_secs(1)));
                    let mut request = [0u8; 8192];
                    let count = stream.read(&mut request).unwrap_or(0);
                    let request = String::from_utf8_lossy(&request[..count]);
                    let line = request.lines().next().unwrap_or("");
                    let mut parts = line.split_whitespace();
                    let method = parts.next().unwrap_or("");
                    let target = parts.next().unwrap_or("");
                    let valid_host = request.lines().any(|line| {
                        line.split_once(':').is_some_and(|(name, value)| {
                            name.eq_ignore_ascii_case("host") && value.trim() == address.to_string()
                        })
                    });
                    let parsed = if method == "GET" && valid_host {
                        parse_callback(target, &state)
                    } else {
                        Ok(None)
                    };
                    let accepted = !matches!(parsed, Ok(None));
                    let message = if accepted {
                        "Sign-in received. You can close this tab and return to TODOer."
                    } else {
                        "Invalid sign-in request."
                    };
                    let status = if accepted {
                        "200 OK"
                    } else {
                        "400 Bad Request"
                    };
                    let _ = write!(stream, "HTTP/1.1 {status}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n{message}", message.len());
                    if let Some(code) = parsed? {
                        break code;
                    }
                }
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(50))
                }
                Err(_) => {
                    return Err(GoogleError::new(
                        "callback",
                        "The local sign-in callback failed.",
                    ))
                }
            }
        };
        let mut form = vec![
            ("client_id", id),
            ("code", &code),
            ("code_verifier", &verifier),
            ("redirect_uri", &redirect),
            ("grant_type", "authorization_code"),
        ];
        if let Some(secret) = option_env!("TODOER_GOOGLE_CLIENT_SECRET").filter(|s| !s.is_empty()) {
            form.push(("client_secret", secret));
        }
        let response = http_client()?
            .post("https://oauth2.googleapis.com/token")
            .form(&form)
            .send()
            .map_err(network_error)?;
        if !response.status().is_success() {
            return Err(GoogleError::new(
                "authorization",
                "Google could not complete sign-in. Try connecting again.",
            ));
        }
        let token: TokenResponse = response.json().map_err(network_error)?;
        if !token
            .scope
            .as_deref()
            .unwrap_or("")
            .split_whitespace()
            .any(|scope| scope == CALENDAR_SCOPE)
        {
            return Err(GoogleError::new("permissions", "Google Calendar permission was not granted. Connect again and allow access to calendars TODOer creates."));
        }
        let user_response = http_client()?
            .get("https://openidconnect.googleapis.com/v1/userinfo")
            .bearer_auth(&token.access_token)
            .send()
            .map_err(network_error)?;
        if !user_response.status().is_success() {
            return Err(GoogleError::new(
                "authorization",
                "Google account identity could not be verified.",
            ));
        }
        let user: UserInfo = user_response.json().map_err(network_error)?;
        if !user.email_verified {
            return Err(GoogleError::new(
                "authorization",
                "A verified Google email address is required.",
            ));
        }
        let refresh = token.refresh_token.ok_or_else(|| {
            GoogleError::new(
                "authorization",
                "Google did not grant offline access. Reconnect and approve the consent screen.",
            )
        })?;
        let _guard = self.gate.lock().map_err(GoogleError::storage)?;
        if self.flow.load(Ordering::SeqCst) != generation {
            return Err(GoogleError::new(
                "cancelled",
                "Google sign-in was cancelled.",
            ));
        }
        save_account(&SavedAccount {
            subject: user.sub,
            email: user.email,
            refresh_token: refresh,
            client_id: id.into(),
        })?;
        *self.access.lock().map_err(GoogleError::storage)? = Some(AccessToken {
            value: token.access_token,
            expires: Instant::now() + Duration::from_secs(token.expires_in.saturating_sub(60)),
        });
        self.status()
    }

    pub fn access_token(&self) -> Result<(String, String)> {
        let _guard = self.gate.lock().map_err(GoogleError::storage)?;
        let mut account = load_account()?.ok_or_else(|| {
            GoogleError::new(
                "reconnect",
                "Connect your Google account to continue syncing.",
            )
        })?;
        if let Some(token) = self
            .access
            .lock()
            .map_err(GoogleError::storage)?
            .as_ref()
            .filter(|token| token.expires > Instant::now())
        {
            return Ok((account.subject, token.value.clone()));
        }
        let mut form = vec![
            ("client_id", account.client_id.as_str()),
            ("refresh_token", account.refresh_token.as_str()),
            ("grant_type", "refresh_token"),
        ];
        if let Some(secret) = option_env!("TODOER_GOOGLE_CLIENT_SECRET").filter(|s| !s.is_empty()) {
            form.push(("client_secret", secret));
        }
        let response = http_client()?
            .post("https://oauth2.googleapis.com/token")
            .form(&form)
            .send()
            .map_err(network_error)?;
        if !response.status().is_success() {
            let transient =
                response.status().is_server_error() || response.status().as_u16() == 429;
            return Err(GoogleError {
                code: if transient { "network" } else { "reconnect" }.into(),
                message: if transient {
                    "Google authorization is temporarily unavailable. Sync will retry."
                } else {
                    "Google authorization expired or was revoked. Reconnect your account."
                }
                .into(),
                retryable: transient,
            });
        }
        let token: TokenResponse = response.json().map_err(network_error)?;
        if let Some(refresh) = token.refresh_token {
            account.refresh_token = refresh;
            save_account(&account)?;
        }
        *self.access.lock().map_err(GoogleError::storage)? = Some(AccessToken {
            value: token.access_token.clone(),
            expires: Instant::now() + Duration::from_secs(token.expires_in.saturating_sub(60)),
        });
        Ok((account.subject, token.access_token))
    }

    pub fn invalidate_access(&self) {
        if let Ok(mut token) = self.access.lock() {
            *token = None;
        }
    }

    pub fn disconnect(&self) -> Result<()> {
        self.cancel();
        let _guard = self.gate.lock().map_err(GoogleError::storage)?;
        if let Some(account) = load_account()? {
            // Revocation is best effort when offline; local disconnection must still succeed.
            if let Ok(client) = http_client() {
                let _ = client
                    .post("https://oauth2.googleapis.com/revoke")
                    .form(&[("token", account.refresh_token)])
                    .send();
            }
        }
        match credential()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => (),
            Err(_) => {
                return Err(GoogleError::new(
                    "credentials",
                    "The operating system could not remove the saved Google connection.",
                ))
            }
        }
        self.invalidate_access();
        Ok(())
    }
}

#[tauri::command]
pub async fn google_connect(app: tauri::AppHandle) -> Result<AccountStatus> {
    tauri::async_runtime::spawn_blocking(move || {
        use tauri::Manager;
        app.state::<GoogleAuth>().connect()
    })
    .await
    .map_err(|_| GoogleError::new("authorization", "The sign-in worker stopped unexpectedly."))?
}
#[tauri::command]
pub fn google_cancel_connect(state: tauri::State<'_, GoogleAuth>) {
    state.cancel();
}
#[tauri::command]
pub fn google_account_status(state: tauri::State<'_, GoogleAuth>) -> Result<AccountStatus> {
    state.status()
}
#[tauri::command]
pub async fn google_disconnect(app: tauri::AppHandle) -> Result<()> {
    tauri::async_runtime::spawn_blocking(move || {
        use tauri::Manager;
        app.state::<GoogleAuth>().disconnect()
    })
    .await
    .map_err(|_| {
        GoogleError::new(
            "authorization",
            "The disconnect worker stopped unexpectedly.",
        )
    })?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn pkce_matches_rfc7636_vector() {
        assert_eq!(
            challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }
    #[test]
    fn callback_requires_path_state_and_a_code() {
        assert!(
            parse_callback("/oauth2/callback?state=wrong&code=secret", "right")
                .unwrap()
                .is_none()
        );
        assert!(parse_callback("/other?state=right&code=secret", "right")
            .unwrap()
            .is_none());
        assert_eq!(
            parse_callback("/oauth2/callback?state=right&code=abc%2B123", "right").unwrap(),
            Some("abc+123".into())
        );
        assert_eq!(
            parse_callback("/oauth2/callback?state=right&error=access_denied", "right")
                .unwrap_err()
                .code,
            "access_denied"
        );
    }
    #[test]
    fn random_values_have_pkce_length_and_are_unique() {
        let first = nonce().unwrap();
        assert_eq!(first.len(), 43);
        assert_ne!(first, nonce().unwrap());
    }
}
