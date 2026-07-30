//! Windows integration: HKCU uninstall entry, App Paths, file association,
//! Start Menu / Desktop shortcuts, and user PATH for the CLI. Everything is
//! per-user (HKCU) so no elevation is required.

use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;

use winreg::enums::*;
use winreg::RegKey;

/// Child processes (powershell, cmd) must not flash console windows over
/// the GUI installer.
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// For the detached self-delete script specifically: some launchers (CI
/// runners, sandboxed shells, IDE task runners) put the installer process in
/// a Windows Job Object with "kill on job close" — plain child processes die
/// the instant the installer exits, before the delayed cleanup script can
/// run. `CREATE_BREAKAWAY_FROM_JOB` escapes that job (falls back to a no-op
/// if the job doesn't permit breakaway).
///
/// Deliberately NOT combined with `DETACHED_PROCESS`: Microsoft's own
/// CreateProcess docs list `DETACHED_PROCESS` and `CREATE_NO_WINDOW` as
/// mutually exclusive. Passing both is undefined behavior — on some Windows
/// versions it can let a window flash through despite CREATE_NO_WINDOW.
/// CREATE_NO_WINDOW alone is the correct, fully-hidden way to launch a
/// console app; it already implies no visible console.
const CREATE_BREAKAWAY_FROM_JOB: u32 = 0x0100_0000;

use crate::install::{app_exe_path, cli_dir, uninstaller_name, InstallOptions};
use crate::manifest::Manifest;

const UNINSTALL_ROOT: &str = r"Software\Microsoft\Windows\CurrentVersion\Uninstall";

fn uninstall_key(manifest: &Manifest) -> String {
    format!(r"{UNINSTALL_ROOT}\{}", manifest.identifier)
}

/// Where a previous version registered itself, if anywhere.
pub fn registered_install_dir(manifest: &Manifest) -> Option<PathBuf> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let key = hkcu.open_subkey(uninstall_key(manifest)).ok()?;
    let loc: String = key.get_value("InstallLocation").ok()?;
    let p = PathBuf::from(loc);
    p.exists().then_some(p)
}

pub fn register(manifest: &Manifest, opts: &InstallOptions) -> Result<(), String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let exe = app_exe_path(manifest, &opts.dir);
    let exe_str = exe.to_string_lossy().to_string();
    let uninst = opts.dir.join(uninstaller_name()).to_string_lossy().to_string();

    // Add/Remove Programs entry
    let (key, _) = hkcu
        .create_subkey(uninstall_key(manifest))
        .map_err(|e| format!("registry: {e}"))?;
    key.set_value("DisplayName", &manifest.product_name).map_err(|e| e.to_string())?;
    key.set_value("DisplayVersion", &manifest.version).map_err(|e| e.to_string())?;
    key.set_value("Publisher", &manifest.publisher).map_err(|e| e.to_string())?;
    key.set_value("DisplayIcon", &exe_str).map_err(|e| e.to_string())?;
    key.set_value("InstallLocation", &opts.dir.to_string_lossy().to_string()).map_err(|e| e.to_string())?;
    key.set_value("UninstallString", &format!("\"{uninst}\" --uninstall")).map_err(|e| e.to_string())?;
    key.set_value("QuietUninstallString", &format!("\"{uninst}\" --uninstall --silent")).map_err(|e| e.to_string())?;
    if !manifest.homepage.is_empty() {
        key.set_value("URLInfoAbout", &manifest.homepage).map_err(|e| e.to_string())?;
    }
    key.set_value("NoModify", &1u32).map_err(|e| e.to_string())?;
    key.set_value("NoRepair", &1u32).map_err(|e| e.to_string())?;
    key.set_value("EstimatedSize", &(dir_size_kb(&opts.dir))).map_err(|e| e.to_string())?;

    // App Paths — lets `start gdlqbot` / Win+R find the exe by name
    let (app_paths, _) = hkcu
        .create_subkey(format!(
            r"Software\Microsoft\Windows\CurrentVersion\App Paths\{}",
            manifest.exe_name
        ))
        .map_err(|e| e.to_string())?;
    app_paths.set_value("", &exe_str).map_err(|e| e.to_string())?;

    // File associations (.gdlqs, .gdui, .rhai, …)
    if opts.file_assoc {
        let classes = hkcu.open_subkey_with_flags(r"Software\Classes", KEY_ALL_ACCESS)
            .map_err(|e| e.to_string())?;
        for assoc in &manifest.file_associations {
            let (ext_key, _) = classes.create_subkey(format!(".{}", assoc.ext)).map_err(|e| e.to_string())?;
            ext_key.set_value("", &assoc.prog_id).map_err(|e| e.to_string())?;
            let (prog, _) = classes.create_subkey(&assoc.prog_id).map_err(|e| e.to_string())?;
            prog.set_value("", &assoc.description).map_err(|e| e.to_string())?;
            let (icon, _) = prog.create_subkey("DefaultIcon").map_err(|e| e.to_string())?;
            icon.set_value("", &format!("{exe_str},0")).map_err(|e| e.to_string())?;
            let (cmd, _) = prog.create_subkey(r"shell\open\command").map_err(|e| e.to_string())?;
            cmd.set_value("", &format!("\"{exe_str}\" \"%1\"")).map_err(|e| e.to_string())?;
        }
    }

    // Shortcuts — Start Menu gets a product folder with app + uninstaller.
    if opts.start_menu {
        if let Some(dir) = start_menu_dir() {
            let folder = dir.join(&manifest.product_name);
            std::fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
            create_shortcut(
                &folder.join(format!("{}.lnk", manifest.product_name)),
                &exe, "", &opts.dir,
            )?;
            create_shortcut(
                &folder.join(format!("Uninstall {}.lnk", manifest.product_name)),
                &opts.dir.join(uninstaller_name()), "--uninstall", &opts.dir,
            )?;
        }
    }
    if opts.desktop_shortcut {
        if let Some(dir) = dirs::desktop_dir() {
            create_shortcut(&dir.join(format!("{}.lnk", manifest.product_name)), &exe, "", &opts.dir)?;
        }
    }

    // CLI on PATH
    if opts.install_cli {
        add_to_user_path(&cli_dir(&opts.dir).to_string_lossy())?;
    }

    Ok(())
}

pub fn unregister(manifest: &Manifest, opts: &InstallOptions, dir: &Path) -> Result<(), String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let _ = hkcu.delete_subkey_all(uninstall_key(manifest));
    let _ = hkcu.delete_subkey_all(format!(
        r"Software\Microsoft\Windows\CurrentVersion\App Paths\{}",
        manifest.exe_name
    ));
    for assoc in &manifest.file_associations {
        let _ = hkcu.delete_subkey_all(format!(r"Software\Classes\.{}", assoc.ext));
        let _ = hkcu.delete_subkey_all(format!(r"Software\Classes\{}", assoc.prog_id));
    }
    if let Some(d) = start_menu_dir() {
        // Product folder (current layout) + a bare top-level .lnk just in case.
        let _ = std::fs::remove_dir_all(d.join(&manifest.product_name));
        let _ = std::fs::remove_file(d.join(format!("{}.lnk", manifest.product_name)));
    }
    if let Some(d) = dirs::desktop_dir() {
        let _ = std::fs::remove_file(d.join(format!("{}.lnk", manifest.product_name)));
    }
    if opts.install_cli {
        let _ = remove_from_user_path(&cli_dir(dir).to_string_lossy());
    }
    remove_autostart_entries(dir);
    Ok(())
}

/// The app can register itself to run at login (tauri-plugin-autostart →
/// HKCU Run). Remove any Run value whose command points into the install
/// dir so an uninstall doesn't leave a dead autostart behind.
fn remove_autostart_entries(install_dir: &Path) {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let Ok(run) = hkcu.open_subkey_with_flags(
        r"Software\Microsoft\Windows\CurrentVersion\Run",
        KEY_ALL_ACCESS,
    ) else {
        return;
    };
    let dir_lower = install_dir.to_string_lossy().to_lowercase();
    let stale: Vec<String> = run
        .enum_values()
        .filter_map(|v| v.ok())
        .filter(|(_, value)| format!("{value}").to_lowercase().contains(&dir_lower))
        .map(|(name, _)| name)
        .collect();
    for name in stale {
        let _ = run.delete_value(name);
    }
}

/// The uninstaller exe cannot delete itself (or its live webview cache)
/// while running; hand the final cleanup to a detached, temporary .bat
/// script that waits for this process to exit, then force-removes `dir`
/// recursively — regardless of whether the currently-running copy happens to
/// live inside it (running the installer from elsewhere with `--dir` is a
/// legitimate uninstall path too, and removing the directory doesn't depend
/// on that). If we *were* running from inside `dir`, this also deletes that
/// exe: by the time the script fires, the process has exited and released
/// the lock. `extra_paths` (files or directories) are removed first — the
/// installer's own webview cache, the setup log, etc.
///
/// A real .bat file, not a single `cmd /C "<one-liner>"` string: a live GUI
/// uninstall is driven by this process's own webview, whose cache is still
/// open (helper subprocesses still winding down) for a bit after the window
/// closes, so a single immediate removal attempt routinely loses that race.
/// Each path gets a `for /L` retry loop instead of trying once — but nesting
/// that retry logic (`if exist` + `||` + parenthesized groups, several
/// levels deep) into one inline command-line string runs straight into
/// cmd.exe's genuinely fragile parsing at that depth. A .bat file sidesteps
/// it entirely: each line is parsed on its own, the normal way.
pub fn schedule_self_delete(dir: &Path, extra_paths: &[std::path::PathBuf]) {
    let mut bat = String::from("@echo off\r\nping 127.0.0.1 -n 3 > nul 2>&1\r\n");
    for p in extra_paths {
        let verb = if p.is_dir() { "rmdir /s /q" } else { "del /f /q" };
        write_retry_block(&mut bat, verb, p, 6);
    }
    // The uninstaller's own exe is the one thing in `dir` that's actually
    // likely to still be locked (this very process, mid-exit) — wait for it
    // specifically, verifying it's gone, before touching the directory it
    // lives in. Recursing straight into `rmdir /s /q dir` while that exe is
    // still locked would fail the WHOLE directory removal as one unit and
    // burn a retry on everything else in it for no reason.
    //
    // A GUI run's `app.exit()` doesn't necessarily release the exe's lock
    // immediately — WebView2 teardown behind it can take a genuinely
    // unpredictable few extra seconds. Give this specific wait a much
    // bigger budget (30 tries × ~1s ≈ 30s) than the other paths: if it
    // gives up too early, the directory-removal step below never even gets
    // a chance, since it depends entirely on this one succeeding first.
    let uninstaller_path = dir.join(uninstaller_name());
    write_retry_block(&mut bat, "del /f /q", &uninstaller_path, 30);
    write_dir_retry_block(&mut bat, dir, 10);
    // Self-delete the batch file. Not a bare `del "%~f0"` as the literal last
    // line: cmd.exe's line-reading cursor advances past the command it just
    // ran before hitting EOF, and since that command just deleted the file
    // out from under it, it trips a spurious "cannot find" — functionally
    // harmless (the script already did everything it needed to) but noisy
    // whenever output happens to be captured. `(goto) 2>nul &` is the
    // standard idiom that avoids it.
    bat.push_str("(goto) 2>nul & del /f /q \"%~f0\" >nul 2>&1\r\n");

    let bat_path = std::env::temp_dir().join(format!("gdlqb-cleanup-{}.bat", std::process::id()));
    if std::fs::write(&bat_path, bat).is_err() {
        return;
    }
    let _ = Command::new("cmd")
        .arg("/C")
        .arg(&bat_path)
        .creation_flags(CREATE_NO_WINDOW | CREATE_BREAKAWAY_FROM_JOB)
        .spawn();
}

/// Appends a `for /L` loop retrying `verb "path"` up to `tries` times,
/// ~1s apart. Confirms deletion with a fresh `if exist` check before each
/// attempt (including the first), so it costs nothing once the path is
/// genuinely gone — later iterations skip straight through with no delay,
/// no early-exit `goto` needed. Every command is fully silenced (`>nul
/// 2>&1`) so nothing prints even if this script's output ever ends up
/// captured/inherited. Plain batch syntax throughout — no nested
/// parens/`||`, no labels, nothing subtle to get wrong.
fn write_retry_block(bat: &mut String, verb: &str, path: &Path, tries: u32) {
    let p = path.display();
    bat.push_str(&format!(
        "for /L %%i in (1,1,{tries}) do (\r\n  if exist \"{p}\" (\r\n    {verb} \"{p}\" >nul 2>&1\r\n    ping 127.0.0.1 -n 2 > nul 2>&1\r\n  )\r\n)\r\n",
    ));
}

/// Same retry loop, but for the install directory specifically: `cd` into
/// its parent first and `rmdir` it by bare folder name, instead of handing
/// `rmdir` the full absolute path. Removes any dependence on exactly how
/// that full path renders (length, trailing separators, anything about it
/// that might trip up `rmdir` on the whole string) — `pushd`/`popd` do the
/// path handling, `rmdir` only ever sees a short relative name.
fn write_dir_retry_block(bat: &mut String, dir: &Path, tries: u32) {
    let (Some(parent), Some(name)) = (dir.parent(), dir.file_name()) else {
        // No parent (a bare drive root or similar) — fall back to the plain form.
        write_retry_block(bat, "rmdir /s /q", dir, tries);
        return;
    };
    let full = dir.display();
    let parent = parent.display();
    let name = name.to_string_lossy();
    bat.push_str(&format!(
        "for /L %%i in (1,1,{tries}) do (\r\n\
         \x20 if exist \"{full}\" (\r\n\
         \x20   pushd \"{parent}\" >nul 2>&1\r\n\
         \x20   if exist \"{name}\" rmdir /s /q \"{name}\" >nul 2>&1\r\n\
         \x20   popd >nul 2>&1\r\n\
         \x20   ping 127.0.0.1 -n 2 > nul 2>&1\r\n\
         \x20 )\r\n\
         )\r\n",
    ));
}

fn start_menu_dir() -> Option<PathBuf> {
    dirs::data_dir().map(|d| d.join(r"Microsoft\Windows\Start Menu\Programs"))
}

fn create_shortcut(lnk: &Path, target: &Path, args: &str, workdir: &Path) -> Result<(), String> {
    let ps = format!(
        "$ws = New-Object -ComObject WScript.Shell; \
         $s = $ws.CreateShortcut('{lnk}'); \
         $s.TargetPath = '{target}'; \
         $s.Arguments = '{args}'; \
         $s.WorkingDirectory = '{workdir}'; \
         $s.IconLocation = '{target},0'; \
         $s.Save()",
        lnk = lnk.display(),
        target = target.display(),
        workdir = workdir.display(),
    );
    let out = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &ps])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("powershell: {e}"))?;
    if out.status.success() {
        Ok(())
    } else {
        Err(format!("Shortcut creation failed: {}", String::from_utf8_lossy(&out.stderr)))
    }
}

/// PATH edits go through .NET so the change is written to the registry AND
/// broadcast (WM_SETTINGCHANGE) — new shells pick it up immediately.
fn add_to_user_path(dir: &str) -> Result<(), String> {
    let ps = format!(
        "$p = [Environment]::GetEnvironmentVariable('Path','User'); \
         $parts = $p -split ';' | Where-Object {{ $_ -ne '' }}; \
         if ($parts -notcontains '{dir}') {{ \
           [Environment]::SetEnvironmentVariable('Path', (($parts + '{dir}') -join ';'), 'User') \
         }}"
    );
    run_ps(&ps)
}

fn remove_from_user_path(dir: &str) -> Result<(), String> {
    let ps = format!(
        "$p = [Environment]::GetEnvironmentVariable('Path','User'); \
         $parts = $p -split ';' | Where-Object {{ $_ -ne '' -and $_ -ne '{dir}' }}; \
         [Environment]::SetEnvironmentVariable('Path', ($parts -join ';'), 'User')"
    );
    run_ps(&ps)
}

fn run_ps(script: &str) -> Result<(), String> {
    let out = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("powershell: {e}"))?;
    if out.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).to_string())
    }
}

fn dir_size_kb(dir: &Path) -> u32 {
    fn walk(d: &Path) -> u64 {
        std::fs::read_dir(d)
            .map(|it| {
                it.flatten()
                    .map(|e| {
                        let p = e.path();
                        if p.is_dir() { walk(&p) } else { e.metadata().map(|m| m.len()).unwrap_or(0) }
                    })
                    .sum()
            })
            .unwrap_or(0)
    }
    (walk(dir) / 1024) as u32
}
