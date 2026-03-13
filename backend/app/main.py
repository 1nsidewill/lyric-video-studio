import asyncio
import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import bcrypt
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select

logger = logging.getLogger("uvicorn.error")

from app.config import settings
from app.database import AsyncSessionLocal, init_db
from app.deps import get_current_user
from app.models import db_models  # noqa: F401 — ensures models are registered
from app.models.db_models import ActivityLog, User
from app.routers import auth, project, upload, video

app = FastAPI(title="Lyric Video Maker", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(upload.router)
app.include_router(project.router)
app.include_router(video.router)


# ── Startup ───────────────────────────────────────────────────────────────────

@app.on_event("startup")
async def startup():
    await init_db()
    await _seed_admin()
    asyncio.create_task(_cleanup_loop())


async def _seed_admin():
    """If no admin exists yet, create one with a random temp password printed to logs."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.is_admin == True))  # noqa: E712
        if result.scalar_one_or_none():
            return

        temp_password = secrets.token_urlsafe(12)
        admin = User(
            id=str(uuid.uuid4()),
            email=settings.admin_email,
            hashed_password=bcrypt.hashpw(temp_password.encode(), bcrypt.gensalt()).decode(),
            is_admin=True,
        )
        db.add(admin)
        await db.commit()

        sep = "=" * 60
        logger.warning(f"\n{sep}")
        logger.warning("  ADMIN ACCOUNT CREATED (first run)")
        logger.warning(f"  Email    : {settings.admin_email}")
        logger.warning(f"  Password : {temp_password}")
        logger.warning("  Change it: POST /api/auth/change-password")
        logger.warning(f"{sep}")


# ── Auto-cleanup loop ─────────────────────────────────────────────────────────

OUTPUT_TTL_HOURS = 24   # delete rendered MP4s after 24 hours
CHECK_INTERVAL_SEC = 3600  # run every hour


async def _cleanup_loop():
    """Background task: delete old rendered MP4 files every hour."""
    while True:
        try:
            _purge_old_outputs()
        except Exception as e:
            logger.warning("cleanup error: %s", e)
        await asyncio.sleep(CHECK_INTERVAL_SEC)


def _purge_old_outputs():
    output_dir: Path = settings.output_path
    if not output_dir.exists():
        return
    cutoff = datetime.now(timezone.utc).timestamp() - OUTPUT_TTL_HOURS * 3600
    deleted = 0
    for f in output_dir.glob("*.mp4"):
        if f.stat().st_mtime < cutoff:
            f.unlink(missing_ok=True)
            deleted += 1
    if deleted:
        logger.warning("[cleanup] deleted %d old output file(s)", deleted)


# ── Admin stats ───────────────────────────────────────────────────────────────

@app.get("/api/admin/stats")
async def admin_stats(current_user: User = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(403, "관리자 전용")

    async with AsyncSessionLocal() as db:
        # Users
        total_users = (await db.execute(func.count(User.id))).scalar() or 0
        users_rows = (await db.execute(
            select(User.email, User.is_admin, User.created_at).order_by(User.created_at.desc())
        )).all()

        # Activity summary per action
        action_counts = (await db.execute(
            select(ActivityLog.action, func.count(ActivityLog.id))
            .group_by(ActivityLog.action)
        )).all()

        # Per-user activity counts
        user_activity = (await db.execute(
            select(ActivityLog.user_email, func.count(ActivityLog.id))
            .group_by(ActivityLog.user_email)
            .order_by(func.count(ActivityLog.id).desc())
        )).all()

        # Recent 30 activities
        recent = (await db.execute(
            select(ActivityLog).order_by(ActivityLog.created_at.desc()).limit(30)
        )).scalars().all()

    return {
        "users": {
            "total": total_users,
            "list": [
                {"email": r.email, "is_admin": r.is_admin,
                 "joined": r.created_at.isoformat() if r.created_at else None}
                for r in users_rows
            ],
        },
        "action_counts": {action: count for action, count in action_counts},
        "user_activity": [
            {"email": email, "total_actions": count}
            for email, count in user_activity
        ],
        "recent_activity": [
            {
                "action": a.action,
                "user": a.user_email,
                "project_id": a.project_id,
                "meta": a.meta,
                "at": a.created_at.isoformat() if a.created_at else None,
            }
            for a in recent
        ],
        "output_cleanup": {
            "ttl_hours": OUTPUT_TTL_HOURS,
            "check_interval_sec": CHECK_INTERVAL_SEC,
        },
    }


@app.get("/api/health")
async def health():
    return {"status": "ok"}
