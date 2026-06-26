use crate::queue::QueueState;
use rhai::{Dynamic, Engine};
use std::sync::Arc;
use tracing::error;

use super::queue::block_on;

#[derive(Clone)]
pub struct DbProxy {
    pub queue: Arc<QueueState>,
}

pub fn register(engine: &mut Engine) {
    engine.register_type_with_name::<DbProxy>("Db");

    engine.register_fn("exec", |d: &mut DbProxy, sql: &str| -> i64 {
        let pool = block_on(d.queue.db.read());
        match block_on(sqlx::query(sql).execute(&*pool)) {
            Ok(r)  => r.rows_affected() as i64,
            Err(e) => { error!("db.exec: {e}"); -1 }
        }
    });

    engine.register_fn("last_id", |d: &mut DbProxy| -> i64 {
        let pool = block_on(d.queue.db.read());
        block_on(sqlx::query_scalar::<_, i64>("SELECT last_insert_rowid()").fetch_one(&*pool))
            .unwrap_or(0)
    });

    // Parameterised queries are not supported from Rhai strings for safety.
    // Users should use store.get/set or data.find/insert instead.
    engine.register_fn("query", |_: &mut DbProxy, _sql: &str| -> Vec<Dynamic> {
        error!("db.query: use store.* or data.* instead of raw SQL");
        vec![]
    });
}
