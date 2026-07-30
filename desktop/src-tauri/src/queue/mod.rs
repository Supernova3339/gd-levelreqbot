pub mod db;

use sqlx::SqlitePool;
use std::sync::Arc;
use tokio::sync::RwLock;

/// Shared database handle passed through the app as `Arc<QueueState>`.
/// All actual queue data now lives in the `user_data` / `kv_store` tables
/// via the module store (see scripting/proxy/module_store.rs).
pub struct QueueState {
    pub db: Arc<RwLock<SqlitePool>>,
}

impl Clone for QueueState {
    fn clone(&self) -> Self {
        Self { db: Arc::clone(&self.db) }
    }
}

impl QueueState {
    pub fn new(pool: SqlitePool) -> Self {
        Self { db: Arc::new(RwLock::new(pool)) }
    }
}
