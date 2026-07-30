//! Single-instance guard: an OS file lock in the temp dir, shared by the
//! installer and the installed uninstaller (same binary, same lock path).
//! The lock is released automatically when the process dies — any exit path,
//! including crashes — so there is nothing to clean up and no stale state.

use std::fs::{File, OpenOptions};

const LOCK_NAME: &str = "com.supersoft.gdlqb-installer.lock";

/// Try to become the only running setup instance. Returns the held lock on
/// success (keep it alive for the process lifetime); `None` when another
/// installer/uninstaller window or silent run is already active.
pub fn acquire_instance_lock() -> Option<File> {
    let path = std::env::temp_dir().join(LOCK_NAME);
    let f = OpenOptions::new().create(true).write(true).open(&path).ok()?;
    match f.try_lock() {
        Ok(()) => Some(f),
        Err(_) => None,
    }
}
