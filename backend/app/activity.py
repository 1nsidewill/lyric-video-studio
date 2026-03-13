"""Thin helper for writing ActivityLog rows."""
import json
import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.db_models import ActivityLog, User

logger = logging.getLogger(__name__)


async def log_action(
    db: AsyncSession,
    user: User,
    action: str,
    project_id: str | None = None,
    **meta: Any,
) -> None:
    try:
        entry = ActivityLog(
            action=action,
            user_id=user.id,
            user_email=user.email,
            project_id=project_id,
            meta=json.dumps(meta, ensure_ascii=False) if meta else None,
        )
        db.add(entry)
        await db.commit()
    except Exception as e:
        logger.warning("Failed to write activity log: %s", e)
