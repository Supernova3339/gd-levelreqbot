use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, FilePath};
use tokio::sync::oneshot;

#[tauri::command]
pub async fn save_script_file(app: AppHandle, content: String, filename: String) -> Result<bool, String> {
    let (tx, rx) = oneshot::channel::<bool>();
    let content  = content.clone();

    app.dialog()
        .file()
        .set_file_name(&filename)
        .add_filter("GDLQScript", &["gdlqs", "txt"])
        .save_file(move |path| {
            let saved = match path {
                Some(FilePath::Path(p)) => std::fs::write(p, &content).is_ok(),
                _ => false,
            };
            let _ = tx.send(saved);
        });

    rx.await.map_err(|_| "Dialog was closed unexpectedly".to_string())
}

/// Save a Rhai library file with a native save-as dialog.
#[tauri::command]
pub async fn save_library_file(app: AppHandle, content: String, filename: String) -> Result<bool, String> {
    let (tx, rx) = oneshot::channel::<bool>();

    app.dialog()
        .file()
        .set_file_name(&filename)
        .add_filter("Rhai Library", &["rhai"])
        .save_file(move |path| {
            let saved = match path {
                Some(FilePath::Path(p)) => std::fs::write(p, &content).is_ok(),
                _ => false,
            };
            let _ = tx.send(saved);
        });

    rx.await.map_err(|_| "Dialog was closed unexpectedly".to_string())
}

#[tauri::command]
pub async fn load_script_file(app: AppHandle) -> Result<Option<String>, String> {
    let (tx, rx) = oneshot::channel::<Option<String>>();

    app.dialog()
        .file()
        .add_filter("GDLQScript", &["gdlqs", "txt"])
        .pick_file(move |path| {
            let content = match path {
                Some(FilePath::Path(p)) => std::fs::read_to_string(p).ok(),
                _ => None,
            };
            let _ = tx.send(content);
        });

    rx.await.map_err(|_| "Dialog was closed unexpectedly".to_string())
}
