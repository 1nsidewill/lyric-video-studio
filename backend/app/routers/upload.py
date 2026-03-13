import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.activity import log_action
from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models.db_models import User
from app.routers.project import _cleanup_old_projects

router = APIRouter(
    prefix="/api/upload",
    tags=["upload"],
    dependencies=[Depends(get_current_user)],
)

ALLOWED_AUDIO = {".mp3", ".wav", ".flac", ".ogg", ".m4a"}
ALLOWED_IMAGE = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}


def _save_upload(file: UploadFile, subdir: str, allowed: set[str]) -> dict:
    ext = Path(file.filename or "").suffix.lower()
    if ext not in allowed:
        raise HTTPException(400, f"Unsupported file type: {ext}. Allowed: {allowed}")

    project_id = uuid.uuid4().hex[:12]
    dest_dir = settings.upload_path / project_id / subdir
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / f"{subdir}{ext}"

    with open(dest, "wb") as buf:
        shutil.copyfileobj(file.file, buf)

    return {"project_id": project_id, "filename": dest.name, "path": str(dest), "_dest": dest}


@router.post("/audio")
async def upload_audio(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = _save_upload(file, "audio", ALLOWED_AUDIO)
    size = Path(result.pop("_dest")).stat().st_size
    await log_action(db, current_user, "upload",
                     project_id=result["project_id"],
                     file_type="audio", filename=file.filename, size_bytes=size)
    return result


@router.post("/artwork")
async def upload_artwork(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = _save_upload(file, "artwork", ALLOWED_IMAGE)
    size = Path(result.pop("_dest")).stat().st_size
    await log_action(db, current_user, "upload",
                     project_id=result["project_id"],
                     file_type="artwork", filename=file.filename, size_bytes=size)
    return result


@router.post("/all")
async def upload_all(
    audio: UploadFile = File(...),
    artwork: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload audio and artwork together, returns a single project_id."""
    audio_ext = Path(audio.filename or "").suffix.lower()
    art_ext = Path(artwork.filename or "").suffix.lower()

    if audio_ext not in ALLOWED_AUDIO:
        raise HTTPException(400, f"Unsupported audio type: {audio_ext}")
    if art_ext not in ALLOWED_IMAGE:
        raise HTTPException(400, f"Unsupported image type: {art_ext}")

    project_id = uuid.uuid4().hex[:12]
    base = settings.upload_path / project_id

    audio_dir = base / "audio"
    audio_dir.mkdir(parents=True, exist_ok=True)
    audio_dest = audio_dir / f"audio{audio_ext}"
    with open(audio_dest, "wb") as f:
        shutil.copyfileobj(audio.file, f)

    art_dir = base / "artwork"
    art_dir.mkdir(parents=True, exist_ok=True)
    art_dest = art_dir / f"artwork{art_ext}"
    with open(art_dest, "wb") as f:
        shutil.copyfileobj(artwork.file, f)

    _cleanup_old_projects()

    await log_action(db, current_user, "upload",
                     project_id=project_id,
                     audio=audio.filename, artwork=artwork.filename,
                     audio_bytes=audio_dest.stat().st_size,
                     artwork_bytes=art_dest.stat().st_size)

    return {
        "project_id": project_id,
        "audio_filename": audio_dest.name,
        "artwork_filename": art_dest.name,
    }
