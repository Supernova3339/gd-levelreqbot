use crate::queue::QueueState;
use rhai::{Dynamic, Engine, Map};
use std::sync::Arc;
use uuid::Uuid;

use super::queue::block_on;

fn row_to_map(doc_id: String, data_json: String) -> Dynamic {
    let parsed: serde_json::Value =
        serde_json::from_str(&data_json).unwrap_or(serde_json::Value::Object(Default::default()));
    let mut m = Map::new();
    m.insert("_id".into(), Dynamic::from(doc_id));
    if let serde_json::Value::Object(obj) = parsed {
        for (k, v) in obj {
            let dyn_val = json_to_dynamic(v);
            m.insert(k.into(), dyn_val);
        }
    }
    Dynamic::from_map(m)
}

fn json_to_dynamic(v: serde_json::Value) -> Dynamic {
    match v {
        serde_json::Value::Null        => Dynamic::UNIT,
        serde_json::Value::Bool(b)     => Dynamic::from(b),
        serde_json::Value::Number(n)   => {
            if let Some(i) = n.as_i64() { Dynamic::from(i) }
            else { Dynamic::from(n.as_f64().unwrap_or(0.0)) }
        }
        serde_json::Value::String(s)   => Dynamic::from(s),
        serde_json::Value::Array(arr)  =>
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
        obj.insert(k.to_string(), dynamic_to_json(v));
    }
    serde_json::to_string(&obj).unwrap_or_else(|_| "{}".into())
}

async fn data_insert(queue: &Arc<QueueState>, col: &str, data: &str) -> String {
    let id = Uuid::new_v4().to_string();
    let pool = queue.db.read().await;
    let _ = sqlx::query(
        "INSERT INTO user_data (collection, doc_id, data) VALUES (?, ?, ?)"
    )
    .bind(col).bind(&id).bind(data)
    .execute(&*pool).await;
    id
}

async fn data_find(queue: &Arc<QueueState>, col: &str, limit: i64) -> Vec<(String, String)> {
    let pool = queue.db.read().await;
    sqlx::query_as::<_, (String, String)>(
        "SELECT doc_id, data FROM user_data WHERE collection = ? ORDER BY id ASC LIMIT ?"
    )
    .bind(col).bind(limit)
    .fetch_all(&*pool).await.unwrap_or_default()
}

async fn data_find_one(queue: &Arc<QueueState>, doc_id: &str) -> Option<(String, String)> {
    let pool = queue.db.read().await;
    sqlx::query_as::<_, (String, String)>(
        "SELECT doc_id, data FROM user_data WHERE doc_id = ?"
    )
    .bind(doc_id)
    .fetch_optional(&*pool).await.unwrap_or(None)
}

async fn data_count(queue: &Arc<QueueState>, col: &str) -> i64 {
    let pool = queue.db.read().await;
    sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM user_data WHERE collection = ?")
        .bind(col).fetch_one(&*pool).await.unwrap_or(0)
}

async fn data_delete(queue: &Arc<QueueState>, doc_id: &str) {
    let pool = queue.db.read().await;
    let _ = sqlx::query("DELETE FROM user_data WHERE doc_id = ?")
        .bind(doc_id).execute(&*pool).await;
}

async fn data_clear(queue: &Arc<QueueState>, col: &str) {
    let pool = queue.db.read().await;
    let _ = sqlx::query("DELETE FROM user_data WHERE collection = ?")
        .bind(col).execute(&*pool).await;
}

#[derive(Clone)]
pub struct DataProxy {
    pub queue: Arc<QueueState>,
}

pub fn register(engine: &mut Engine) {
    engine.register_type_with_name::<DataProxy>("Data");

    engine.register_fn("insert", |d: &mut DataProxy, col: &str, data: rhai::Map| -> String {
        block_on(data_insert(&d.queue, col, &map_to_json_string(&data)))
    });
    engine.register_fn("find", |d: &mut DataProxy, col: &str, limit: i64| -> Vec<Dynamic> {
        block_on(data_find(&d.queue, col, limit)).into_iter().map(|(id, j)| row_to_map(id, j)).collect()
    });
    engine.register_fn("find_one", |d: &mut DataProxy, doc_id: &str| -> Dynamic {
        match block_on(data_find_one(&d.queue, doc_id)) {
            Some((id, j)) => row_to_map(id, j),
            None => Dynamic::UNIT,
        }
    });
    engine.register_fn("find_all", |d: &mut DataProxy, col: &str| -> Vec<Dynamic> {
        block_on(data_find(&d.queue, col, i64::MAX)).into_iter().map(|(id, j)| row_to_map(id, j)).collect()
    });
    engine.register_fn("count",  |d: &mut DataProxy, col: &str| -> i64 { block_on(data_count(&d.queue, col)) });
    engine.register_fn("delete", |d: &mut DataProxy, doc_id: &str| { block_on(data_delete(&d.queue, doc_id)); });
    engine.register_fn("clear",  |d: &mut DataProxy, col: &str|    { block_on(data_clear(&d.queue, col)); });
}
