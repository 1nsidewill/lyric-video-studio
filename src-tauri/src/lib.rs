mod downloader;
mod render;
mod sketch;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init());

    // Auto-updater (desktop only): checks the GitHub release feed on launch.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .setup(|app| {
            // Ensure the local project storage directory exists on first launch.
            if let Ok(dir) = app.path().app_local_data_dir() {
                let _ = std::fs::create_dir_all(dir.join("projects"));
            }
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            render::mux_h264,
            render::encode_frames,
            downloader::ytdlp_status,
            downloader::ytdlp_install,
            downloader::ytdlp_meta,
            downloader::ytdlp_download,
            sketch::import_beat
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
