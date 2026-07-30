use crate::bot::cmd_cache::CommandCache;
use crate::bot::dev::DevLogger;
use crate::bot::handler::{execute_command, send_replies};
use crate::bot::{BotState, ChatMessage};
use crate::config::AppConfig;
use crate::modules::{slugify, ModuleState};
use crate::queue::QueueState;
use crate::ws::WsState;
use once_cell::sync::Lazy;
use rhai::{Dynamic, Engine};
use std::collections::HashMap;
use std::sync::{Arc, Mutex as StdMutex};
use std::time::{Duration, Instant};
use tauri::AppHandle;
use tokio::sync::RwLock;
use tracing::error;

/// Tauri only allows alphanumeric chars, '-', '/', ':', '_' in event names.
fn is_valid_event_name(name: &str) -> bool {
    !name.is_empty() && name.chars().all(|c| c.is_alphanumeric() || matches!(c, '-' | '/' | ':' | '_'))
}

/// A chain longer than this refuses to dispatch further, even if every name
/// in it is distinct — backstop against pathological (not necessarily
/// cyclic) deep chains, since nothing here can otherwise tell a legitimately
/// long chain apart from a bug.
const MAX_CHAIN_DEPTH: usize = 12;

/// Last time each event name was emitted — backs `event.emitted(name[, seconds])`,
/// a script-level check for "did this just happen" (e.g. "don't pop the queue
/// again, we already advanced a few seconds ago via the UI"). Separate from the
/// chain-based cycle guard below: this is about coordinating two *independent*
/// invocations (a UI click, then a chat command), not about one invocation's
/// emit re-triggering itself.
static LAST_EMITTED: Lazy<StdMutex<HashMap<String, Instant>>> = Lazy::new(|| StdMutex::new(HashMap::new()));
const DEFAULT_EMITTED_WINDOW_SECS: i64 = 5;

fn record_emitted(names: &[String]) {
    let mut guard = LAST_EMITTED.lock().unwrap();
    let now = Instant::now();
    for n in names {
        guard.insert(n.clone(), now);
    }
}

fn was_emitted_within(name: &str, seconds: i64) -> bool {
    let guard = LAST_EMITTED.lock().unwrap();
    match guard.get(name) {
        Some(t) => t.elapsed() <= Duration::from_secs(seconds.max(0) as u64),
        None => false,
    }
}

#[derive(Clone)]
pub struct EventProxy {
    pub app_handle: AppHandle,
    /// Set when this script is running as a module command/action — used to
    /// also try a namespaced listener match (`<author-slug>.<module_id>.<event>`)
    /// so two modules picking the same short event name (e.g. "updated") can't
    /// have one's listener accidentally fire off the other's emit. The raw
    /// broadcast to the frontend/WS (step 1/2 in `emit`) is never namespaced —
    /// existing conventions like "queue-updated" depend on the literal name.
    pub module_id: Option<String>,
    /// Event names already seen earlier in the dispatch chain that led to
    /// this script running (empty unless this script IS an event-listener
    /// command). `emit()` refuses to dispatch a name already in this chain —
    /// precise A→B→A (etc) cycle detection, not just a blunt global cap.
    pub chain: Vec<String>,
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

fn emit_impl(ev: &mut EventProxy, event: &str, payload_str: String) {
    use tauri::{Emitter, Manager};

    if !is_valid_event_name(event) {
        error!("event.emit: invalid event name {:?} — only alphanumeric, '-', '/', ':', '_' allowed", event);
        return;
    }

    if ev.chain.contains(&event.to_string()) {
        let chain_str = ev.chain.join(" → ");
        error!("event.emit({event}): cycle detected (chain: {chain_str} → {event}) — refusing to dispatch");
        dev_log(&ev.app_handle, format!("! event '{event}' — cycle detected ({chain_str} → {event}), not dispatched"));
        return;
    }
    if ev.chain.len() >= MAX_CHAIN_DEPTH {
        error!("event.emit({event}): chain too deep ({} hops) — refusing to dispatch", ev.chain.len());
        return;
    }

    // 1. Emit to Tauri frontend
    if let Err(e) = ev.app_handle.emit(event, &payload_str) {
        error!("event.emit({event}): {e}");
    }

    // 2. Broadcast to WebSocket clients if the server is running
    if let Some(ws) = ev.app_handle.try_state::<Arc<WsState>>() {
        if ws.client_count() > 0 {
            let msg = serde_json::json!({ "event": event, "data": payload_str.clone() }).to_string();
            let _ = ws.tx.send(msg);
        }
    }

    // 3. Record for event.emitted() recency checks — both the raw name and,
    // when this is a module script, the namespaced form, so a check can use
    // either (see `dispatch_listener_command_inner` for the same duality).
    // Namespacing needs the module's author (a DB read), so it's resolved
    // async — the raw name is still recorded synchronously below regardless,
    // so a same-module bare-name check works even before that resolves.
    record_emitted(&[event.to_string()]);
    if let Some(mid) = &ev.module_id {
        let mid = mid.clone();
        let app_handle = ev.app_handle.clone();
        let event_owned = event.to_string();
        tauri::async_runtime::spawn(async move {
            if let Some(modules) = app_handle.try_state::<Arc<ModuleState>>() {
                if let Some(m) = modules.get_module(&mid).await {
                    record_emitted(&[format!("{}.{}.{}", slugify(&m.author), mid, event_owned)]);
                }
            }
        });
    }

    // 4. Fire any command whose additional listener is bound to this event name.
    let mut next_chain = ev.chain.clone();
    next_chain.push(event.to_string());
    dispatch_listener_command(ev.app_handle.clone(), ev.module_id.clone(), event.to_string(), payload_str, next_chain);
}

pub fn register(engine: &mut Engine) {
    engine.register_type_with_name::<EventProxy>("Event");

    // event.emit(name, payload) — payload can be any type
    engine.register_fn("emit", |ev: &mut EventProxy, event: &str, payload: Dynamic| {
        emit_impl(ev, event, dynamic_to_string(payload));
    });

    // Convenience overload: event.emit(name) — no payload
    engine.register_fn("emit", |ev: &mut EventProxy, event: &str| {
        emit_impl(ev, event, String::new());
    });

    // event.emitted(name) / event.emitted(name, seconds) — was this event name
    // (bare or module-namespaced) emitted within the last N seconds (default 5)?
    // For coordinating two *independent* invocations of the same logical action
    // (e.g. a UI button and a chat command both able to trigger the same effect) —
    // not related to the chain-based cycle guard on `emit` above.
    engine.register_fn("emitted", |_ev: &mut EventProxy, name: &str| -> bool {
        was_emitted_within(name, DEFAULT_EMITTED_WINDOW_SECS)
    });
    engine.register_fn("emitted", |_ev: &mut EventProxy, name: &str, seconds: i64| -> bool {
        was_emitted_within(name, seconds)
    });
}

fn dev_log(app_handle: &AppHandle, msg: impl Into<String>) {
    use tauri::Manager;
    if let Some(dev) = app_handle.try_state::<Arc<DevLogger>>() {
        dev.log(msg);
    }
}

/// Fire-and-forget: if any command has an "event" listener bound to `event_name`
/// (or its module-namespaced form, see `EventProxy::module_id`), run it (through
/// the same path a chat trigger would) and send its replies. Spawned rather than
/// awaited so the emitting script never blocks on this; `chain` carries forward
/// so a nested emit from the listener's own script can be checked for cycles.
fn dispatch_listener_command(app_handle: AppHandle, module_id: Option<String>, event_name: String, payload_str: String, chain: Vec<String>) {
    tauri::async_runtime::spawn(async move {
        dispatch_listener_command_inner(app_handle, module_id, &event_name, &payload_str, chain).await;
    });
}

async fn dispatch_listener_command_inner(app_handle: AppHandle, module_id: Option<String>, event_name: &str, payload_str: &str, chain: Vec<String>) {
    use tauri::Manager;

    let (Some(cache), Some(queue), Some(config), Some(modules), Some(bot)) = (
        app_handle.try_state::<Arc<CommandCache>>(),
        app_handle.try_state::<Arc<QueueState>>(),
        app_handle.try_state::<Arc<RwLock<AppConfig>>>(),
        app_handle.try_state::<Arc<ModuleState>>(),
        app_handle.try_state::<Arc<BotState>>(),
    ) else { return; };

    // Prefer a module-namespaced match (author-slug.module_id.event) over the
    // raw name, so two modules using the same short event name can't collide —
    // but still fall back to the raw name so non-module commands (and modules
    // that just emit already-unique names) work without namespacing at all.
    let namespaced = if let Some(mid) = &module_id {
        modules.get_module(mid).await.map(|m| format!("{}.{}.{}", slugify(&m.author), mid, event_name))
    } else {
        None
    };

    let (matched_name, command) = if let Some(ns) = namespaced.as_deref() {
        if let Some(c) = cache.find_by_listener("event", ns).await {
            (ns.to_string(), Some(c))
        } else {
            (event_name.to_string(), cache.find_by_listener("event", event_name).await)
        }
    } else {
        (event_name.to_string(), cache.find_by_listener("event", event_name).await)
    };

    let Some(command) = command else {
        if let Some(ns) = &namespaced {
            dev_log(&app_handle, format!("event '{event_name}' (aka '{ns}') emitted — no command listening"));
        } else {
            dev_log(&app_handle, format!("event '{event_name}' emitted — no command listening"));
        }
        return;
    };

    // Nothing to send replies through (and no `twitch` proxy for the script)
    // if the bot isn't connected — the command just doesn't run in that case,
    // same as a chat trigger would have nowhere to fire from either.
    let Some(client) = bot.client.read().await.clone() else {
        dev_log(&app_handle, format!("event '{matched_name}' matched command '{}' but the bot isn't connected — skipped", command.trigger));
        return;
    };
    let youtube = bot.youtube_client.read().await.clone();

    dev_log(&app_handle, format!("event '{matched_name}' → intercepted by command '{}' (#{})", command.trigger, command.id));

    let synthetic_msg = ChatMessage {
        platform:       "twitch".to_string(),
        username:       "system".to_string(),
        text:           String::new(),
        is_subscriber:  false,
        is_mod:         false,
        is_broadcaster: true,
    };

    let replies = execute_command(
        &command, &synthetic_msg, payload_str, "",
        queue.inner(), config.inner(), &client, &youtube, &app_handle, modules.inner(), &chain,
        None, None,
    ).await;
    send_replies("twitch", replies, &client, &youtube).await;
}
