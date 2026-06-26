use crate::gd::{GDLevel, GDUser};
use tauri::State;

#[tauri::command]
pub async fn search_gd_level(level_id: i64) -> Result<Option<GDLevel>, String> {
    crate::gd::get_level_by_id(level_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn search_gd_levels(query: String, search_type: i32) -> Result<Vec<GDLevel>, String> {
    crate::gd::get_levels(&query, 0, search_type)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_gd_user(account_id: i64) -> Result<Option<GDUser>, String> {
    crate::gd::get_user(account_id)
        .await
        .map_err(|e| e.to_string())
}
