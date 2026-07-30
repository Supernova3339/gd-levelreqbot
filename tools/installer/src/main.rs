// GUI subsystem on Windows (no console window flashes for double-click users).
// Silent mode logs to %TEMP%/<product>-setup.log instead of stdout.
#![cfg_attr(all(target_os = "windows", not(debug_assertions)), windows_subsystem = "windows")]

mod args;
mod gui;
mod headless;
mod install;
mod ipc;
mod manifest;
mod platform;
mod quiz;
mod sys;
mod urls;

use args::{Args, EXIT_ALREADY_RUNNING, EXIT_BAD_ARGS, EXIT_ERROR, HELP};
use manifest::Manifest;

fn main() {
    let mut parsed = match Args::parse() {
        Ok(a) => a,
        Err(e) => {
            eprintln!("{e}\n\n{HELP}");
            std::process::exit(EXIT_BAD_ARGS);
        }
    };
    if parsed.help {
        println!("{HELP}");
        return;
    }

    // Running as the installed uninstaller? (named uninstall[.exe], or lying
    // next to the install record). Default to uninstall mode so someone who
    // double-clicks the file in the install folder isn't shown Setup — they
    // get the Repair / Remove choice instead.
    if !parsed.uninstall {
        if let Ok(exe) = std::env::current_exe() {
            let named_uninstall = exe
                .file_stem()
                .map(|s| s.eq_ignore_ascii_case("uninstall"))
                .unwrap_or(false);
            let beside_record = exe
                .parent()
                .map(|d| d.join(install::RECORD_FILE).exists())
                .unwrap_or(false);
            if named_uninstall || beside_record {
                parsed.uninstall = true;
            }
        }
    }

    // One setup at a time — installer and uninstaller share this lock. The
    // OS releases it on process death, so it can never go stale.
    let instance_lock = match sys::acquire_instance_lock() {
        Some(lock) => lock,
        None => {
            let msg = "Setup is already running. Check your open windows.";
            eprintln!("{msg}");
            if !parsed.silent {
                message_box(msg);
            }
            std::process::exit(EXIT_ALREADY_RUNNING);
        }
    };
    // Held for the lifetime of the process; released by the OS on exit.
    std::mem::forget(instance_lock);

    // No payload + debug build = installer development: run the full wizard
    // against a stand-in manifest with dry-run forced on.
    let (mut manifest, forced_dry) = match Manifest::load() {
        Ok(m) => (m, false),
        Err(_) if cfg!(debug_assertions) => (Manifest::dev_stub(), true),
        Err(e) => {
            eprintln!("{e}");
            message_box(&e);
            std::process::exit(EXIT_ERROR);
        }
    };
    if forced_dry {
        parsed.dry_run = true;
    }

    // --preset overrides the manifest's baked-in preset settings
    if let Some(path) = &parsed.preset_file {
        match std::fs::read_to_string(path)
            .map_err(|e| e.to_string())
            .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).map_err(|e| e.to_string()))
        {
            Ok(v) => manifest.preset = v,
            Err(e) => {
                eprintln!("Cannot read preset file {}: {e}", path.display());
                std::process::exit(EXIT_BAD_ARGS);
            }
        }
    }

    if parsed.silent {
        std::process::exit(headless::run(&manifest, &parsed, forced_dry));
    }

    if let Err(e) = gui::run(manifest, parsed, forced_dry) {
        eprintln!("{e}");
        message_box(&e);
        std::process::exit(EXIT_ERROR);
    }
}

/// With windows_subsystem = "windows" a fatal startup error would die
/// silently for double-click users; surface it in a message box.
fn message_box(msg: &str) {
    #[cfg(target_os = "windows")]
    {
        let script = format!(
            "Add-Type -AssemblyName System.Windows.Forms; \
             [System.Windows.Forms.MessageBox]::Show('{}', 'Installer') | Out-Null",
            msg.replace('\'', "''").replace('\n', " ")
        );
        use std::os::windows::process::CommandExt;
        let _ = std::process::Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &script])
            .creation_flags(0x0800_0000) // CREATE_NO_WINDOW
            .output();
    }
    #[cfg(not(target_os = "windows"))]
    let _ = msg;
}
