use tauri::Manager;

fn config_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_config_dir()
        .map_err(|e| format!("Cannot resolve config dir: {e}"))
}

#[tauri::command]
pub async fn read_app_config(
    filename: String,
    app: tauri::AppHandle,
) -> Result<Option<String>, String> {
    let path = config_dir(&app)?.join(&filename);
    if !path.exists() {
        return Ok(None);
    }
    std::fs::read_to_string(&path)
        .map(Some)
        .map_err(|e| format!("Cannot read {filename}: {e}"))
}

#[tauri::command]
pub async fn write_app_config(
    filename: String,
    content: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let dir = config_dir(&app)?;
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Cannot create config dir: {e}"))?;
    std::fs::write(dir.join(&filename), content)
        .map_err(|e| format!("Cannot write {filename}: {e}"))
}
