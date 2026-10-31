pub mod api;
pub mod auth;
pub mod commands;
pub mod engine;
pub mod mapping;
pub mod storage;
#[cfg(test)]
pub mod testing;

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct GoogleError {
    pub code: String,
    pub message: String,
    pub retryable: bool,
}

impl GoogleError {
    pub fn new(code: &str, message: &str) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            retryable: false,
        }
    }
    pub fn storage(_: impl std::fmt::Display) -> Self {
        Self::new("storage", "The calendar could not be read or saved. Check its file permissions and available disk space.")
    }
}

pub type Result<T> = std::result::Result<T, GoogleError>;
