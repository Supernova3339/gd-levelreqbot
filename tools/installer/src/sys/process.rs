//! Detecting and (gracefully) closing a running instance of the app.

use std::net::TcpStream;
use std::process::Command;
use std::time::Duration;

use crate::manifest::Manifest;

/// The app's local REST API port — a reliable "is it running" signal.
const APP_API_PORT: u16 = 24363;

fn app_process_name(manifest: &Manifest) -> String {
    #[cfg(target_os = "macos")]
    {
        // exe_name is the .app bundle name; the process is the inner binary.
        return manifest.exe_name.trim_end_matches(".app").to_string();
    }
    #[cfg(not(target_os = "macos"))]
    manifest.exe_name.clone()
}

/// Detect a running instance of the app (API port bound, or process present).
/// `GDLQB_SETUP_IGNORE_RUNNING=1` bypasses the check — testing/CI escape
/// hatch so an install can be exercised while a dev instance is up.
pub fn app_is_running(manifest: &Manifest) -> bool {
    if std::env::var("GDLQB_SETUP_IGNORE_RUNNING").map(|v| v == "1").unwrap_or(false) {
        return false;
    }
    if TcpStream::connect_timeout(
        &([127, 0, 0, 1], APP_API_PORT).into(),
        Duration::from_millis(300),
    )
    .is_ok()
    {
        return true;
    }
    process_running(&app_process_name(manifest))
}

/// Console children must not flash windows over the GUI installer.
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[cfg(target_os = "windows")]
fn process_running(name: &str) -> bool {
    use std::os::windows::process::CommandExt;
    Command::new("tasklist")
        .args(["/FI", &format!("IMAGENAME eq {name}"), "/NH", "/FO", "CSV"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).to_lowercase().contains(&name.to_lowercase()))
        .unwrap_or(false)
}

#[cfg(not(target_os = "windows"))]
fn process_running(name: &str) -> bool {
    Command::new("pgrep")
        .args(["-x", name])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Ask the running app to close; escalate to a hard kill if it lingers.
pub fn close_running_app(manifest: &Manifest) -> Result<(), String> {
    let name = app_process_name(manifest);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let _ = Command::new("taskkill")
            .args(["/IM", &name])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
        std::thread::sleep(Duration::from_secs(2));
        if process_running(&name) {
            let _ = Command::new("taskkill")
                .args(["/F", "/IM", &name])
                .creation_flags(CREATE_NO_WINDOW)
                .output();
            std::thread::sleep(Duration::from_millis(800));
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = Command::new("pkill").args(["-x", &name]).output();
        std::thread::sleep(Duration::from_secs(2));
        if process_running(&name) {
            let _ = Command::new("pkill").args(["-9", "-x", &name]).output();
            std::thread::sleep(Duration::from_millis(800));
        }
    }
    if app_is_running(manifest) {
        Err("The application is still running and could not be closed.".into())
    } else {
        Ok(())
    }
}
