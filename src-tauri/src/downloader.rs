//! Beat downloader backed by the open-source yt-dlp binary.
//!
//! The binary is NOT bundled with the app: on first use we fetch the official
//! release into `$APPLOCALDATA/bin` (user-initiated, ~35MB) and run everything
//! locally with our bundled FFmpeg for audio extraction. Metadata (title,
//! uploader, description, chapters) comes from `yt-dlp -J`; the frontend parses
//! key/BPM out of it.

use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use tauri::{AppHandle, Emitter, Manager};

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

fn command(bin: &PathBuf) -> Command {
    let cmd = Command::new(bin);
    #[cfg(windows)]
    let cmd = {
        let mut c = cmd;
        c.creation_flags(CREATE_NO_WINDOW);
        c
    };
    cmd
}

fn ytdlp_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("no app data dir: {e}"))?
        .join("bin");
    std::fs::create_dir_all(&dir).map_err(|e| format!("cannot create bin dir: {e}"))?;
    Ok(dir.join(if cfg!(windows) { "yt-dlp.exe" } else { "yt-dlp" }))
}

/// Directory holding the bundled ffmpeg sidecar (next to the app executable).
fn ffmpeg_dir() -> Result<PathBuf, String> {
    std::env::current_exe()
        .map_err(|e| format!("cannot locate app executable: {e}"))?
        .parent()
        .map(|p| p.to_path_buf())
        .ok_or_else(|| "app executable has no parent directory".into())
}

#[tauri::command]
pub fn ytdlp_status(app: AppHandle) -> Result<bool, String> {
    Ok(ytdlp_path(&app)?.exists())
}

/// Download the official yt-dlp release binary for this platform (one-time).
#[tauri::command]
pub async fn ytdlp_install(app: AppHandle) -> Result<(), String> {
    let url = if cfg!(target_os = "macos") {
        "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos"
    } else if cfg!(windows) {
        "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
    } else {
        "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux"
    };
    let resp = reqwest::get(url)
        .await
        .map_err(|e| format!("엔진 다운로드 실패: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("엔진 다운로드 실패: HTTP {}", resp.status()));
    }
    let bytes = resp.bytes().await.map_err(|e| format!("엔진 다운로드 실패: {e}"))?;
    let path = ytdlp_path(&app)?;
    std::fs::write(&path, &bytes).map_err(|e| format!("엔진 저장 실패: {e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755))
            .map_err(|e| format!("실행 권한 설정 실패: {e}"))?;
    }
    log::info!("[dl] yt-dlp installed at {}", path.display());
    Ok(())
}

/// `yt-dlp -J` → slimmed metadata JSON for the frontend.
#[tauri::command]
pub async fn ytdlp_meta(app: AppHandle, url: String) -> Result<serde_json::Value, String> {
    let bin = ytdlp_path(&app)?;
    if !bin.exists() {
        return Err("engine-missing".into());
    }
    let output = tauri::async_runtime::spawn_blocking(move || {
        command(&bin)
            .args(["-J", "--no-playlist", "--no-warnings", &url])
            .stdin(Stdio::null())
            .output()
    })
    .await
    .map_err(|e| format!("meta task failed: {e}"))?
    .map_err(|e| format!("yt-dlp start failed: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let tail: Vec<&str> = stderr.lines().rev().take(4).collect();
        return Err(tail.into_iter().rev().collect::<Vec<_>>().join("\n"));
    }
    let v: serde_json::Value =
        serde_json::from_slice(&output.stdout).map_err(|e| format!("meta parse failed: {e}"))?;
    Ok(serde_json::json!({
        "title": v["title"],
        "uploader": v["uploader"],
        "duration": v["duration"],
        "thumbnail": v["thumbnail"],
        "description": v["description"],
        "chapters": v["chapters"],
        "url": v["webpage_url"],
    }))
}

/// Download + extract audio losslessly where possible. Emits `beat-progress`
/// events: { pct: number|null, stage: "downloading"|"converting" }.
#[tauri::command]
pub async fn ytdlp_download(
    app: AppHandle,
    url: String,
    format: String,
    out_dir: String,
    filename: String,
) -> Result<String, String> {
    let bin = ytdlp_path(&app)?;
    if !bin.exists() {
        return Err("engine-missing".into());
    }
    if !matches!(format.as_str(), "wav" | "mp3" | "flac") {
        return Err(format!("unsupported format: {format}"));
    }
    let ff = ffmpeg_dir()?;
    let template = format!("{}/{}.%(ext)s", out_dir.trim_end_matches(['/', '\\']), filename);
    let final_path = format!("{}/{}.{}", out_dir.trim_end_matches(['/', '\\']), filename, format);

    let handle = app.clone();
    let fmt = format.clone();
    let status = tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let mut child = command(&bin)
            .args([
                "-x",
                "--audio-format", &fmt,
                "--audio-quality", "0",
                "--no-playlist",
                "--no-warnings",
                "--newline",
                "--no-mtime",
                "--ffmpeg-location", &ff.to_string_lossy(),
                "-o", &template,
                &url,
            ])
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("yt-dlp start failed: {e}"))?;

        if let Some(out) = child.stdout.take() {
            for line in BufReader::new(out).lines().map_while(Result::ok) {
                if let Some(idx) = line.find('%') {
                    if line.starts_with("[download]") {
                        let head = &line[..idx];
                        if let Some(num) = head.split_whitespace().last() {
                            if let Ok(p) = num.parse::<f64>() {
                                let _ = handle.emit("beat-progress",
                                    serde_json::json!({ "pct": p, "stage": "downloading" }));
                            }
                        }
                    }
                } else if line.starts_with("[ExtractAudio]") {
                    let _ = handle.emit("beat-progress",
                        serde_json::json!({ "pct": null, "stage": "converting" }));
                }
            }
        }

        let mut stderr_tail = String::new();
        if let Some(err) = child.stderr.take() {
            let lines: Vec<String> = BufReader::new(err).lines().map_while(Result::ok).collect();
            let n = lines.len();
            stderr_tail = lines[n.saturating_sub(4)..].join("\n");
        }
        let status = child.wait().map_err(|e| format!("yt-dlp wait failed: {e}"))?;
        if status.success() { Ok(()) } else {
            Err(if stderr_tail.is_empty() {
                format!("yt-dlp exited with {:?}", status.code())
            } else { stderr_tail })
        }
    })
    .await
    .map_err(|e| format!("download task failed: {e}"))?;

    status?;
    if !std::path::Path::new(&final_path).exists() {
        return Err("다운로드는 끝났지만 결과 파일을 찾지 못했습니다".into());
    }
    log::info!("[dl] saved -> {final_path}");
    Ok(final_path)
}
