// module_store.rs — Namespaced KV + collection storage per module.
// Exposed to Rhai scripts as `ms` when running a module's scripts.
//
// KV keys are stored as `module:{id}:kv:{key}` in kv_store.
// Collections are stored in user_data with collection name `module:{id}:{name}`.

use crate::bot::platform::ChatPlatform;
use crate::queue::QueueState;
use rhai::{Dynamic, Engine, Map};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Manager};
use tracing::warn;
use uuid::Uuid;

use super::queue::block_on;

// ── JSON helpers (mirrors data.rs) ───────────────────────────────────────────

fn row_to_map(doc_id: String, data_json: String) -> Dynamic {
    let parsed: serde_json::Value = serde_json::from_str(&data_json)
        .unwrap_or(serde_json::Value::Object(Default::default()));
    let mut m = Map::new();
    if let serde_json::Value::Object(obj) = parsed {
        for (k, v) in obj {
            if k == "_id" { continue; } // _id is always the DB doc_id, never from stored data
            m.insert(k.into(), json_to_dynamic(v));
        }
    }
    m.insert("_id".into(), Dynamic::from(doc_id)); // set last so it's always authoritative
    Dynamic::from_map(m)
}

pub fn json_to_dynamic(v: serde_json::Value) -> Dynamic {
    match v {
        serde_json::Value::Null       => Dynamic::UNIT,
        serde_json::Value::Bool(b)    => Dynamic::from(b),
        serde_json::Value::Number(n)  => {
            if let Some(i) = n.as_i64() { Dynamic::from(i) }
            else { Dynamic::from(n.as_f64().unwrap_or(0.0)) }
        }
        serde_json::Value::String(s)  => Dynamic::from(s),
        serde_json::Value::Array(arr) =>
            Dynamic::from_array(arr.into_iter().map(json_to_dynamic).collect()),
        serde_json::Value::Object(obj) => {
            let mut m = Map::new();
            for (k, v) in obj { m.insert(k.into(), json_to_dynamic(v)); }
            Dynamic::from_map(m)
        }
    }
}

fn dynamic_to_json(d: &Dynamic) -> serde_json::Value {
    if d.is::<bool>()   { return serde_json::Value::Bool(d.clone().cast::<bool>()); }
    if d.is::<i64>()    { return serde_json::json!(d.clone().cast::<i64>()); }
    if d.is::<f64>()    { return serde_json::json!(d.clone().cast::<f64>()); }
    if d.is::<String>() { return serde_json::Value::String(d.clone().cast::<String>()); }
    serde_json::Value::Null
}

fn map_to_json_string(m: &Map) -> String {
    let mut obj = serde_json::Map::new();
    for (k, v) in m {
        if k.as_str() == "_id" { continue; } // _id is the DB doc_id, not stored in data
        obj.insert(k.to_string(), dynamic_to_json(v));
    }
    serde_json::to_string(&obj).unwrap_or_else(|_| "{}".into())
}

// ── KV async helpers ──────────────────────────────────────────────────────────

async fn kv_get(queue: &Arc<QueueState>, key: &str) -> Option<String> {
    let pool = queue.db.read().await;
    sqlx::query_scalar::<_, String>("SELECT value FROM kv_store WHERE key = ?")
        .bind(key).fetch_optional(&*pool).await.unwrap_or(None)
}

async fn kv_set(queue: &Arc<QueueState>, key: &str, value: &str) {
    let pool = queue.db.read().await;
    let _ = sqlx::query(
        "INSERT INTO kv_store (key, value, updated_at) VALUES (?, ?, unixepoch())
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()"
    ).bind(key).bind(value).execute(&*pool).await;
}

/// Write a module-namespaced kv value from OUTSIDE a script's own `ms` scope —
/// e.g. a background task (chat.poll()'s fallback/native poll runner) that
/// needs to report a result back into the module store after the script
/// that started it has already returned, with no Rhai scope left to call
/// `ms.set` through. Uses the exact same key format `ms.set` does, so a
/// script can read it back with a plain `ms.get(key)`.
pub async fn set_module_kv(queue: &Arc<QueueState>, module_id: &str, key: &str, value: &str) {
    let full_key = format!("module:{module_id}:kv:{key}");
    kv_set(queue, &full_key, value).await;
}

/// Builds the full URL a streamer pastes into OBS/a browser for one of their
/// own module's declared overlay pages — `http://localhost:24363/marketplace/
/// {author-slug}.{module_id}/overlays/{file}?wsPort=...[&wsToken=...]`. Looks
/// up the module's own manifest (for the overlay's `file`) and the current
/// WebSocket config (for the query params an overlay page needs to connect
/// live) — nothing here is hardcoded per-module; any module with a declared
/// `overlays` entry can call `ms.overlay_url(id)` for its own settings page.
async fn overlay_url_for(queue: &Arc<QueueState>, module_id: &str, overlay_id: &str) -> Option<String> {
    let pool = queue.db.read().await;
    // The `modules.author` DB column is install-mechanism bookkeeping — it's
    // literally the string "local" for a dev-watched/local install,
    // regardless of who the module actually says it's by. The real author
    // is always manifest.json's own "author" field, which is what the
    // namespaced URL needs to match event.emit's module-namespacing.
    let manifest_json: String = sqlx::query_scalar(
        "SELECT manifest FROM modules WHERE id = ?"
    ).bind(module_id).fetch_optional(&*pool).await.ok()??;

    let manifest: serde_json::Value = serde_json::from_str(&manifest_json).ok()?;
    let author = manifest["author"].as_str()?;
    let file = manifest["overlays"].as_array()?
        .iter()
        .find(|o| o["id"].as_str() == Some(overlay_id))?["file"]
        .as_str()?
        .trim_start_matches("overlay/")
        .trim_start_matches("overlays/")
        .to_string();

    let (ws_port, ws_secret): (i64, String) = sqlx::query_as(
        "SELECT ws_port, ws_secret FROM config WHERE id = 1"
    ).fetch_optional(&*pool).await.ok()??;

    let namespaced = format!("{}.{}", crate::modules::slugify(author), module_id);
    let mut url = format!("http://localhost:24363/marketplace/{namespaced}/overlays/{file}?wsPort={ws_port}");
    if !ws_secret.is_empty() {
        url.push_str(&format!("&wsToken={ws_secret}"));
    }
    Some(url)
}

/// Builds a stable URL for a file under a module's own `resources/` folder —
/// `http://localhost:24363/marketplace/{author-slug}.{module_id}/resources/{path}`.
/// Unlike overlays, resource files aren't declared in the manifest (there's
/// no user-facing list of them); any relative path under the module's own
/// `resources/` directory is servable. Meant for things like a logo an
/// `<Image srcExpr="ms.resource_url(...)"/>` points at.
async fn resource_url_for(queue: &Arc<QueueState>, module_id: &str, rel_path: &str) -> Option<String> {
    let pool = queue.db.read().await;
    let manifest_json: String = sqlx::query_scalar(
        "SELECT manifest FROM modules WHERE id = ?"
    ).bind(module_id).fetch_optional(&*pool).await.ok()??;
    let manifest: serde_json::Value = serde_json::from_str(&manifest_json).ok()?;
    let author = manifest["author"].as_str()?;
    let namespaced = format!("{}.{}", crate::modules::slugify(author), module_id);
    let clean = rel_path.trim_start_matches("resources/");
    Some(format!("http://localhost:24363/marketplace/{namespaced}/resources/{clean}"))
}

/// Checks a module's own manifest for an opt-in `permissions` entry — see
/// `ModuleManifest::permissions`. Used by execute.rs to decide whether this
/// particular module's scripts get the `web` proxy, which module scripts
/// don't get by default (stock-scripts policy). Fails closed: any lookup or
/// parse failure returns false rather than granting the permission.
pub async fn module_has_permission(queue: &Arc<QueueState>, module_id: &str, perm: &str) -> bool {
    let pool = queue.db.read().await;
    let Ok(Some(manifest_json)) = sqlx::query_scalar::<_, String>(
        "SELECT manifest FROM modules WHERE id = ?"
    ).bind(module_id).fetch_optional(&*pool).await else { return false };

    let Ok(manifest) = serde_json::from_str::<serde_json::Value>(&manifest_json) else { return false };
    manifest["permissions"].as_array()
        .map(|arr| arr.iter().any(|v| v.as_str() == Some(perm)))
        .unwrap_or(false)
}

/// Schedules a one-shot re-invocation of one of THIS module's own scripts
/// after `seconds`, with no args, as a "system" message — for a module that
/// needs to check back on something later without blocking the command that
/// triggered it (Rhai scripts can't sleep mid-execution). Generic platform
/// primitive, not tied to any one module: e.g. polls' StrawPoll provider
/// uses it to fetch final results once a vote window closes, since a
/// module's own web.* calls only ever run within a script invocation, never
/// in a background task the way chat.poll()'s native/fallback paths do.
/// Any chat.say/reply output from the scheduled run is sent to whichever
/// platforms are currently connected. Silently no-ops if the module or
/// script_key no longer exists by the time it fires (module uninstalled/
/// updated in the meantime).
pub fn schedule_after(app_handle: AppHandle, queue: Arc<QueueState>, module_id: String, seconds: i64, script_key: String) {
    let delay = Duration::from_secs(seconds.max(0) as u64);
    tokio::spawn(async move {
        tokio::time::sleep(delay).await;

        let Some(modules) = app_handle.try_state::<Arc<crate::modules::ModuleState>>().map(|s| s.inner().clone()) else { return };
        let Some((script_src, script_rel)) = modules.read_script(&module_id, &script_key).await else {
            warn!("ms.after: module {module_id} has no script '{script_key}' (uninstalled/updated?)");
            return;
        };

        let (twitch, youtube) = match app_handle.try_state::<Arc<crate::bot::BotState>>() {
            Some(bot) => (bot.client.read().await.clone(), bot.youtube_client.read().await.clone()),
            None => (None, None),
        };
        let shell_enabled = {
            let pool = queue.db.read().await;
            crate::scripting::context::read_shell_enabled(&*pool).await
        };
        let msg = crate::bot::ChatMessage {
            text: String::new(),
            username: "system".into(),
            platform: "system".into(),
            is_mod: true,
            is_broadcaster: true,
            is_subscriber: false,
        };
        let ctx = crate::scripting::context::ScriptCtx {
            msg: &msg,
            args: vec![],
            queue: queue.clone(),
            config: None,
            command_name: script_key.clone(),
            command_trigger: String::new(),
            command_counter: 0,
            sub_mode: false,
            viewer_limit: 0,
            sub_limit: 0,
            queue_size: 0,
            platform: "system".into(),
            shell_enabled,
            module_id: Some(module_id.clone()),
            script_file: Some(script_rel),
            twitch: twitch.clone(),
            youtube: youtube.clone(),
            event_chain: vec![],
            redemption_id: None,
            reward_id: None,
        };

        let replies = crate::scripting::execute::run_script(&script_src, &ctx, app_handle.clone()).await;
        for reply in replies {
            if let Some(t) = &twitch { let _ = t.send_message(&reply).await; }
            if let Some(y) = &youtube { let _ = y.send_message(&reply).await; }
        }
    });
}

async fn kv_delete(queue: &Arc<QueueState>, key: &str) {
    let pool = queue.db.read().await;
    let _ = sqlx::query("DELETE FROM kv_store WHERE key = ?")
        .bind(key).execute(&*pool).await;
}

async fn command_trigger_for(queue: &Arc<QueueState>, builtin_key: &str) -> Option<String> {
    let pool = queue.db.read().await;
    sqlx::query_scalar::<_, String>("SELECT trigger FROM bot_commands WHERE builtin_key = ?")
        .bind(builtin_key).fetch_optional(&*pool).await.unwrap_or(None)
}

// ── Collection (user_data) async helpers ──────────────────────────────────────

async fn col_push(queue: &Arc<QueueState>, col: &str, data: &str) -> String {
    let id = Uuid::new_v4().to_string();
    let pool = queue.db.read().await;
    let _ = sqlx::query("INSERT INTO user_data (collection, doc_id, data) VALUES (?, ?, ?)")
        .bind(col).bind(&id).bind(data).execute(&*pool).await;
    id
}

async fn col_find_all(queue: &Arc<QueueState>, col: &str, limit: i64) -> Vec<(String, String)> {
    let pool = queue.db.read().await;
    sqlx::query_as::<_, (String, String)>(
        "SELECT doc_id, data FROM user_data WHERE collection = ? ORDER BY id ASC LIMIT ?"
    )
    .bind(col).bind(limit)
    .fetch_all(&*pool).await.unwrap_or_default()
}

async fn col_count(queue: &Arc<QueueState>, col: &str) -> i64 {
    let pool = queue.db.read().await;
    sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM user_data WHERE collection = ?")
        .bind(col).fetch_one(&*pool).await.unwrap_or(0)
}

async fn col_remove(queue: &Arc<QueueState>, doc_id: &str) {
    let pool = queue.db.read().await;
    let _ = sqlx::query("DELETE FROM user_data WHERE doc_id = ?")
        .bind(doc_id).execute(&*pool).await;
}

async fn col_clear(queue: &Arc<QueueState>, col: &str) {
    let pool = queue.db.read().await;
    let _ = sqlx::query("DELETE FROM user_data WHERE collection = ?")
        .bind(col).execute(&*pool).await;
}

async fn col_at(queue: &Arc<QueueState>, col: &str, index: i64) -> Option<(String, String)> {
    let pool = queue.db.read().await;
    sqlx::query_as::<_, (String, String)>(
        "SELECT doc_id, data FROM user_data WHERE collection = ? ORDER BY id ASC LIMIT 1 OFFSET ?"
    )
    .bind(col).bind(index)
    .fetch_optional(&*pool).await.unwrap_or(None)
}

/// Most recently pushed entry — NOT the same as first(), which is the oldest
/// (collections are insertion-ordered, oldest first, same as all()/find()).
async fn col_last(queue: &Arc<QueueState>, col: &str) -> Option<(String, String)> {
    let pool = queue.db.read().await;
    sqlx::query_as::<_, (String, String)>(
        "SELECT doc_id, data FROM user_data WHERE collection = ? ORDER BY id DESC LIMIT 1"
    )
    .bind(col)
    .fetch_optional(&*pool).await.unwrap_or(None)
}

// ── Proxy types ───────────────────────────────────────────────────────────────

#[derive(Clone)]
pub struct ModuleStoreProxy {
    pub module_id: String,
    pub queue: Arc<QueueState>,
    pub app_handle: AppHandle,
}

impl ModuleStoreProxy {
    pub fn new(module_id: impl Into<String>, queue: Arc<QueueState>, app_handle: AppHandle) -> Self {
        Self { module_id: module_id.into(), queue, app_handle }
    }

    fn kv_key(&self, key: &str) -> String {
        format!("module:{}:kv:{}", self.module_id, key)
    }

    fn col_name(&self, name: &str) -> String {
        format!("module:{}:{}", self.module_id, name)
    }
}

#[derive(Clone)]
pub struct CollectionProxy {
    pub collection: String,
    pub queue: Arc<QueueState>,
}

// ── Rhai registration ─────────────────────────────────────────────────────────

pub fn register(engine: &mut Engine) {
    engine.register_type_with_name::<ModuleStoreProxy>("ModuleStore");
    engine.register_type_with_name::<CollectionProxy>("Collection");

    // ── ModuleStoreProxy — KV ────────────────────────────────────────────────

    engine.register_fn("get", |ms: &mut ModuleStoreProxy, key: &str| -> Dynamic {
        let full_key = ms.kv_key(key);
        let queue = ms.queue.clone();
        match block_on(kv_get(&queue, &full_key)) {
            Some(v) => {
                if let Ok(n) = v.parse::<i64>()  { return Dynamic::from(n); }
                if let Ok(f) = v.parse::<f64>()  { return Dynamic::from(f); }
                if v == "true"  { return Dynamic::from(true); }
                if v == "false" { return Dynamic::from(false); }
                Dynamic::from(v)
            }
            None => Dynamic::UNIT,
        }
    });

    engine.register_fn("set", |ms: &mut ModuleStoreProxy, key: &str, value: &str| {
        let k = ms.kv_key(key);
        let q = ms.queue.clone();
        block_on(kv_set(&q, &k, value));
    });
    engine.register_fn("set", |ms: &mut ModuleStoreProxy, key: &str, value: i64| {
        let k = ms.kv_key(key);
        let q = ms.queue.clone();
        block_on(kv_set(&q, &k, &value.to_string()));
    });
    engine.register_fn("set", |ms: &mut ModuleStoreProxy, key: &str, value: bool| {
        let k = ms.kv_key(key);
        let q = ms.queue.clone();
        block_on(kv_set(&q, &k, &value.to_string()));
    });

    engine.register_fn("has", |ms: &mut ModuleStoreProxy, key: &str| -> bool {
        let k = ms.kv_key(key);
        let q = ms.queue.clone();
        block_on(kv_get(&q, &k)).is_some()
    });

    engine.register_fn("delete", |ms: &mut ModuleStoreProxy, key: &str| {
        let k = ms.kv_key(key);
        let q = ms.queue.clone();
        block_on(kv_delete(&q, &k));
    });

    engine.register_fn("incr", |ms: &mut ModuleStoreProxy, key: &str| -> i64 {
        let k = ms.kv_key(key);
        let q = ms.queue.clone();
        let cur = block_on(kv_get(&q, &k))
            .and_then(|v| v.parse::<i64>().ok()).unwrap_or(0);
        let next = cur + 1;
        block_on(kv_set(&q, &k, &next.to_string()));
        next
    });

    engine.register_fn("incr_by", |ms: &mut ModuleStoreProxy, key: &str, n: i64| -> i64 {
        let k = ms.kv_key(key);
        let q = ms.queue.clone();
        let cur = block_on(kv_get(&q, &k))
            .and_then(|v| v.parse::<i64>().ok()).unwrap_or(0);
        let next = cur + n;
        block_on(kv_set(&q, &k, &next.to_string()));
        next
    });

    engine.register_fn("decr", |ms: &mut ModuleStoreProxy, key: &str| -> i64 {
        let k = ms.kv_key(key);
        let q = ms.queue.clone();
        let cur = block_on(kv_get(&q, &k))
            .and_then(|v| v.parse::<i64>().ok()).unwrap_or(0);
        let next = cur - 1;
        block_on(kv_set(&q, &k, &next.to_string()));
        next
    });

    engine.register_fn("decr_by", |ms: &mut ModuleStoreProxy, key: &str, n: i64| -> i64 {
        let k = ms.kv_key(key);
        let q = ms.queue.clone();
        let cur = block_on(kv_get(&q, &k))
            .and_then(|v| v.parse::<i64>().ok()).unwrap_or(0);
        let next = cur - n;
        block_on(kv_set(&q, &k, &next.to_string()));
        next
    });

    engine.register_fn("get_or", |ms: &mut ModuleStoreProxy, key: &str, default: &str| -> String {
        let k = ms.kv_key(key);
        let q = ms.queue.clone();
        block_on(kv_get(&q, &k)).unwrap_or_else(|| default.to_string())
    });
    engine.register_fn("get_or", |ms: &mut ModuleStoreProxy, key: &str, default: bool| -> bool {
        let k = ms.kv_key(key);
        let q = ms.queue.clone();
        match block_on(kv_get(&q, &k)) {
            Some(v) => match v.as_str() { "true" => true, "false" => false, _ => default },
            None => default,
        }
    });
    engine.register_fn("get_or", |ms: &mut ModuleStoreProxy, key: &str, default: i64| -> i64 {
        let k = ms.kv_key(key);
        let q = ms.queue.clone();
        match block_on(kv_get(&q, &k)) {
            Some(v) => v.parse::<i64>().unwrap_or(default),
            None => default,
        }
    });

    engine.register_fn("list_keys", |ms: &mut ModuleStoreProxy, prefix: &str| -> Vec<Dynamic> {
        let full_prefix = format!("{}%", ms.kv_key(prefix));
        let queue = ms.queue.clone();
        block_on(async move {
            let pool = queue.db.read().await;
            let keys: Vec<String> = sqlx::query_scalar(
                "SELECT key FROM kv_store WHERE key LIKE ? ORDER BY key"
            ).bind(&full_prefix).fetch_all(&*pool).await.unwrap_or_default();
            keys.into_iter().map(Dynamic::from).collect()
        })
    });

    // command_trigger(builtin_key) — the chat trigger CURRENTLY bound to one
    // of this module's commands, e.g. ms.command_trigger("poll") -> "!poll",
    // or whatever the user renamed it to in Settings > Commands. () if no
    // command has that builtin_key. Exists so UI text (empty-state messages,
    // instructions) can reference the real trigger instead of a literal
    // string that goes stale the moment someone renames the command.
    engine.register_fn("command_trigger", |ms: &mut ModuleStoreProxy, builtin_key: &str| -> Dynamic {
        let q = ms.queue.clone();
        match block_on(command_trigger_for(&q, builtin_key)) {
            Some(t) => Dynamic::from(t),
            None => Dynamic::UNIT,
        }
    });

    // overlay_url(overlay_id) — full URL for one of this module's declared
    // `overlays` entries (manifest.json), ready to paste into OBS. () if no
    // overlay with that id exists, or the module isn't installed via the
    // normal path. Show this from the module's OWN settings page — see
    // CREATING_MODULES.md's Overlays section.
    // after(seconds, script_key) — see schedule_after's doc comment.
    engine.register_fn("after", |ms: &mut ModuleStoreProxy, seconds: i64, script_key: &str| {
        schedule_after(ms.app_handle.clone(), ms.queue.clone(), ms.module_id.clone(), seconds, script_key.to_string());
    });

    engine.register_fn("resource_url", |ms: &mut ModuleStoreProxy, rel_path: &str| -> Dynamic {
        let q = ms.queue.clone();
        let mid = ms.module_id.clone();
        let path = rel_path.to_string();
        match block_on(resource_url_for(&q, &mid, &path)) {
            Some(url) => Dynamic::from(url),
            None => Dynamic::UNIT,
        }
    });

    engine.register_fn("overlay_url", |ms: &mut ModuleStoreProxy, overlay_id: &str| -> Dynamic {
        let q = ms.queue.clone();
        let mid = ms.module_id.clone();
        match block_on(overlay_url_for(&q, &mid, overlay_id)) {
            Some(url) => Dynamic::from(url),
            None => Dynamic::UNIT,
        }
    });

    // collection(name) → CollectionProxy
    engine.register_fn("collection", |ms: &mut ModuleStoreProxy, name: &str| -> CollectionProxy {
        CollectionProxy {
            collection: ms.col_name(name),
            queue: ms.queue.clone(),
        }
    });

    // ── CollectionProxy ───────────────────────────────────────────────────────

    engine.register_fn("push", |col: &mut CollectionProxy, data: Map| -> String {
        let c = col.collection.clone();
        let q = col.queue.clone();
        block_on(col_push(&q, &c, &map_to_json_string(&data)))
    });

    engine.register_fn("all", |col: &mut CollectionProxy| -> Vec<Dynamic> {
        let c = col.collection.clone();
        let q = col.queue.clone();
        block_on(col_find_all(&q, &c, i64::MAX))
            .into_iter().map(|(id, j)| row_to_map(id, j)).collect()
    });

    engine.register_fn("find", |col: &mut CollectionProxy, limit: i64| -> Vec<Dynamic> {
        let c = col.collection.clone();
        let q = col.queue.clone();
        block_on(col_find_all(&q, &c, limit))
            .into_iter().map(|(id, j)| row_to_map(id, j)).collect()
    });

    engine.register_fn("first", |col: &mut CollectionProxy| -> Dynamic {
        let c = col.collection.clone();
        let q = col.queue.clone();
        block_on(col_at(&q, &c, 0))
            .map(|(id, j)| row_to_map(id, j))
            .unwrap_or(Dynamic::UNIT)
    });

    engine.register_fn("last", |col: &mut CollectionProxy| -> Dynamic {
        let c = col.collection.clone();
        let q = col.queue.clone();
        block_on(col_last(&q, &c))
            .map(|(id, j)| row_to_map(id, j))
            .unwrap_or(Dynamic::UNIT)
    });

    engine.register_fn("at", |col: &mut CollectionProxy, index: i64| -> Dynamic {
        let c = col.collection.clone();
        let q = col.queue.clone();
        block_on(col_at(&q, &c, index))
            .map(|(id, j)| row_to_map(id, j))
            .unwrap_or(Dynamic::UNIT)
    });

    engine.register_fn("remove", |col: &mut CollectionProxy, doc_id: &str| {
        let q = col.queue.clone();
        block_on(col_remove(&q, doc_id));
    });

    engine.register_fn("clear", |col: &mut CollectionProxy| {
        let c = col.collection.clone();
        let q = col.queue.clone();
        block_on(col_clear(&q, &c));
    });

    engine.register_fn("count", |col: &mut CollectionProxy| -> i64 {
        let c = col.collection.clone();
        let q = col.queue.clone();
        block_on(col_count(&q, &c))
    });
}
