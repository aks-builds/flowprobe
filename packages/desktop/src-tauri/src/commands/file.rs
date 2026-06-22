#[tauri::command]
pub async fn open_collection_dialog(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let path = app
        .dialog()
        .file()
        .add_filter("FlowProbe Collection", &["flowprobe.json", "json"])
        .blocking_pick_file();

    match path {
        Some(p) => {
            let path_buf = p.into_path().map_err(|e| format!("Cannot resolve path: {e}"))?;
            let content = std::fs::read_to_string(&path_buf)
                .map_err(|e| format!("Cannot read file {}: {e}", path_buf.display()))?;
            Ok(Some(content))
        }
        None => Ok(None), // user cancelled
    }
}
