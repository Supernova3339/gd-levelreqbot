// cache proxy — TTL-cached external HTTP fetches for command scripts.
// Replaces the old standalone "Integrations" feature (a settings page CRUD
// table whose output was never actually wired into command execution —
// resolve_all() was dead code with no Rhai proxy calling it). This gives
// streamers the same thing for real: cache.fetch(key, url, ttl_seconds)
// combines `web`'s SSRF-guarded GET with a TTL so a command doesn't hit the
// network on every single invocation.
//
// Backed by the same `kv_store` table `store` already uses (prefixed keys)
// rather than a new table. Same trust tier as `web`/`store` — never given to
// module scripts (see execute.rs) — this was always a streamer-configuration
// capability, not something third-party marketplace code should get.
//
// cache.get(key)                        → last stored value, or () if none
// cache.set(key, value)                 → manually store a value
// cache.fetch(key, url, ttl_seconds)     → cached GET (text)
// cache.fetch_json(key, url, ttl_seconds) → cached GET, JSON-parsed

use rhai::{Dynamic, Engine};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::queue::QueueState;
use super::io::json_to_dynamic;
use super::queue::block_on;
use super::web::fetch_text;

fn value_key(key: &str) -> String { format!("__cache_value:{key}") }
fn fetched_key(key: &str) -> String { format!("__cache_fetched_at:{key}") }

fn now_secs() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs() as i64
}

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

async fn is_fresh(queue: &Arc<QueueState>, key: &str, ttl_seconds: i64) -> bool {
    match kv_get(queue, &fetched_key(key)).await.and_then(|s| s.parse::<i64>().ok()) {
        Some(fetched_at) => now_secs() - fetched_at < ttl_seconds,
        None => false,
    }
}

/// Text fetch shared by `fetch`/`fetch_json`: returns the cached value when
/// fresh, otherwise fetches, stores, and returns the new value.
async fn fetch_cached_text(queue: &Arc<QueueState>, key: &str, url: &str, ttl_seconds: i64) -> Option<String> {
    if is_fresh(queue, key, ttl_seconds).await {
        if let Some(v) = kv_get(queue, &value_key(key)).await {
            return Some(v);
        }
    }
    let text = fetch_text(url).await?;
    kv_set(queue, &value_key(key), &text).await;
    kv_set(queue, &fetched_key(key), &now_secs().to_string()).await;
    Some(text)
}

#[derive(Clone)]
pub struct CacheProxy {
    pub queue: Arc<QueueState>,
}

pub fn register(engine: &mut Engine) {
    engine.register_type_with_name::<CacheProxy>("Cache");

    engine.register_fn("get", |c: &mut CacheProxy, key: &str| -> Dynamic {
        match block_on(kv_get(&c.queue, &value_key(key))) {
            Some(v) => Dynamic::from(v),
            None => Dynamic::UNIT,
        }
    });

    engine.register_fn("set", |c: &mut CacheProxy, key: &str, value: &str| {
        block_on(async {
            kv_set(&c.queue, &value_key(key), value).await;
            kv_set(&c.queue, &fetched_key(key), &now_secs().to_string()).await;
        });
    });

    engine.register_fn("fetch", |c: &mut CacheProxy, key: &str, url: &str, ttl_seconds: i64| -> Dynamic {
        match block_on(fetch_cached_text(&c.queue, key, url, ttl_seconds)) {
            Some(v) => Dynamic::from(v),
            None => Dynamic::UNIT,
        }
    });

    engine.register_fn("fetch_json", |c: &mut CacheProxy, key: &str, url: &str, ttl_seconds: i64| -> Dynamic {
        match block_on(fetch_cached_text(&c.queue, key, url, ttl_seconds)) {
            Some(text) => match serde_json::from_str(&text) {
                Ok(v) => json_to_dynamic(v),
                Err(_) => Dynamic::UNIT,
            },
            None => Dynamic::UNIT,
        }
    });
}
