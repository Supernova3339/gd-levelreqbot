//! macOS integration: the payload's `app/<Name>.app` bundle is extracted into
//! the chosen directory (default /Applications, or ~/Applications without
//! write access). The CLI is symlinked onto PATH and the bundle is registered
//! with LaunchServices.

use std::path::{Path, PathBuf};
use std::process::Command;

use crate::install::{cli_dir, InstallOptions};
use crate::manifest::Manifest;

pub fn registered_install_dir(_manifest: &Manifest) -> Option<PathBuf> {
    None // no registry; detection relies on install-manifest.json in default dirs
}

pub fn register(manifest: &Manifest, opts: &InstallOptions) -> Result<(), String> {
    // Register the bundle with LaunchServices (Spotlight, file associations
    // from the bundle's Info.plist, open-with, etc.).
    let app = opts.dir.join("app").join(&manifest.exe_name);
    let lsregister = "/System/Library/Frameworks/CoreServices.framework/Versions/A/\
                      Frameworks/LaunchServices.framework/Versions/A/Support/lsregister";
    let _ = Command::new(lsregister).arg("-f").arg(&app).output();

    // Make the inner binaries executable (tar should preserve this; belt & braces).
    let _ = Command::new("chmod").args(["-R", "+x"]).arg(app.join("Contents/MacOS")).output();

    if opts.install_cli {
        if let Some(cli) = manifest.cli_name.as_deref() {
            let src = cli_dir(&opts.dir).join(cli);
            let _ = Command::new("chmod").arg("+x").arg(&src).output();
            symlink_cli(&src, cli)?;
        }
    }
    Ok(())
}

pub fn unregister(manifest: &Manifest, opts: &InstallOptions, _dir: &Path) -> Result<(), String> {
    if opts.install_cli {
        if let Some(cli) = manifest.cli_name.as_deref() {
            for dir in link_dirs() {
                let link = dir.join(cli);
                if link.is_symlink() {
                    let _ = std::fs::remove_file(link);
                }
            }
        }
    }
    // Autostart entries (tauri-plugin-autostart writes ~/Library/LaunchAgents)
    if let Some(agents) = dirs::home_dir().map(|h| h.join("Library/LaunchAgents")) {
        if let Ok(entries) = std::fs::read_dir(&agents) {
            let dir_str = _dir.to_string_lossy().to_string();
            for e in entries.flatten() {
                if let Ok(content) = std::fs::read_to_string(e.path()) {
                    if content.contains(&dir_str) || content.contains(&manifest.identifier) {
                        let _ = std::fs::remove_file(e.path());
                    }
                }
            }
        }
    }
    Ok(())
}

/// `extra_paths` may be files or directories — either way `rm -rf` handles
/// them. `dir` is always force-removed recursively at the end, regardless of
/// whether the currently-running copy lives inside it (running the
/// installer from elsewhere with `--dir` is a legitimate uninstall path
/// too); if it was running from inside `dir`, this also deletes that exe
/// once the process has exited and released it.
pub fn schedule_self_delete(dir: &Path, extra_paths: &[PathBuf]) {
    let mut script = String::from("sleep 2");
    for p in extra_paths {
        script.push_str(&format!("; rm -rf '{}'", p.display()));
    }
    script.push_str(&format!("; rm -rf '{}'", dir.display()));
    let _ = Command::new("sh").args(["-c", &script]).spawn();
}

fn link_dirs() -> Vec<PathBuf> {
    let mut v = vec![PathBuf::from("/usr/local/bin")];
    if let Some(h) = dirs::home_dir() {
        v.push(h.join(".local/bin"));
    }
    v
}

fn symlink_cli(src: &Path, name: &str) -> Result<(), String> {
    for dir in link_dirs() {
        if std::fs::create_dir_all(&dir).is_err() {
            continue;
        }
        let link = dir.join(name);
        let _ = std::fs::remove_file(&link);
        if std::os::unix::fs::symlink(src, &link).is_ok() {
            return Ok(());
        }
    }
    Err("Could not place CLI symlink in /usr/local/bin or ~/.local/bin".into())
}
