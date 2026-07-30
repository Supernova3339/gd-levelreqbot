//! The on-disk install record (`install-manifest.json` in the install dir).
//! Written on install, read back for updates and by the uninstaller.

use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

use super::InstallOptions;
use crate::manifest::Manifest;
use crate::platform;
use crate::sys;

pub const RECORD_FILE: &str = "install-manifest.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstallRecord {
    pub product_name: String,
    pub identifier: String,
    pub version: String,
    pub installed_at: String,
    pub options: InstallOptions,
    pub files: Vec<String>,
}

/// Look for an existing install: platform registration first (registry /
/// .desktop file), then the default install location.
pub fn find_existing(manifest: &Manifest) -> Option<InstallRecord> {
    if let Some(dir) = platform::registered_install_dir(manifest) {
        if let Some(rec) = read_record(&dir) {
            return Some(rec);
        }
    }
    read_record(&sys::default_install_dir(manifest))
}

pub fn read_record(dir: &Path) -> Option<InstallRecord> {
    let raw = fs::read_to_string(dir.join(RECORD_FILE)).ok()?;
    serde_json::from_str(&raw).ok()
}

pub fn write_record(dir: &Path, record: &InstallRecord) -> Result<(), String> {
    fs::write(
        dir.join(RECORD_FILE),
        serde_json::to_string_pretty(record).unwrap(),
    )
    .map_err(|e| format!("Cannot write install record: {e}"))
}
