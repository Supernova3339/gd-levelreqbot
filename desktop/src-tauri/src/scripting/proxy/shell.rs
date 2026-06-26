// shell proxy — execute local shell commands from Rhai scripts.
// DANGEROUS: only injected into scope when script_shell_enabled = true in settings.
//
// shell.run(cmd)               → String  stdout (trimmed), "" on failure
// shell.run_timeout(cmd, secs) → String  same with an explicit timeout
// shell.env(name)              → String  environment variable value, "" if unset

use rhai::Engine;
use std::process::Command as ShellCommand;
use std::sync::mpsc;
use std::thread;
use std::time::Duration;
use tracing::warn;

#[derive(Clone)]
pub struct ShellProxy;

fn exec(cmd: &str, timeout_secs: u64) -> String {
    let cmd = cmd.to_string();
    let (tx, rx) = mpsc::channel();

    thread::spawn(move || {
        #[cfg(target_os = "windows")]
        let result = ShellCommand::new("cmd").args(["/C", &cmd]).output();
        #[cfg(not(target_os = "windows"))]
        let result = ShellCommand::new("sh").args(["-c", &cmd]).output();
        let _ = tx.send(result);
    });

    match rx.recv_timeout(Duration::from_secs(timeout_secs.max(1))) {
        Ok(Ok(out))  => String::from_utf8_lossy(&out.stdout).trim().to_string(),
        Ok(Err(e))   => { warn!("shell.run failed: {e}"); String::new() }
        Err(_)       => { warn!("shell.run timed out ({timeout_secs}s)"); String::new() }
    }
}

pub fn register(engine: &mut Engine) {
    engine.register_type_with_name::<ShellProxy>("Shell");

    engine.register_fn("run", |_: &mut ShellProxy, cmd: &str| -> String {
        exec(cmd, 10)
    });

    engine.register_fn("run_timeout", |_: &mut ShellProxy, cmd: &str, secs: i64| -> String {
        exec(cmd, secs.max(1) as u64)
    });

    engine.register_fn("env", |_: &mut ShellProxy, name: &str| -> String {
        std::env::var(name).unwrap_or_default()
    });
}
