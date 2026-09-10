//! The installation engine, independent of any UI. `run::run_install` /
//! `run::run_uninstall` are driven by both the wizard (via IPC) and the
//! silent CLI, reporting progress through a callback.

mod bench;
mod dry_run;
mod options;
mod payload;
mod record;
mod run;
mod seed;

pub use options::InstallOptions;
pub use record::{find_existing, read_record, InstallRecord, RECORD_FILE};
pub use run::{finalize_uninstall, launch_app, run_install, run_uninstall};

use std::path::{Path, PathBuf};

use crate::manifest::Manifest;

/// Progress sink: fraction in 0..=1 plus a human-readable message.
pub type Progress<'a> = &'a dyn Fn(f32, &str);

pub fn uninstaller_name() -> &'static str {
    if cfg!(windows) { "uninstall.exe" } else { "uninstall" }
}

pub fn app_exe_path(manifest: &Manifest, dir: &Path) -> PathBuf {
    dir.join("app").join(&manifest.exe_name)
}

/// The watchdog/launch-wrapper exe, if this build shipped one. Shortcuts and
/// file associations should launch this instead of `app_exe_path` directly
/// when it's present — see `platform::register` and `launch_app`.
pub fn watchdog_exe_path(manifest: &Manifest, dir: &Path) -> Option<PathBuf> {
    manifest.watchdog_name.as_ref().map(|name| dir.join("app").join(name))
}

pub fn cli_dir(dir: &Path) -> PathBuf {
    dir.join("cli")
}
