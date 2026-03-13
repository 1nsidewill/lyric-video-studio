import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, String

from app.database import Base


def _now():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    is_admin = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=_now)


class Invitation(Base):
    __tablename__ = "invitations"

    token = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String, nullable=False)
    invited_by = Column(String, nullable=False)
    used = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=_now)
    expires_at = Column(DateTime(timezone=True), nullable=False)


class ActivityLog(Base):
    """Records every significant user action for analytics."""
    __tablename__ = "activity_logs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    # action: upload | save | render_start | render_complete | download
    action = Column(String, nullable=False, index=True)
    user_id = Column(String, nullable=False, index=True)
    user_email = Column(String, nullable=False)
    project_id = Column(String, nullable=True)
    # extra info: file size, duration, title, etc. (JSON string)
    meta = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=_now, index=True)
