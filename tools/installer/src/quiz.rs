//! Persists whether the user has already passed the terms comprehension
//! quiz for the exact terms text they were shown. Keyed on a hash of the
//! license text itself, not a version number, so re-running the installer
//! (repair, update, a second install attempt) never re-quizzes someone
//! unless the terms actually changed since they passed.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::sys::installer_state_dir;

const RECORD_FILE: &str = "quiz-passed.json";

#[derive(Serialize, Deserialize)]
struct QuizRecord {
    license_sha256: String,
    passed_at: String,
}

fn record_path() -> PathBuf {
    installer_state_dir().join(RECORD_FILE)
}

fn hash(license: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(license.as_bytes());
    format!("{:x}", hasher.finalize())
}

/// Has the user already passed the quiz for this exact terms text?
pub fn already_passed(license: &str) -> bool {
    let Ok(data) = std::fs::read_to_string(record_path()) else {
        return false;
    };
    let Ok(record) = serde_json::from_str::<QuizRecord>(&data) else {
        return false;
    };
    record.license_sha256 == hash(license)
}

/// Record a pass for this exact terms text. Best-effort: if this can't be
/// written, the only consequence is being quizzed again next run, which is
/// always safe.
pub fn record_passed(license: &str) {
    let record = QuizRecord {
        license_sha256: hash(license),
        passed_at: chrono::Local::now().to_rfc3339(),
    };
    let path = record_path();
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    if let Ok(json) = serde_json::to_string_pretty(&record) {
        let _ = std::fs::write(path, json);
    }
}
