import asyncio
import json
import logging
import subprocess
import time
from pathlib import Path

from app.activity import log_action
from app.database import AsyncSessionLocal

logger = logging.getLogger(__name__)

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from jose import JWTError, jwt
from sqlalchemy import select

from app.config import settings
from app.database import AsyncSessionLocal
from app.deps import get_current_user
from app.models.db_models import User
from app.models.schemas import VideoGenerateRequest, VideoStatus

router = APIRouter(prefix="/api/video", tags=["video"])

_jobs: dict[str, VideoStatus] = {}


async def _get_user_from_token(token: str | None):
    """Return the User object for a valid JWT token, or None."""
    if not token:
        return None
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
        user_id = payload.get("sub")
        if not user_id:
            return None
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(User).where(User.id == user_id))
            return result.scalar_one_or_none()
    except JWTError:
        return None


async def _ws_auth_by_token(token: str | None) -> bool:
    """Validate a raw JWT token string."""
    if not token:
        return False
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
        user_id = payload.get("sub")
        if not user_id:
            return False
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(User).where(User.id == user_id))
            return result.scalar_one_or_none() is not None
    except JWTError:
        return False


async def _ws_auth(websocket: WebSocket) -> bool:
    """Validate token from query param for WebSocket connections."""
    token = websocket.query_params.get("token")
    return await _ws_auth_by_token(token)


@router.post("/generate", dependencies=[Depends(get_current_user)])
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

    token = websocket.query_params.get("token")
    ws_user = await _get_user_from_token(token)
    if not ws_user:
        await websocket.send_json({"type": "error", "message": "Unauthorized"})
        await websocket.close(code=4001)
        return

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
    # Frontend sends audio_duration; also read from project.json as authoritative fallback
    audio_duration: float = float(config.get("audio_duration") or 0)

    # Always read from project.json on the server — most reliable source of truth
    project_json_path = project_dir / "project.json"
    if project_json_path.exists():
        try:
            with open(project_json_path) as f:
                proj_data = json.load(f)
            server_duration = float(proj_data.get("audio_duration") or 0)
            if server_duration > 0:
                audio_duration = server_duration
        except Exception:
            pass

    # Last-resort estimate: derive from total_frames
    if audio_duration <= 0 and total_frames > 0 and fps > 0:
        audio_duration = total_frames / fps

    logger.warning(
        "[render] project=%s mode=%s fps=%s total_frames=%s audio_duration=%.3f",
        project_id, mode, fps, total_frames, audio_duration,
    )
    render_start_time = time.monotonic()
    async with AsyncSessionLocal() as _db:
        await log_action(_db, ws_user, "render_start",
                         project_id=project_id, mode=mode, fps=fps,
                         total_frames=total_frames, audio_duration=audio_duration)

    output_dir = settings.output_path
    output_dir.mkdir(parents=True, exist_ok=True)
    output_file = output_dir / f"{project_id}.mp4"

    # Duration arg: use explicit -t so the output always matches the audio length
    # regardless of H.264 bitstream timestamps.  Falls back to -shortest only if
    # we genuinely have no duration information (should not happen in practice).
    duration_args = ["-t", str(audio_duration)] if audio_duration > 0 else ["-shortest"]

    if mode == "webcodecs":
        # WebCodecs sends pre-encoded H.264 Annex B from the browser's GPU encoder.
        # The browser does ALL the heavy encoding — server only muxes into MP4.
        #
        # Timestamp fix: Chrome WebCodecs Annex B has no SEI timing info, so FFmpeg
        # would assign PTS=0 to every frame with plain -c:v copy.
        # Solution: -fflags +genpts makes FFmpeg regenerate correct monotonic PTS
        # from the -r <fps> value, while still copying the original H.264 stream.
        # This keeps server CPU at near-zero (no re-encoding).
        ffmpeg_cmd = [
            "ffmpeg", "-y",
            "-fflags", "+genpts",    # regenerate PTS — fixes the 1-second bug
            "-f", "h264",
            "-r", str(fps),          # framerate used to generate correct PTS
            "-i", "pipe:0",
            "-i", str(audio_file),
            "-map", "0:v:0", "-map", "1:a:0",
            "-c:v", "copy",          # zero re-encoding — preserve browser GPU quality
            "-c:a", "aac", "-b:a", "320k", "-ar", "48000",
            "-movflags", "+faststart",
            *duration_args,
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
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            *duration_args,
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

    # Always log FFmpeg output so we can diagnose issues
    logger.warning("[ffmpeg] returncode=%d project=%s\n%s", proc.returncode, project_id, stderr_out[-2000:])

    if proc.returncode != 0:
        await websocket.send_json({"type": "error", "message": f"FFmpeg failed: {stderr_out[-800:]}"})
        await websocket.close()
        return

    render_elapsed = round(time.monotonic() - render_start_time, 1)
    output_size = output_file.stat().st_size if output_file.exists() else 0
    async with AsyncSessionLocal() as _db:
        await log_action(_db, ws_user, "render_complete",
                         project_id=project_id, mode=mode,
                         elapsed_sec=render_elapsed, output_bytes=output_size,
                         audio_duration=audio_duration)

    _jobs[project_id] = VideoStatus(
        project_id=project_id, status="done", progress=1.0, output_filename=output_file.name,
    )
    await websocket.send_json({"type": "done", "progress": 1.0})
    await websocket.close()


@router.get("/status/{project_id}", dependencies=[Depends(get_current_user)])
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
async def download_video(project_id: str, token: str | None = Query(None)):
    """Download the rendered video.

    Accepts the JWT token via query param so the browser can do a direct
    download (no fetch/blob dance needed, supports large files without
    memory issues).
    """
    dl_user = await _get_user_from_token(token)
    if not dl_user:
        raise HTTPException(401, "Unauthorized")
    output = settings.output_path / f"{project_id}.mp4"
    if not output.exists():
        raise HTTPException(404, "Video not ready")
    async with AsyncSessionLocal() as _db:
        await log_action(_db, dl_user, "download",
                         project_id=project_id,
                         output_bytes=output.stat().st_size)
    return FileResponse(
        output,
        media_type="video/mp4",
        filename=f"lyric_video_{project_id}.mp4",
        headers={"Content-Disposition": f"attachment; filename=\"lyric_video_{project_id}.mp4\""},
    )
