// No console flash on Windows when a shortcut launches this (mirrors
// desktop/src-tauri/src/main.rs). Debug builds keep it for `cargo run`.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! Launch wrapper installed alongside the app — shortcuts and file
//! associations point here instead of the app directly (see
//! `tools/installer/src/platform/{windows,linux}.rs`). Spawns the app as a
//! child, pipes its stdout/stderr to a log file (release builds have no
//! console of their own), and relaunches it silently on a crash. A crash
//! *loop* (`CRASH_LOOP_THRESHOLD` within `CRASH_WINDOW`) stops and asks
//! instead of retrying forever. Exit code 0 (only ever sent by `lib.rs`'s
//! `CloseRequested` handler on a deliberate quit) stops the watchdog too.
//!
//! Not wired into autostart: `tauri-plugin-autostart` registers
//! `std::env::current_exe()` from inside the app process, always the real
//! app binary — duplicating that here risks drifting from its own
//! enable/disable toggle in Settings.

use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, ExitStatus, Stdio};
use std::time::{Duration, Instant};

const CRASH_LOOP_THRESHOLD: usize = 3;
const CRASH_WINDOW: Duration = Duration::from_secs(60);

// KEEP IN SYNC with lib.rs and commands/install_info.rs's copies.
const APP_IDENTIFIER: &str = "com.supersoft.gdlqb";

// KEEP IN SYNC with tools/installer/build.mjs's `exeName`.
#[cfg(windows)]
const APP_EXE_NAME: &str = "gdlqbot.exe";
#[cfg(not(windows))]
const APP_EXE_NAME: &str = "gdlqbot";

const MAX_LOG_BYTES: u64 = 5 * 1024 * 1024;

fn log_dir() -> PathBuf {
    dirs::data_dir().unwrap_or_else(std::env::temp_dir).join(APP_IDENTIFIER).join("logs")
}

fn rotate_if_large(path: &Path) {
    if fs::metadata(path).map(|m| m.len() > MAX_LOG_BYTES).unwrap_or(false) {
        let _ = fs::rename(path, path.with_extension("log.old"));
    }
}

fn open_log(path: &Path) -> std::io::Result<File> {
    OpenOptions::new().create(true).append(true).open(path)
}

fn timestamp() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn log_line(log: Option<&mut File>, msg: &str) {
    if let Some(f) = log {
        let _ = writeln!(f, "[{}] {msg}", timestamp());
    }
}

fn main() {
    let dir = log_dir();
    let _ = fs::create_dir_all(&dir);
    let log_path = dir.join("watchdog.log");
    rotate_if_large(&log_path);
    let mut log = open_log(&log_path).ok();

    let own_exe = match std::env::current_exe() {
        Ok(p) => p,
        Err(e) => {
            log_line(log.as_mut(), &format!("watchdog: cannot resolve own exe path: {e}"));
            return;
        }
    };
    let own_dir = own_exe.parent().map(Path::to_path_buf).unwrap_or_default();
    let app_exe = own_dir.join(APP_EXE_NAME);

    if !app_exe.exists() {
        let msg = format!("Could not find the application at:\n{}", app_exe.display());
        log_line(log.as_mut(), &format!("watchdog: {msg}"));
        show_error(&msg);
        return;
    }

    // A file-association double-click hands us the opened file's path here.
    let args: Vec<String> = std::env::args().skip(1).collect();
    log_line(log.as_mut(), &format!("watchdog: launching {} {args:?}", app_exe.display()));
    drop(log);

    let mut recent_crashes: Vec<Instant> = Vec::new();

    loop {
        let mut cmd = Command::new(&app_exe);
        cmd.args(&args).current_dir(&own_dir);
        if let Ok(f) = open_log(&log_path) {
            cmd.stdout(Stdio::from(f));
        }
        if let Ok(f) = open_log(&log_path) {
            cmd.stderr(Stdio::from(f));
        }

        let status = match cmd.spawn().and_then(|mut c| c.wait()) {
            Ok(s) => s,
            Err(e) => {
                let mut log = open_log(&log_path).ok();
                log_line(log.as_mut(), &format!("watchdog: failed to launch app: {e}"));
                show_error(&format!("Failed to launch the application:\n{e}"));
                return;
            }
        };

        if status.success() {
            let mut log = open_log(&log_path).ok();
            log_line(log.as_mut(), "watchdog: app exited normally (user quit) — stopping");
            return;
        }

        let reason = describe_status(&status);
        let mut log = open_log(&log_path).ok();
        log_line(log.as_mut(), &format!("watchdog: app exited abnormally: {reason}"));

        let now = Instant::now();
        recent_crashes.retain(|t| now.duration_since(*t) < CRASH_WINDOW);
        recent_crashes.push(now);

        if recent_crashes.len() >= CRASH_LOOP_THRESHOLD {
            log_line(log.as_mut(), "watchdog: crash-looping, asking before continuing");
            drop(log);
            if !ask_keep_retrying(&log_path, &reason, recent_crashes.len()) {
                let mut log = open_log(&log_path).ok();
                log_line(log.as_mut(), "watchdog: stopping at user's request");
                return;
            }
            recent_crashes.clear();
        } else {
            log_line(log.as_mut(), "watchdog: relaunching automatically");
        }
    }
}

#[cfg(unix)]
fn describe_status(s: &ExitStatus) -> String {
    use std::os::unix::process::ExitStatusExt;
    match s.code() {
        Some(code) => format!("exit code {code}"),
        None => format!("terminated by signal {}", s.signal().unwrap_or(-1)),
    }
}

#[cfg(not(unix))]
fn describe_status(s: &ExitStatus) -> String {
    match s.code() {
        Some(code) => format!("exit code {code}"),
        None => "terminated abnormally".to_string(),
    }
}

fn show_error(message: &str) {
    rfd::MessageDialog::new()
        .set_level(rfd::MessageLevel::Error)
        .set_title("GD Level Request Bot")
        .set_description(message)
        .set_buttons(rfd::MessageButtons::Ok)
        .show();
}

/// Shown only once crash-looping (an isolated crash relaunches silently, no
/// dialog). Two prompts rather than one three-way dialog since rfd's button
/// presets don't support custom labels for a real three-way choice.
fn ask_keep_retrying(log_path: &Path, reason: &str, crash_count: usize) -> bool {
    let open_log = rfd::MessageDialog::new()
        .set_level(rfd::MessageLevel::Error)
        .set_title("GD Level Request Bot keeps crashing")
        .set_description(format!(
            "The app has crashed {crash_count} times in the last minute (latest: {reason}).\n\n\
             Log file:\n{}\n\nOpen the log folder?",
            log_path.display()
        ))
        .set_buttons(rfd::MessageButtons::YesNo)
        .show();
    if matches!(open_log, rfd::MessageDialogResult::Yes) {
        open_containing_folder(log_path);
    }

    let retry = rfd::MessageDialog::new()
        .set_level(rfd::MessageLevel::Warning)
        .set_title("GD Level Request Bot")
        .set_description("Keep trying to restart it?")
        .set_buttons(rfd::MessageButtons::YesNo)
        .show();
    matches!(retry, rfd::MessageDialogResult::Yes)
}

fn open_containing_folder(path: &Path) {
    let dir = path.parent().unwrap_or(path);
    #[cfg(windows)]
    let _ = Command::new("explorer").arg(dir).spawn();
    #[cfg(target_os = "linux")]
    let _ = Command::new("xdg-open").arg(dir).spawn();
}
