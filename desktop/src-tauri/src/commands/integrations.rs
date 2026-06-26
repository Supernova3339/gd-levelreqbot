use crate::integrations::{resolve, Integration};
use crate::queue::QueueState;
use std::sync::Arc;
use tauri::State;

const SELECT: &str =
    "SELECT id, name, kind, config, description, enabled, cached_value, last_fetched \
     FROM integrations";

#[tauri::command]
pub async fn get_integrations(queue: State<'_, Arc<QueueState>>) -> Result<Vec<Integration>, String> {
    let pool = queue.db.read().await;
    sqlx::query_as::<_, Integration>(&format!("{SELECT} ORDER BY name ASC"))
        .fetch_all(&*pool).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_integration(
    queue: State<'_, Arc<QueueState>>,
    name: String,
    kind: String,
    config: String,
    description: String,
) -> Result<Integration, String> {
    let pool = queue.db.read().await;
    let id = sqlx::query(
        "INSERT INTO integrations (name, kind, config, description) VALUES (?, ?, ?, ?)"
    )
    .bind(&name).bind(&kind).bind(&config).bind(&description)
    .execute(&*pool).await.map_err(|e| e.to_string())?.last_insert_rowid();

    sqlx::query_as::<_, Integration>(&format!("{SELECT} WHERE id = ?"))
        .bind(id).fetch_one(&*pool).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_integration(
    queue: State<'_, Arc<QueueState>>,
    id: i64,
    name: String,
    kind: String,
    config: String,
    description: String,
    enabled: bool,
) -> Result<(), String> {
    let pool = queue.db.read().await;
    sqlx::query(
        "UPDATE integrations SET name=?, kind=?, config=?, description=?, enabled=? WHERE id=?"
    )
    .bind(&name).bind(&kind).bind(&config).bind(&description)
    .bind(enabled as i64).bind(id)
    .execute(&*pool).await.map(|_| ()).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_integration(
    queue: State<'_, Arc<QueueState>>,
    id: i64,
) -> Result<(), String> {
    let pool = queue.db.read().await;
    sqlx::query("DELETE FROM integrations WHERE id = ?")
        .bind(id).execute(&*pool).await.map(|_| ()).map_err(|e| e.to_string())
}

/// Fetch the current value for a single integration (live, not cached).
#[tauri::command]
pub async fn fetch_integration_value(
    queue: State<'_, Arc<QueueState>>,
    id: i64,
) -> Result<String, String> {
    let pool = queue.db.read().await;
    let integ: Integration = sqlx::query_as(&format!("{SELECT} WHERE id = ?"))
        .bind(id).fetch_one(&*pool).await.map_err(|e| e.to_string())?;
    resolve(&integ).await.map_err(|e| e.to_string())
}
