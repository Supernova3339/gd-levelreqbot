// console proxy — debug logging from scripts.
// Output goes to:
//   1. The console buffer (returned in TestScriptResult.console — separate from chat)
//   2. The live Console page via "console-log" Tauri event (includes which command ran)

use crate::scripting::context::ScriptOutput;
use rhai::{Dynamic, Engine};
use serde::Serialize;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

#[derive(Clone)]
pub struct ConsoleProxy {
    pub output:          ScriptOutput,
    pub app_handle:      Arc<AppHandle>,
    pub command_trigger: String,
}

#[derive(Clone, Serialize)]
struct ConsoleEvent {
    level:   String,
    message: String,
    command: String,   // which command trigger produced this log
}

fn fmt(val: Dynamic) -> String {
    if let Ok(s) = val.clone().into_string() { return s; }
    if val.is::<i64>()  { return val.cast::<i64>().to_string();  }
    if val.is::<f64>()  { return val.cast::<f64>().to_string();  }
    if val.is::<bool>() { return val.cast::<bool>().to_string(); }
    format!("{val:?}")
}

fn push(c: &mut ConsoleProxy, level: &str, message: String) {
    c.output.lock().unwrap().push(message.clone());
    let _ = c.app_handle.emit("console-log", ConsoleEvent {
        level:   level.to_string(),
        message,
        command: c.command_trigger.clone(),
    });
}

pub fn register(engine: &mut Engine) {
    engine.register_type_with_name::<ConsoleProxy>("Console");

    engine.register_fn("log", |c: &mut ConsoleProxy, val: Dynamic| {
        push(c, "log", fmt(val));
    });
    engine.register_fn("log", |c: &mut ConsoleProxy, a: Dynamic, b: Dynamic| {
        push(c, "log", format!("{} {}", fmt(a), fmt(b)));
    });
    engine.register_fn("warn", |c: &mut ConsoleProxy, val: Dynamic| {
        push(c, "warn", fmt(val));
    });
    engine.register_fn("error", |c: &mut ConsoleProxy, val: Dynamic| {
        push(c, "error", fmt(val));
    });
}
