import logging
import secrets
import uuid

import bcrypt
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

logger = logging.getLogger("uvicorn.error")

from app.config import settings
from app.database import AsyncSessionLocal, init_db
from app.models import db_models  # noqa: F401 — ensures models are registered
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


@app.on_event("startup")
async def startup():
    await init_db()
    await _seed_admin()


async def _seed_admin():
    """If no admin exists yet, create one with a random temp password printed to logs.
    After first login, change the password via /api/auth/change-password."""
    from sqlalchemy import select
    from app.models.db_models import User

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.is_admin == True))  # noqa: E712
        if result.scalar_one_or_none():
            return  # admin already exists

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


@app.get("/api/health")
async def health():
    return {"status": "ok"}
