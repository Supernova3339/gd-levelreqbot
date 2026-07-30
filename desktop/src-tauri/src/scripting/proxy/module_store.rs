// module_store.rs — Namespaced KV + collection storage per module.
// Exposed to Rhai scripts as `ms` when running a module's scripts.
//
// KV keys are stored as `module:{id}:kv:{key}` in kv_store.
// Collections are stored in user_data with collection name `module:{id}:{name}`.

use crate::queue::QueueState;
use rhai::{Dynamic, Engine, Map};
use std::sync::Arc;
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

async fn kv_delete(queue: &Arc<QueueState>, key: &str) {
    let pool = queue.db.read().await;
    let _ = sqlx::query("DELETE FROM kv_store WHERE key = ?")
        .bind(key).execute(&*pool).await;
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
}

impl ModuleStoreProxy {
    pub fn new(module_id: impl Into<String>, queue: Arc<QueueState>) -> Self {
        Self { module_id: module_id.into(), queue }
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
