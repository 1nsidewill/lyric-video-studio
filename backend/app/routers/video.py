import asyncio
import subprocess
import tempfile
from pathlib import Path

from fastapi import APIRouter, HTTPException, BackgroundTasks, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse

from app.config import settings
from app.models.schemas import VideoGenerateRequest, VideoStatus

router = APIRouter(prefix="/api/video", tags=["video"])

_jobs: dict[str, VideoStatus] = {}


@router.post("/generate")
async def generate_video(req: VideoGenerateRequest, bg: BackgroundTasks):
    project_dir = settings.upload_path / req.project_id
    if not project_dir.exists():
        raise HTTPException(404, "Project not found")
    if not (project_dir / "project.json").exists():
        raise HTTPException(400, "Save lyrics timing first")
    return {"status": "use_websocket", "project_id": req.project_id}


@router.websocket("/ws/render/{project_id}")
async def ws_render(websocket: WebSocket, project_id: str):
    await websocket.accept()

    project_dir = settings.upload_path / project_id
    if not project_dir.exists():
        await websocket.send_json({"type": "error", "message": "Project not found"})
        await websocket.close()
        return

    audio_dir = project_dir / "audio"
    audio_file = next(audio_dir.iterdir()) if audio_dir.exists() else None
    if not audio_file:
        await websocket.send_json({"type": "error", "message": "No audio file"})
        await websocket.close()
        return

    config = await websocket.receive_json()
    mode = config.get("mode", "rawvideo")  # "webcodecs" or "rawvideo"
    fps = config.get("fps", 60)
    width = config.get("width", 1920)
    height = config.get("height", 1080)
    total_frames = config.get("total_frames", 0)

    output_dir = settings.output_path
    output_dir.mkdir(parents=True, exist_ok=True)
    output_file = output_dir / f"{project_id}.mp4"

    if mode == "webcodecs":
        # WebCodecs sends pre-encoded H.264 Annex B stream
        # FFmpeg only needs to mux into MP4 — NO re-encoding of video, ultra-fast
        ffmpeg_cmd = [
            "ffmpeg", "-y",
            "-f", "h264",
            "-framerate", str(fps),
            "-i", "pipe:0",
            "-i", str(audio_file),
            "-map", "0:v:0", "-map", "1:a:0",
            "-c:v", "copy",  # just package H.264 stream, no re-encoding
            "-c:a", "aac", "-b:a", "320k", "-ar", "48000",
            "-shortest",
            str(output_file),
        ]
    else:
        # Fallback: raw RGBA → encode with libx264
        ffmpeg_cmd = [
            "ffmpeg", "-y",
            "-f", "rawvideo",
            "-vcodec", "rawvideo",
            "-s", f"{width}x{height}",
            "-pix_fmt", "rgba",
            "-r", str(fps),
            "-i", "pipe:0",
            "-i", str(audio_file),
            "-map", "0:v:0", "-map", "1:a:0",
            "-c:v", "libx264", "-preset", "fast", "-crf", "18",
            "-c:a", "aac", "-b:a", "320k", "-ar", "48000",
            "-pix_fmt", "yuv420p", "-shortest",
            str(output_file),
        ]

    loop = asyncio.get_event_loop()
    proc = await loop.run_in_executor(
        None,
        lambda: subprocess.Popen(
            ffmpeg_cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        ),
    )

    await websocket.send_json({"type": "ready"})

    frames_received = 0
    bytes_per_frame = width * height * 4  # only used for rawvideo mode progress
    chunks_received = 0
    try:
        while True:
            data = await websocket.receive_bytes()
            if data == b"END":
                break
            await loop.run_in_executor(None, proc.stdin.write, data)
            if mode == "webcodecs":
                chunks_received += 1
                if chunks_received % 120 == 0:
                    # Approximate progress via chunk count (each keyframe interval ~2s)
                    await websocket.send_json({"type": "progress", "progress": min(0.9, chunks_received / max(1, total_frames))})
            else:
                frames_received += len(data) // bytes_per_frame
                if frames_received % 30 == 0:
                    progress = min(0.9, frames_received / max(1, total_frames))
                    await websocket.send_json({"type": "progress", "progress": progress})
    except WebSocketDisconnect:
        proc.stdin.close()
        proc.kill()
        return
    except Exception:
        proc.stdin.close()
        proc.kill()
        return

    try:
        proc.stdin.close()
    except BrokenPipeError:
        pass

    stderr_out = await asyncio.get_event_loop().run_in_executor(None, lambda: proc.stderr.read().decode())
    await asyncio.get_event_loop().run_in_executor(None, proc.wait)

    if proc.returncode != 0:
        await websocket.send_json({"type": "error", "message": f"FFmpeg failed: {stderr_out[-500:]}"})
        await websocket.close()
        return

    _jobs[project_id] = VideoStatus(
        project_id=project_id, status="done", progress=1.0, output_filename=output_file.name,
    )
    await websocket.send_json({"type": "done", "progress": 1.0})
    await websocket.close()


@router.get("/status/{project_id}")
async def video_status(project_id: str):
    job = _jobs.get(project_id)
    if not job:
        output = settings.output_path / f"{project_id}.mp4"
        if output.exists():
            return VideoStatus(
                project_id=project_id, status="done",
                progress=1.0, output_filename=output.name,
            )
        raise HTTPException(404, "No generation job found")
    return job


@router.get("/download/{project_id}")
async def download_video(project_id: str):
    output = settings.output_path / f"{project_id}.mp4"
    if not output.exists():
        raise HTTPException(404, "Video not ready")
    return FileResponse(
        output,
        media_type="video/mp4",
        filename=f"lyric_video_{project_id}.mp4",
    )
