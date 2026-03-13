import json
import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from app.config import settings
from app.deps import get_current_user
from app.models.schemas import ProjectData

router = APIRouter(prefix="/api/project", tags=["project"])

# Shorthand dependency for protected routes
_auth = [Depends(get_current_user)]

MAX_PROJECTS = 3


def _project_dir(project_id: str) -> Path:
    d = settings.upload_path / project_id
    if not d.exists():
        raise HTTPException(404, "Project not found")
    return d


def _cleanup_old_projects():
    """Keep only the most recent MAX_PROJECTS projects, delete the rest."""
    upload_root = settings.upload_path
    if not upload_root.exists():
        return
    dirs = [d for d in upload_root.iterdir() if d.is_dir() and (d / "project.json").exists()]
    dirs.sort(key=lambda d: (d / "project.json").stat().st_mtime, reverse=True)
    for old_dir in dirs[MAX_PROJECTS:]:
        shutil.rmtree(old_dir, ignore_errors=True)


@router.get("/", dependencies=_auth)
async def list_projects():
    """Return recent projects sorted by last modified (newest first)."""
    upload_root = settings.upload_path
    if not upload_root.exists():
        return []
    dirs = [d for d in upload_root.iterdir() if d.is_dir() and (d / "project.json").exists()]
    dirs.sort(key=lambda d: (d / "project.json").stat().st_mtime, reverse=True)
    results = []
    for d in dirs[:MAX_PROJECTS]:
        meta = json.loads((d / "project.json").read_text())
        has_sync = any(l.get("start_time", 0) > 0 for l in meta.get("lyrics", []))
        results.append({
            "project_id": meta.get("project_id", d.name),
            "title": meta.get("title", "Untitled"),
            "artist": meta.get("artist", "Unknown"),
            "lyrics_count": len(meta.get("lyrics", [])),
            "has_sync": has_sync,
            "has_artwork": (d / "artwork").exists(),
        })
    return results


@router.delete("/{project_id}", dependencies=_auth)
async def delete_project(project_id: str):
    d = _project_dir(project_id)
    shutil.rmtree(d, ignore_errors=True)
    return {"status": "deleted"}


@router.get("/{project_id}", dependencies=_auth)
async def get_project(project_id: str):
    d = _project_dir(project_id)
    meta_file = d / "project.json"
    if meta_file.exists():
        return json.loads(meta_file.read_text())
    audio_dir = d / "audio"
    art_dir = d / "artwork"
    audio_file = next(audio_dir.iterdir(), None) if audio_dir.exists() else None
    art_file = next(art_dir.iterdir(), None) if art_dir.exists() else None
    return {
        "project_id": project_id,
        "audio_filename": audio_file.name if audio_file else None,
        "artwork_filename": art_file.name if art_file else None,
        "lyrics": [],
    }


@router.post("/{project_id}/save", dependencies=_auth)
async def save_project(project_id: str, data: ProjectData):
    d = _project_dir(project_id)
    meta_file = d / "project.json"
    meta_file.write_text(data.model_dump_json(indent=2))
    return {"status": "saved"}


@router.get("/{project_id}/audio")
async def get_audio(project_id: str):
    d = _project_dir(project_id)
    audio_dir = d / "audio"
    if not audio_dir.exists():
        raise HTTPException(404, "No audio file")
    f = next(audio_dir.iterdir(), None)
    if not f:
        raise HTTPException(404, "No audio file")
    media_types = {
        ".mp3": "audio/mpeg",
        ".wav": "audio/wav",
        ".flac": "audio/flac",
        ".ogg": "audio/ogg",
        ".m4a": "audio/mp4",
    }
    return FileResponse(f, media_type=media_types.get(f.suffix, "application/octet-stream"))


@router.get("/{project_id}/artwork")
async def get_artwork(project_id: str):
    d = _project_dir(project_id)
    art_dir = d / "artwork"
    if not art_dir.exists():
        raise HTTPException(404, "No artwork")
    f = next(art_dir.iterdir(), None)
    if not f:
        raise HTTPException(404, "No artwork")
    return FileResponse(f)
