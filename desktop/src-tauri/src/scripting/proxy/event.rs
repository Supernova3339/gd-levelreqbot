use crate::ws::WsState;
use rhai::{Dynamic, Engine};
use std::sync::Arc;
use tauri::AppHandle;
use tracing::error;

/// Tauri only allows alphanumeric chars, '-', '/', ':', '_' in event names.
fn is_valid_event_name(name: &str) -> bool {
    !name.is_empty() && name.chars().all(|c| c.is_alphanumeric() || matches!(c, '-' | '/' | ':' | '_'))
}

#[derive(Clone)]
pub struct EventProxy {
    pub app_handle: AppHandle,
}

/// Convert a Rhai Dynamic value to a JSON-serialisable string for WS broadcast.
fn dynamic_to_string(d: Dynamic) -> String {
    if let Ok(s) = d.clone().into_string() {
        return s;
    }
    if d.is::<i64>() {
        return d.cast::<i64>().to_string();
    }
    if d.is::<f64>() {
        return d.cast::<f64>().to_string();
    }
    if d.is::<bool>() {
        return d.cast::<bool>().to_string();
    }
    // Fallback: debug representation
    format!("{d:?}")
}

pub fn register(engine: &mut Engine) {
    engine.register_type_with_name::<EventProxy>("Event");

    // event.emit(name, payload) — payload can be any type
    engine.register_fn("emit", |ev: &mut EventProxy, event: &str, payload: Dynamic| {
        use tauri::{Emitter, Manager};

        if !is_valid_event_name(event) {
            error!("event.emit: invalid event name {:?} — only alphanumeric, '-', '/', ':', '_' allowed", event);
            return;
        }

        let payload_str = dynamic_to_string(payload);

        // 1. Emit to Tauri frontend
        if let Err(e) = ev.app_handle.emit(event, &payload_str) {
            error!("event.emit({event}): {e}");
        }

        // 2. Broadcast to WebSocket clients if the server is running
        if let Some(ws) = ev.app_handle.try_state::<Arc<WsState>>() {
            if ws.client_count() > 0 {
                let msg = serde_json::json!({
                    "event": event,
                    "data":  payload_str,
                }).to_string();
                let _ = ws.tx.send(msg);
            }
        }
    });

    // Convenience overload: event.emit(name) — no payload
    engine.register_fn("emit", |ev: &mut EventProxy, event: &str| {
        use tauri::{Emitter, Manager};

        if !is_valid_event_name(event) {
            error!("event.emit: invalid event name {:?} — only alphanumeric, '-', '/', ':', '_' allowed", event);
            return;
        }

        if let Err(e) = ev.app_handle.emit(event, "") {
            error!("event.emit({event}): {e}");
        }

        if let Some(ws) = ev.app_handle.try_state::<Arc<WsState>>() {
            if ws.client_count() > 0 {
                let msg = serde_json::json!({ "event": event, "data": "" }).to_string();
                let _ = ws.tx.send(msg);
            }
        }
    });
}
