use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScriptTemplate {
    pub id:          String,
    pub name:        String,
    pub description: String,
    pub script:      String,
    pub author:      Option<String>,
    pub pack:        Option<String>,
}

fn templates_path(app: &AppHandle) -> PathBuf {
    let dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    dir.join("user_templates.json")
}

#[tauri::command]
pub async fn load_user_templates(app: AppHandle) -> Result<Vec<ScriptTemplate>, String> {
    let path = templates_path(&app);
    if !path.exists() { return Ok(vec![]); }
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_user_templates(app: AppHandle, templates: Vec<ScriptTemplate>) -> Result<(), String> {
    let path = templates_path(&app);
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string_pretty(&templates).map_err(|e| e.to_string())?;
    std::fs::write(&path, content).map_err(|e| e.to_string())
}
