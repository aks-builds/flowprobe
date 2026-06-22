pub mod commands {
    pub mod broker;
    pub mod file;
    pub mod run;
}

use commands::broker::{connect_broker, disconnect_broker, ping_broker, BrokerRegistry};
use commands::file::open_collection_dialog;
use commands::run::run_collection;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(BrokerRegistry::new())
        .invoke_handler(tauri::generate_handler![
            greet,
            connect_broker,
            disconnect_broker,
            ping_broker,
            run_collection,
            open_collection_dialog,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
