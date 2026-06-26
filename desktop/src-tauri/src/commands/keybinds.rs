use crate::queue::QueueState;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Keybind {
    pub action:   String,
    pub shortcut: String,
}

#[tauri::command]
pub async fn get_keybinds(queue: State<'_, Arc<QueueState>>) -> Result<Vec<Keybind>, String> {
    let pool = queue.db.read().await;
    sqlx::query_as::<_, Keybind>("SELECT action, shortcut FROM keybinds ORDER BY action")
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_keybind(
    queue: State<'_, Arc<QueueState>>,
    action: String,
    shortcut: String,
) -> Result<(), String> {
    let pool = queue.db.read().await;
    sqlx::query("INSERT INTO keybinds (action, shortcut) VALUES (?, ?) ON CONFLICT(action) DO UPDATE SET shortcut = excluded.shortcut")
        .bind(&action)
        .bind(&shortcut)
        .execute(&*pool)
        .await
        .map(|_| ())
        .map_err(|e| e.to_string())
}
