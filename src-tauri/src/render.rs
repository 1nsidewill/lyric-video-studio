//! Local video rendering via the bundled FFmpeg sidecar.
//!
//! Two paths mirror the original server logic:
//!   * `mux_h264`      — WebCodecs GPU path: the webview GPU-encodes H.264 (Annex B);
//!                       we only mux it with the audio (`-c:v copy`, ~zero CPU).
//!   * `encode_frames` — fallback: the webview dumps a JPEG frame sequence; we encode
//!                       it with libx264. Used only when WebCodecs H.264 is unavailable.
//!
//! FFmpeg is invoked with `std::process` (on a blocking task) so completion is detected
//! reliably. It writes to a temp file which the *app* then moves to the user-chosen
//! destination — a child process can lack access to ~/Downloads etc. on macOS, while the
//! app (which showed the save dialog) does not.

use std::path::{Path, PathBuf};

/// Absolute path to the bundled `ffmpeg` sidecar sitting next to the app executable.
/// Tauri's `externalBin` places it there in both dev (`target/debug/ffmpeg`) and the
/// packaged app (`…/Contents/MacOS/ffmpeg`, `…\ffmpeg.exe`).
fn ffmpeg_bin() -> Result<PathBuf, String> {
    let dir = std::env::current_exe()
        .map_err(|e| format!("cannot locate app executable: {e}"))?
        .parent()
        .ok_or_else(|| "app executable has no parent directory".to_string())?
        .to_path_buf();
    let name = if cfg!(windows) { "ffmpeg.exe" } else { "ffmpeg" };
    let path = dir.join(name);
    if path.exists() {
        Ok(path)
    } else {
        Err(format!("bundled FFmpeg not found at {}", path.display()))
    }
}

/// A unique temp path for FFmpeg's output. FFmpeg (a child process) can be denied
/// access to user locations like ~/Downloads on macOS; $TMPDIR is always writable.
fn temp_output_path() -> PathBuf {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    std::env::temp_dir().join(format!("lvs-out-{}-{}.mp4", std::process::id(), nanos))
}

/// Move FFmpeg's temp output to the user-chosen destination. The *app* process — not
/// the FFmpeg child — holds the save-dialog grant for that path, so it can write there.
fn finalize_output(temp: &Path, dest: &str) -> Result<(), String> {
    if std::fs::rename(temp, dest).is_ok() {
        log::info!("[render] done -> {dest}");
        return Ok(());
    }
    // Cross-volume (e.g. $TMPDIR on a different mount): fall back to copy + remove.
    let copied = std::fs::copy(temp, dest);
    let _ = std::fs::remove_file(temp);
    copied.map_err(|e| format!("렌더는 됐지만 저장 위치에 쓰지 못했습니다 ('{dest}'): {e}"))?;
    log::info!("[render] done -> {dest}");
    Ok(())
}

/// Run the bundled FFmpeg to completion on a blocking task. Returns the stderr tail on
/// a non-zero exit. Uses `std::process` (not the shell plugin's event stream) so the
/// call always resolves when the process exits.
async fn run_ffmpeg(args: Vec<String>, stage: &str) -> Result<(), String> {
    let bin = ffmpeg_bin()?;
    log::info!("[render] {stage}: {} {}", bin.display(), args.join(" "));

    let output = tauri::async_runtime::spawn_blocking(move || {
        std::process::Command::new(&bin)
            .args(&args)
            .stdin(std::process::Stdio::null()) // never block reading stdin
            .stdout(std::process::Stdio::null())
            .output()
    })
    .await
    .map_err(|e| format!("failed to join ffmpeg task: {e}"))?
    .map_err(|e| format!("failed to start ffmpeg: {e}"))?;

    if output.status.success() {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&output.stderr);
    let lines: Vec<&str> = stderr.lines().collect();
    let tail = lines[lines.len().saturating_sub(40)..].join("\n");
    let msg = format!("FFmpeg failed (exit {:?}):\n{tail}", output.status.code());
    log::warn!("[render] {msg}");
    Err(msg)
}

/// WebCodecs path: mux a pre-encoded H.264 Annex B stream with audio into MP4.
/// `-c:v copy` preserves the browser's GPU-encoded bitstream (no re-encode);
/// `-fflags +genpts` regenerates monotonic PTS from `-r fps` (WebCodecs Annex B
/// carries no timing).
#[tauri::command]
pub async fn mux_h264(
    h264_path: String,
    audio_path: String,
    output_path: String,
    fps: u32,
    duration: f64,
) -> Result<(), String> {
    let mut args: Vec<String> = vec![
        "-y".into(),
        "-nostdin".into(),
        "-fflags".into(),
        "+genpts".into(),
        "-f".into(),
        "h264".into(),
        "-r".into(),
        fps.to_string(),
        "-i".into(),
        h264_path,
        "-i".into(),
        audio_path,
        "-map".into(),
        "0:v:0".into(),
        "-map".into(),
        "1:a:0".into(),
        "-c:v".into(),
        "copy".into(),
        "-c:a".into(),
        "aac".into(),
        "-b:a".into(),
        "320k".into(),
        "-ar".into(),
        "48000".into(),
        "-movflags".into(),
        "+faststart".into(),
    ];
    if duration > 0.0 {
        args.push("-t".into());
        args.push(format!("{duration}"));
    }
    let temp = temp_output_path();
    args.push(temp.to_string_lossy().into_owned());

    run_ffmpeg(args, "muxing").await?;
    finalize_output(&temp, &output_path)
}

/// Fallback path: encode a JPEG frame sequence (`f%06d.jpg`) with libx264 and mux audio.
#[tauri::command]
pub async fn encode_frames(
    frames_dir: String,
    pattern: String,
    audio_path: String,
    output_path: String,
    fps: u32,
    duration: f64,
) -> Result<(), String> {
    let input = format!("{}/{}", frames_dir.trim_end_matches(['/', '\\']), pattern);
    let mut args: Vec<String> = vec![
        "-y".into(),
        "-nostdin".into(),
        "-framerate".into(),
        fps.to_string(),
        "-start_number".into(),
        "0".into(),
        "-i".into(),
        input,
        "-i".into(),
        audio_path,
        "-map".into(),
        "0:v:0".into(),
        "-map".into(),
        "1:a:0".into(),
        "-c:v".into(),
        "libx264".into(),
        "-preset".into(),
        "fast".into(),
        "-crf".into(),
        "18".into(),
        "-pix_fmt".into(),
        "yuv420p".into(),
        "-c:a".into(),
        "aac".into(),
        "-b:a".into(),
        "320k".into(),
        "-ar".into(),
        "48000".into(),
        "-movflags".into(),
        "+faststart".into(),
    ];
    if duration > 0.0 {
        args.push("-t".into());
        args.push(format!("{duration}"));
    }
    let temp = temp_output_path();
    args.push(temp.to_string_lossy().into_owned());

    run_ffmpeg(args, "encoding").await?;
    finalize_output(&temp, &output_path)
}
