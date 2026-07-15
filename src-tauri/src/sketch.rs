//! Sketch support: copy a beat file (which may live anywhere on disk) into the
//! app's data dir so the webview can read it within its fs/asset scope and the
//! sketch session stays self-contained even if the original file moves.

use tauri::{AppHandle, Manager};

#[tauri::command]
pub async fn import_beat(app: AppHandle, src: String, dest_rel: String) -> Result<(), String> {
    let base = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("no app data dir: {e}"))?;
    let dest = base.join(&dest_rel);
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("cannot create dir: {e}"))?;
    }
    tauri::async_runtime::spawn_blocking(move || {
        std::fs::copy(&src, &dest)
            .map(|_| ())
            .map_err(|e| format!("비트 복사 실패 (copy failed): {e}"))
    })
    .await
    .map_err(|e| format!("task failed: {e}"))?
}
