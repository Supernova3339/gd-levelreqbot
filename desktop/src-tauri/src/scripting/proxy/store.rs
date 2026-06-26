// store proxy — exposes persistent key-value storage as a Rhai object.
// In scripts: store.get("key"), store.set("key", value), store.incr("key")

use crate::queue::QueueState;
use rhai::{Dynamic, Engine};
use std::sync::Arc;

use super::queue::block_on;

#[derive(Clone)]
pub struct StoreProxy {
    pub queue: Arc<QueueState>,
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

async fn kv_delete(queue: &Arc<QueueState>, key: &str) {
    let pool = queue.db.read().await;
    let _ = sqlx::query("DELETE FROM kv_store WHERE key = ?")
        .bind(key).execute(&*pool).await;
}

pub fn register(engine: &mut Engine) {
    engine.register_type_with_name::<StoreProxy>("Store");

    engine.register_fn("get", |s: &mut StoreProxy, key: &str| -> Dynamic {
        match block_on(kv_get(&s.queue, key)) {
            Some(v) => {
                // Try to parse back as the original type
                if let Ok(n) = v.parse::<i64>()   { return Dynamic::from(n); }
                if let Ok(f) = v.parse::<f64>()   { return Dynamic::from(f); }
                if v == "true"  { return Dynamic::from(true); }
                if v == "false" { return Dynamic::from(false); }
                Dynamic::from(v)
            }
            None => Dynamic::UNIT,
        }
    });

    engine.register_fn("set", |s: &mut StoreProxy, key: &str, value: &str| {
        block_on(kv_set(&s.queue, key, value));
    });

    engine.register_fn("set", |s: &mut StoreProxy, key: &str, value: i64| {
        block_on(kv_set(&s.queue, key, &value.to_string()));
    });

    engine.register_fn("set", |s: &mut StoreProxy, key: &str, value: bool| {
        block_on(kv_set(&s.queue, key, &value.to_string()));
    });

    engine.register_fn("delete", |s: &mut StoreProxy, key: &str| {
        block_on(kv_delete(&s.queue, key));
    });

    engine.register_fn("incr", |s: &mut StoreProxy, key: &str| -> i64 {
        let cur = block_on(kv_get(&s.queue, key))
            .and_then(|v| v.parse::<i64>().ok())
            .unwrap_or(0);
        let next = cur + 1;
        block_on(kv_set(&s.queue, key, &next.to_string()));
        next
    });

    engine.register_fn("incr_by", |s: &mut StoreProxy, key: &str, n: i64| -> i64 {
        let cur = block_on(kv_get(&s.queue, key))
            .and_then(|v| v.parse::<i64>().ok())
            .unwrap_or(0);
        let next = cur + n;
        block_on(kv_set(&s.queue, key, &next.to_string()));
        next
    });

    engine.register_fn("get_or", |s: &mut StoreProxy, key: &str, default: &str| -> String {
        block_on(kv_get(&s.queue, key)).unwrap_or_else(|| default.to_string())
    });

    engine.register_fn("has", |s: &mut StoreProxy, key: &str| -> bool {
        block_on(kv_get(&s.queue, key)).is_some()
    });

    engine.register_fn("decr", |s: &mut StoreProxy, key: &str| -> i64 {
        let cur = block_on(kv_get(&s.queue, key))
            .and_then(|v| v.parse::<i64>().ok())
            .unwrap_or(0);
        let next = cur - 1;
        block_on(kv_set(&s.queue, key, &next.to_string()));
        next
    });

    engine.register_fn("decr_by", |s: &mut StoreProxy, key: &str, n: i64| -> i64 {
        let cur = block_on(kv_get(&s.queue, key))
            .and_then(|v| v.parse::<i64>().ok())
            .unwrap_or(0);
        let next = cur - n;
        block_on(kv_set(&s.queue, key, &next.to_string()));
        next
    });

    engine.register_fn("list_keys", |s: &mut StoreProxy, prefix: &str| -> Vec<rhai::Dynamic> {
        let prefix = format!("{prefix}%");
        block_on(async move {
            let pool = s.queue.db.read().await;
            let keys: Vec<String> = sqlx::query_scalar(
                "SELECT key FROM kv_store WHERE key LIKE ? ORDER BY key"
            )
            .bind(&prefix)
            .fetch_all(&*pool)
            .await
            .unwrap_or_default();
            keys.into_iter().map(rhai::Dynamic::from).collect()
        })
    });
}
