//! The developer "blessing": developer options only count when granted by
//! the installer. install.json carries `dev_blessing`, a machine-bound hash
//! the app recomputes and verifies — hand-editing `dev_enabled: true` into
//! the file does nothing without it, and copying a blessed file to another
//! machine invalidates it.
//!
//! KEEP IN SYNC with `desktop/src-tauri/src/commands/install_info.rs`.

use sha2::{Digest, Sha256};

const BLESSING_DOMAIN: &str = "gdlqb.dev.blessing.v1";

pub fn dev_blessing(identifier: &str) -> String {
    let mut h = Sha256::new();
    h.update(BLESSING_DOMAIN.as_bytes());
    h.update(b":");
    h.update(identifier.as_bytes());
    h.update(b":");
    h.update(machine_id().as_bytes());
    hex(&h.finalize())
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// A stable per-machine identifier. Not secret — just an anchor that ties
/// the blessing to this install of the OS.
#[cfg(target_os = "windows")]
fn machine_id() -> String {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;
    RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey(r"SOFTWARE\Microsoft\Cryptography")
        .and_then(|k| k.get_value::<String, _>("MachineGuid"))
        .unwrap_or_else(|_| fallback_id())
}

#[cfg(target_os = "linux")]
fn machine_id() -> String {
    std::fs::read_to_string("/etc/machine-id")
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|_| fallback_id())
}

#[cfg(target_os = "macos")]
fn machine_id() -> String {
    std::process::Command::new("ioreg")
        .args(["-rd1", "-c", "IOPlatformExpertDevice"])
        .output()
        .ok()
        .and_then(|o| {
            let text = String::from_utf8_lossy(&o.stdout).to_string();
            text.lines()
                .find(|l| l.contains("IOPlatformUUID"))
                .and_then(|l| l.split('"').nth(3).map(String::from))
        })
        .unwrap_or_else(fallback_id)
}

fn fallback_id() -> String {
    let user = std::env::var("USERNAME")
        .or_else(|_| std::env::var("USER"))
        .unwrap_or_default();
    let host = std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_default();
    format!("{user}@{host}")
}
