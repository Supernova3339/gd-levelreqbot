use crate::queue::QueueState;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Library {
    pub id:          i64,
    pub name:        String,
    pub description: String,
    pub code:        String,
    pub is_stdlib:   bool,
    pub enabled:     bool,
}

#[tauri::command]
pub async fn get_libraries(
    queue: State<'_, Arc<QueueState>>,
) -> Result<Vec<Library>, String> {
    let pool = queue.db.read().await;
    sqlx::query_as::<_, Library>(
        "SELECT id, name, description, code,
         (is_stdlib != 0) as is_stdlib, (enabled != 0) as enabled
         FROM libraries ORDER BY is_stdlib DESC, name ASC"
    )
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_library(
    queue:       State<'_, Arc<QueueState>>,
    id:          Option<i64>,
    name:        String,
    description: String,
    code:        String,
    enabled:     bool,
) -> Result<(), String> {
    let pool = queue.db.read().await;
    match id {
        Some(existing_id) => {
            sqlx::query(
                "UPDATE libraries SET name = ?, description = ?, code = ?, enabled = ?
                 WHERE id = ? AND is_stdlib = 0"
            )
            .bind(&name).bind(&description).bind(&code).bind(enabled as i64)
            .bind(existing_id)
            .execute(&*pool).await.map_err(|e| e.to_string())?;
        }
        None => {
            sqlx::query(
                "INSERT INTO libraries (name, description, code, enabled) VALUES (?, ?, ?, ?)"
            )
            .bind(&name).bind(&description).bind(&code).bind(enabled as i64)
            .execute(&*pool).await.map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn delete_library(
    queue: State<'_, Arc<QueueState>>,
    id:    i64,
) -> Result<(), String> {
    let pool = queue.db.read().await;
    let is_stdlib: i64 = sqlx::query_scalar(
        "SELECT is_stdlib FROM libraries WHERE id = ?"
    )
    .bind(id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .unwrap_or(0);

    if is_stdlib != 0 {
        return Err("Cannot delete a built-in stdlib library.".into());
    }

    sqlx::query("DELETE FROM libraries WHERE id = ?")
        .bind(id)
        .execute(&*pool)
        .await
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_library_code(
    queue: State<'_, Arc<QueueState>>,
    id:    i64,
) -> Result<String, String> {
    let pool = queue.db.read().await;
    sqlx::query_scalar::<_, String>("SELECT code FROM libraries WHERE id = ?")
        .bind(id)
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Library {id} not found."))
}
