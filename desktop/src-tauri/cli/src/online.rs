use anyhow::{bail, Context, Result};
use serde_json::Value;

const GREEN:  &str = "\x1b[92m";
const YELLOW: &str = "\x1b[93m";
const RED:    &str = "\x1b[91m";
const CYAN:   &str = "\x1b[96m";
const BOLD:   &str = "\x1b[1m";
const DIM:    &str = "\x1b[2m";
const RESET:  &str = "\x1b[0m";

// ── Shared HTTP helpers ───────────────────────────────────────────────────────

fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .unwrap()
}

async fn get_json(url: &str) -> Result<Value> {
    let res = client().get(url).send().await
        .with_context(|| format!("Cannot reach app — is it running?\n  Tried: {url}"))?;
    if !res.status().is_success() {
        bail!("HTTP {} from {url}", res.status());
    }
    Ok(res.json::<Value>().await?)
}

async fn post_json(url: &str, body: Value) -> Result<Value> {
    let res = client().post(url).json(&body).send().await
        .with_context(|| format!("Cannot reach app — is it running?\n  Tried: {url}"))?;
    if !res.status().is_success() {
        let code = res.status();
        let text = res.text().await.unwrap_or_default();
        bail!("HTTP {code}: {text}");
    }
    Ok(res.json::<Value>().await.unwrap_or(Value::Null))
}

async fn delete_json(url: &str) -> Result<Value> {
    let res = client().delete(url).send().await
        .with_context(|| format!("Cannot reach app — is it running?\n  Tried: {url}"))?;
    if !res.status().is_success() {
        bail!("HTTP {} from {url}", res.status());
    }
    Ok(res.json::<Value>().await.unwrap_or(Value::Null))
}

fn str_val<'a>(v: &'a Value, key: &str) -> &'a str {
    v[key].as_str().unwrap_or("—")
}

// ── status ────────────────────────────────────────────────────────────────────
// API returns: { bot_running, bot_status, twitch_connected, youtube_connected, api_version }

pub async fn status(base: &str) -> Result<()> {
    let v = get_json(&format!("{base}/api/dev/status")).await?;

    let connected  = v["bot_running"].as_bool().unwrap_or(false);
    let bot_status = str_val(&v, "bot_status");
    let twitch     = v["twitch_connected"].as_bool().unwrap_or(false);
    let youtube    = v["youtube_connected"].as_bool().unwrap_or(false);
    let api_ver    = str_val(&v, "api_version");

    println!("\n{BOLD}App Status{RESET}");
    let (dot, label) = if connected {
        (format!("{GREEN}●{RESET}"), format!("{GREEN}connected{RESET}"))
    } else {
        (format!("{RED}●{RESET}"), format!("{RED}{bot_status}{RESET}"))
    };
    println!("  {dot}  bot            {label}");
    let tf = |b: bool| if b { format!("{GREEN}yes{RESET}") } else { format!("{RED}no{RESET}") };
    println!("  {CYAN}⬡{RESET}  twitch         {}", tf(twitch));
    println!("  {CYAN}⬡{RESET}  youtube        {}", tf(youtube));
    println!("  {CYAN}⬡{RESET}  api version    {api_ver}");
    Ok(())
}

// ── modules ───────────────────────────────────────────────────────────────────
// API returns Vec<ModuleManifest> — id, name, version, description, commands[]

pub async fn modules(base: &str) -> Result<()> {
    let v = get_json(&format!("{base}/api/dev/modules")).await?;
    let modules = v.as_array().context("Expected array from /api/dev/modules")?;

    if modules.is_empty() {
        println!("{YELLOW}No modules installed.{RESET}");
        return Ok(());
    }

    println!("\n{BOLD}Installed Modules{RESET}\n");
    let id_w   = modules.iter().map(|m| m["id"].as_str().unwrap_or("").len()).max().unwrap_or(6).max(6);
    let name_w = modules.iter().map(|m| m["name"].as_str().unwrap_or("").len()).max().unwrap_or(8).max(8);

    println!("  {BOLD}{:<id_w$}  {:<name_w$}  {:<9}  Cmds{RESET}",
        "ID", "Name", "Version", id_w = id_w, name_w = name_w);
    println!("  {}", "─".repeat(id_w + name_w + 22));

    for m in modules {
        let id      = m["id"].as_str().unwrap_or("?");
        let name    = m["name"].as_str().unwrap_or("?");
        let ver     = m["version"].as_str().unwrap_or("?");
        let cmd_cnt = m["commands"].as_array().map(|a| a.len()).unwrap_or(0);
        println!("  {CYAN}{:<id_w$}{RESET}  {:<name_w$}  {:<9}  {cmd_cnt}",
            id, name, ver, id_w = id_w, name_w = name_w);
    }
    println!();
    Ok(())
}

// ── commands ──────────────────────────────────────────────────────────────────
// API returns: [{ id, trigger, aliases, enabled, description, builtin_key }]

pub async fn commands(base: &str) -> Result<()> {
    let v = get_json(&format!("{base}/api/dev/commands")).await?;
    let cmds = v.as_array().context("Expected array from /api/dev/commands")?;

    if cmds.is_empty() {
        println!("{YELLOW}No commands registered.{RESET}");
        return Ok(());
    }

    println!("\n{BOLD}Registered Commands{RESET}\n");
    let trigger_w = cmds.iter().map(|c| c["trigger"].as_str().unwrap_or("").len()).max().unwrap_or(7).max(7);
    let key_w     = cmds.iter().map(|c| c["builtin_key"].as_str().unwrap_or("").len()).max().unwrap_or(11).max(11);

    println!("  {BOLD}{:<trigger_w$}  {:<key_w$}  Description{RESET}",
        "Trigger", "Builtin Key", trigger_w = trigger_w, key_w = key_w);
    println!("  {}", "─".repeat(trigger_w + key_w + 16));

    for cmd in cmds {
        let trigger  = cmd["trigger"].as_str().unwrap_or("?");
        let key      = cmd["builtin_key"].as_str().unwrap_or("—");
        let desc     = cmd["description"].as_str().unwrap_or("");
        let enabled  = cmd["enabled"].as_bool().unwrap_or(true);
        let dim      = if enabled { "" } else { "\x1b[2m" };
        let tag      = if enabled { "" } else { " (disabled)" };
        println!("  {dim}{CYAN}{:<trigger_w$}{RESET}{dim}  {:<key_w$}  {desc}{tag}{RESET}",
            trigger, key, trigger_w = trigger_w, key_w = key_w);
    }
    println!();
    Ok(())
}

// ── preflight ─────────────────────────────────────────────────────────────────
// API returns Vec<PreflightIssue> — { severity, kind, file, message }
// or { error: "..." } with 404 when not found

pub async fn preflight(base: &str, id: &str) -> Result<()> {
    let v = get_json(&format!("{base}/api/dev/preflight/{id}")).await?;

    // 404 / error object
    if let Some(e) = v["error"].as_str() {
        bail!("{e}");
    }

    let issues = v.as_array().context("Expected array from /api/dev/preflight")?;

    println!("\n{BOLD}Preflight: {id}{RESET}\n");

    if issues.is_empty() {
        println!("  {GREEN}✓  All checks passed{RESET}");
        return Ok(());
    }

    let mut has_error = false;
    for issue in issues {
        let sev  = issue["severity"].as_str().unwrap_or("error");
        let kind = issue["kind"].as_str().unwrap_or("?");
        let msg  = issue["message"].as_str().unwrap_or("?");
        let file = issue["file"].as_str()
            .map(|f| format!("  {YELLOW}[{f}]{RESET}"))
            .unwrap_or_default();
        if sev == "error" {
            has_error = true;
            println!("  {RED}✗ [{kind}]{RESET}  {msg}{file}");
        } else {
            println!("  {YELLOW}⚠ [{kind}]{RESET}  {msg}{file}");
        }
    }
    println!();
    if has_error { bail!("Preflight failed"); }
    Ok(())
}

// ── install ───────────────────────────────────────────────────────────────────
// API body: { source_dir }  returns: { module_id } or { error }

pub async fn install(base: &str, dir: &str) -> Result<()> {
    let abs = std::path::Path::new(dir).canonicalize()
        .with_context(|| format!("Directory not found: {dir}"))?;
    let abs_str = abs.to_string_lossy().replace('\\', "/");

    println!("{CYAN}Installing from {abs_str}…{RESET}");
    let v = post_json(
        &format!("{base}/api/dev/install"),
        serde_json::json!({ "source_dir": abs_str }),
    ).await?;

    if let Some(e) = v["error"].as_str() {
        bail!("{e}");
    }
    let id = v["module_id"].as_str().unwrap_or("?");
    println!("{GREEN}✓  Installed module: {id}{RESET}");
    Ok(())
}

// ── dev-watch ─────────────────────────────────────────────────────────────────
// API body: { source_dir }  returns: { module_id, watching } or { error }

pub async fn dev_watch(base: &str, dir: &str) -> Result<()> {
    let abs = std::path::Path::new(dir).canonicalize()
        .with_context(|| format!("Directory not found: {dir}"))?;
    let abs_str = abs.to_string_lossy().replace('\\', "/");

    println!("{CYAN}Starting dev-watch for {abs_str}…{RESET}");
    let v = post_json(
        &format!("{base}/api/dev/watch"),
        serde_json::json!({ "source_dir": abs_str }),
    ).await?;

    if let Some(e) = v["error"].as_str() {
        bail!("{e}");
    }
    let id = v["module_id"].as_str().unwrap_or("?");
    println!("{GREEN}✓  Watching module: {id}{RESET}");
    println!("{YELLOW}Hot-reload active — file changes will auto-reinstall.{RESET}");
    println!("{YELLOW}Stop with: gdlqbot dev-unwatch {id}{RESET}");
    Ok(())
}

// ── dev-unwatch ───────────────────────────────────────────────────────────────
// API returns: { stopped: true }

pub async fn dev_unwatch(base: &str, id: &str) -> Result<()> {
    let v = delete_json(&format!("{base}/api/dev/watch/{id}")).await?;
    if v["stopped"].as_bool().unwrap_or(false) {
        println!("{GREEN}✓  Dev-watch stopped for: {id}{RESET}");
    } else if let Some(e) = v["error"].as_str() {
        bail!("{e}");
    } else {
        println!("{YELLOW}Watch for {id} was not active.{RESET}");
    }
    Ok(())
}

// ── eval ──────────────────────────────────────────────────────────────────────
// API body: { code, module_id? }  returns: { result } or { error }

pub async fn eval(base: &str, code: &str, module_id: Option<&str>) -> Result<()> {
    let mut body = serde_json::json!({ "code": code });
    if let Some(id) = module_id {
        body["module_id"] = Value::String(id.to_string());
    }

    let v = post_json(&format!("{base}/api/dev/eval"), body).await?;

    if let Some(error) = v["error"].as_str() {
        println!("{RED}!  {error}{RESET}");
        bail!("Eval error");
    }
    let result = v["result"].as_str().unwrap_or("null");
    println!("{GREEN}=> {result}{RESET}");
    Ok(())
}

// ── console ───────────────────────────────────────────────────────────────────
// Streams console-log + bot-runtime-error events from the app and runs a REPL.
// Events are fetched by polling /api/dev/console/events?after=N every 150ms
// in a background task; the main task drives a tokio stdin readline loop.

pub async fn console(base: &str, module_id: Option<String>) -> Result<()> {
    use std::io::Write as _;
    use tokio::io::{AsyncBufReadExt, BufReader};

    // Verify app is reachable before entering the loop
    get_json(&format!("{base}/api/dev/status")).await
        .context("App is not running or not reachable")?;

    println!("\n{BOLD}{CYAN}GDLQBot Console{RESET}  {DIM}Ctrl+C to exit{RESET}");
    if let Some(ref mid) = module_id {
        println!("{DIM}Module context: {mid}{RESET}");
    }
    println!("{DIM}Type Rhai code at the prompt. Bot events stream above.{RESET}");
    println!("{DIM}Enter .exit or press Ctrl+C to quit.{RESET}\n");

    // Background task: poll events and send formatted lines to main task
    let (event_tx, mut event_rx) = tokio::sync::mpsc::unbounded_channel::<String>();
    let poll_base  = base.to_string();
    let poll_client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()?;
    tokio::spawn(async move {
        // Snapshot the current tail so we only show new events going forward
        let mut after: u64 = {
            let url = format!("{poll_base}/api/dev/console/events?after=0");
            if let Ok(resp) = poll_client.get(&url).send().await {
                resp.json::<Vec<Value>>().await.ok()
                    .and_then(|ev| ev.last().and_then(|e| e["seq"].as_u64()))
                    .unwrap_or(0)
            } else { 0 }
        };

        loop {
            tokio::time::sleep(std::time::Duration::from_millis(150)).await;
            let url = format!("{poll_base}/api/dev/console/events?after={after}");
            let Ok(resp) = poll_client.get(&url).send().await else { continue };
            let Ok(events) = resp.json::<Vec<Value>>().await else { continue };
            for ev in &events {
                if let Some(seq) = ev["seq"].as_u64() { if seq > after { after = seq; } }
                let ts      = ev["ts"].as_str().unwrap_or("??:??:??");
                let level   = ev["level"].as_str().unwrap_or("log");
                let message = ev["message"].as_str().unwrap_or("");
                let command = ev["command"].as_str().unwrap_or("");
                let (col, icon) = match level {
                    "error" => (RED,    "✕"),
                    "warn"  => (YELLOW, "⚠"),
                    _       => (DIM,    "›"),
                };
                let cmd_part = if !command.is_empty() && command != "unknown" {
                    format!("{DIM}{command}{RESET} ")
                } else { String::new() };
                let _ = event_tx.send(format!(
                    "\r{DIM}{ts}{RESET}  {cmd_part}{col}{icon} {message}{RESET}"
                ));
            }
        }
    });

    // REPL loop: interleave event output with user input
    let eval_base   = base.to_string();
    let eval_client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()?;
    let mut stdin = BufReader::new(tokio::io::stdin()).lines();

    loop {
        // Print prompt
        print!("{GREEN}>{RESET} ");
        std::io::stdout().flush().ok();

        tokio::select! {
            // User typed a line
            line = stdin.next_line() => {
                let Some(line) = line.ok().flatten() else { break };
                let code = line.trim();
                if code.is_empty() { continue; }
                if code == ".exit" || code == "exit()" { break; }

                // Small yield to let background events arrive before printing result
                tokio::time::sleep(std::time::Duration::from_millis(30)).await;
                while let Ok(ev_line) = event_rx.try_recv() {
                    println!("{ev_line}");
                }

                let mut body = serde_json::json!({ "code": code });
                if let Some(ref mid) = module_id {
                    body["module_id"] = Value::String(mid.clone());
                }
                match eval_client.post(format!("{eval_base}/api/dev/eval"))
                    .json(&body).send().await
                {
                    Ok(resp) => {
                        let json: Value = resp.json().await.unwrap_or(Value::Null);
                        if let Some(err) = json["error"].as_str() {
                            println!("{RED}!  {err}{RESET}");
                        } else {
                            let result = json["result"].as_str().unwrap_or("null");
                            println!("{GREEN}=> {result}{RESET}");
                        }
                    }
                    Err(e) => println!("{RED}request failed: {e}{RESET}"),
                }
            }

            // Incoming event from background poller
            ev_line = event_rx.recv() => {
                if let Some(line) = ev_line {
                    // \r clears the partially-typed prompt line before printing the event
                    println!("{line}");
                    print!("{GREEN}>{RESET} ");
                    std::io::stdout().flush().ok();
                }
            }
        }
    }

    println!("\n{DIM}Console closed.{RESET}");
    Ok(())
}
