//! Linux integration: .desktop entry, hicolor icon, MIME type for the file
//! association, and a CLI symlink in ~/.local/bin. Per-user, no root needed.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use crate::install::{app_exe_path, cli_dir, watchdog_exe_path, InstallOptions};
use crate::manifest::{Manifest, ICON_PNG};

pub fn registered_install_dir(manifest: &Manifest) -> Option<PathBuf> {
    // The .desktop file records where we installed last time.
    let desktop = applications_dir()?.join(format!("{}.desktop", manifest.identifier));
    let content = fs::read_to_string(desktop).ok()?;
    let exe = content
        .lines()
        .find_map(|l| l.strip_prefix("Exec=").map(|v| v.split_whitespace().next().unwrap_or("")))?;
    // Exec points at <dir>/app/<exe>; walk up two levels.
    PathBuf::from(exe).parent()?.parent().map(|p| p.to_path_buf())
}

pub fn register(manifest: &Manifest, opts: &InstallOptions) -> Result<(), String> {
    let exe = app_exe_path(manifest, &opts.dir);
    let _ = Command::new("chmod").arg("+x").arg(&exe).output();
    // .desktop entries and file associations launch through the watchdog
    // (when this build shipped one) instead of the app directly, so a crash
    // gets captured and alerted on.
    let launch_target = watchdog_exe_path(manifest, &opts.dir).unwrap_or_else(|| exe.clone());
    if launch_target != exe {
        let _ = Command::new("chmod").arg("+x").arg(&launch_target).output();
    }

    // Icon
    let icon_name = manifest.identifier.clone();
    if let Some(icons) = icons_dir() {
        let dir = icons.join("hicolor/128x128/apps");
        if fs::create_dir_all(&dir).is_ok() {
            let _ = fs::write(dir.join(format!("{icon_name}.png")), ICON_PNG);
        }
    }

    // MIME types for the file associations (one shared-mime-info XML for all)
    let mut mime_line = String::new();
    if opts.file_assoc && !manifest.file_associations.is_empty() {
        let mimes: Vec<String> = manifest
            .file_associations
            .iter()
            .map(|a| format!("application/x-{}", a.ext))
            .collect();
        if let Some(mime_dir) = mime_packages_dir() {
            if fs::create_dir_all(&mime_dir).is_ok() {
                let mut types = String::new();
                for (assoc, mime) in manifest.file_associations.iter().zip(&mimes) {
                    types.push_str(&format!(
                        "\x20 <mime-type type=\"{mime}\">\n\
                         \x20   <comment>{}</comment>\n\
                         \x20   <glob pattern=\"*.{}\"/>\n\
                         \x20 </mime-type>\n",
                        assoc.description, assoc.ext
                    ));
                }
                let xml = format!(
                    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
                     <mime-info xmlns=\"http://www.freedesktop.org/standards/shared-mime-info\">\n\
                     {types}</mime-info>\n"
                );
                let _ = fs::write(mime_dir.join(format!("{}.xml", manifest.identifier)), xml);
                if let Some(mime_root) = dirs::data_dir().map(|d| d.join("mime")) {
                    let _ = Command::new("update-mime-database").arg(mime_root).output();
                }
            }
        }
        mime_line = format!("MimeType={};\n", mimes.join(";"));
    }

    // .desktop entry (also used by `registered_install_dir` for update detection)
    if let Some(apps) = applications_dir() {
        fs::create_dir_all(&apps).map_err(|e| e.to_string())?;
        let desktop = format!(
            "[Desktop Entry]\n\
             Type=Application\n\
             Name={name}\n\
             Comment={name}\n\
             Exec={exe} %f\n\
             Icon={icon_name}\n\
             Terminal=false\n\
             Categories=Utility;\n\
             {mime_line}",
            name = manifest.product_name,
            exe = launch_target.display(),
        );
        fs::write(apps.join(format!("{}.desktop", manifest.identifier)), &desktop)
            .map_err(|e| e.to_string())?;
        let _ = Command::new("update-desktop-database").arg(&apps).output();

        if opts.desktop_shortcut {
            if let Some(desk) = dirs::desktop_dir() {
                let path = desk.join(format!("{}.desktop", manifest.identifier));
                if fs::write(&path, &desktop).is_ok() {
                    let _ = Command::new("chmod").arg("+x").arg(&path).output();
                }
            }
        }
    }

    // CLI symlink
    if opts.install_cli {
        if let Some(cli) = manifest.cli_name.as_deref() {
            let src = cli_dir(&opts.dir).join(cli);
            let _ = Command::new("chmod").arg("+x").arg(&src).output();
            if let Some(bin) = dirs::home_dir().map(|h| h.join(".local/bin")) {
                fs::create_dir_all(&bin).map_err(|e| e.to_string())?;
                let link = bin.join(cli);
                let _ = fs::remove_file(&link);
                std::os::unix::fs::symlink(&src, &link).map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(())
}

pub fn unregister(manifest: &Manifest, opts: &InstallOptions, _dir: &Path) -> Result<(), String> {
    if let Some(apps) = applications_dir() {
        let _ = fs::remove_file(apps.join(format!("{}.desktop", manifest.identifier)));
    }
    if let Some(desk) = dirs::desktop_dir() {
        let _ = fs::remove_file(desk.join(format!("{}.desktop", manifest.identifier)));
    }
    if let Some(icons) = icons_dir() {
        let _ = fs::remove_file(icons.join(format!("hicolor/128x128/apps/{}.png", manifest.identifier)));
    }
    if let Some(mime_dir) = mime_packages_dir() {
        let _ = fs::remove_file(mime_dir.join(format!("{}.xml", manifest.identifier)));
    }
    if opts.install_cli {
        if let Some(cli) = manifest.cli_name.as_deref() {
            if let Some(bin) = dirs::home_dir().map(|h| h.join(".local/bin")) {
                let link = bin.join(cli);
                if link.is_symlink() {
                    let _ = fs::remove_file(link);
                }
            }
        }
    }
    // Autostart entries (tauri-plugin-autostart writes ~/.config/autostart)
    if let Some(autostart) = dirs::config_dir().map(|c| c.join("autostart")) {
        let dir_str = _dir.to_string_lossy().to_string();
        if let Ok(entries) = fs::read_dir(&autostart) {
            for e in entries.flatten() {
                if let Ok(content) = fs::read_to_string(e.path()) {
                    if content.contains(&dir_str) || content.contains(&manifest.identifier) {
                        let _ = fs::remove_file(e.path());
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

fn applications_dir() -> Option<PathBuf> {
    dirs::data_dir().map(|d| d.join("applications"))
}

fn icons_dir() -> Option<PathBuf> {
    dirs::data_dir().map(|d| d.join("icons"))
}

fn mime_packages_dir() -> Option<PathBuf> {
    dirs::data_dir().map(|d| d.join("mime/packages"))
}
