import uuid
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import bcrypt
import aiosmtplib
from fastapi import APIRouter, Depends, HTTPException
from jose import jwt
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models.db_models import Invitation, User

router = APIRouter(prefix="/api/auth", tags=["auth"])


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_token(data: dict) -> str:
    to_encode = data.copy()
    to_encode["exp"] = datetime.now(timezone.utc) + timedelta(hours=settings.jwt_expire_hours)
    return jwt.encode(to_encode, settings.jwt_secret, algorithm="HS256")


# ── Schemas ───────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: str
    password: str


class InviteRequest(BaseModel):
    email: str


class RegisterRequest(BaseModel):
    token: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: str
    email: str
    is_admin: bool


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == req.email.lower().strip()))
    user = result.scalar_one_or_none()
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="이메일 또는 비밀번호가 올바르지 않습니다")
    return TokenResponse(access_token=create_token({"sub": user.id, "email": user.email}))


@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)):
    return UserOut(id=current_user.id, email=current_user.email, is_admin=current_user.is_admin)


@router.post("/invite")
async def invite(
    req: InviteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="관리자만 초대장을 보낼 수 있습니다")

    email = req.email.lower().strip()
    existing = await db.execute(select(User).where(User.email == email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="이미 가입된 이메일입니다")

    token = str(uuid.uuid4())
    invitation = Invitation(
        token=token,
        email=email,
        invited_by=current_user.id,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=24),
    )
    db.add(invitation)
    await db.commit()

    register_url = f"{settings.frontend_url}/register?token={token}"

    if settings.smtp_user and settings.smtp_password:
        await _send_invite_email(email, register_url, current_user.email)

    print(f"[INVITE] {email} → {register_url}")
    return {"message": f"{email}에 초대장을 발송했습니다", "register_url": register_url}


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/change-password")
async def change_password(
    req: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not verify_password(req.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="현재 비밀번호가 올바르지 않습니다")
    if len(req.new_password) < 6:
        raise HTTPException(status_code=400, detail="새 비밀번호는 6자 이상이어야 합니다")
    current_user.hashed_password = hash_password(req.new_password)
    await db.commit()
    return {"message": "비밀번호가 변경되었습니다"}


@router.post("/register", response_model=TokenResponse)
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Invitation).where(Invitation.token == req.token))
    invitation = result.scalar_one_or_none()

    if not invitation:
        raise HTTPException(status_code=400, detail="유효하지 않은 초대 링크입니다")
    if invitation.used:
        raise HTTPException(status_code=400, detail="이미 사용된 초대 링크입니다")
    if invitation.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="초대 링크가 만료되었습니다 (24시간)")

    existing = await db.execute(select(User).where(User.email == invitation.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="이미 가입된 이메일입니다")

    user = User(
        id=str(uuid.uuid4()),
        email=invitation.email,
        hashed_password=hash_password(req.password),
        is_admin=False,
    )
    db.add(user)
    invitation.used = True
    await db.commit()

    return TokenResponse(access_token=create_token({"sub": user.id, "email": user.email}))


# ── Email ─────────────────────────────────────────────────────────────────────

async def _send_invite_email(to_email: str, register_url: str, from_name: str):
    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Lyric Video Studio — 초대장"
    msg["From"] = settings.smtp_user
    msg["To"] = to_email

    html = f"""
    <div style="font-family:-apple-system,sans-serif;max-width:480px;margin:40px auto;
                background:#0a0a12;color:#fff;padding:40px;border-radius:12px;
                border:1px solid rgba(255,255,255,0.08);">
      <div style="display:inline-block;background:#fff;color:#000;width:32px;height:32px;
                  border-radius:8px;text-align:center;line-height:32px;font-weight:700;
                  margin-bottom:20px;">L</div>
      <h2 style="margin:0 0 8px;font-size:20px;font-weight:600;">Lyric Video Studio</h2>
      <p style="color:#888;margin:0 0 32px;font-size:14px;">
        <strong style="color:#ccc">{from_name}</strong>님이 초대했습니다
      </p>
      <a href="{register_url}"
         style="display:inline-block;background:#fff;color:#000;padding:12px 28px;
                border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
        회원가입 하기 →
      </a>
      <p style="color:#555;margin:32px 0 0;font-size:12px;">
        링크는 24시간 후 만료됩니다.<br>
        문의: {from_name}
      </p>
    </div>
    """
    msg.attach(MIMEText(html, "html"))

    try:
        await aiosmtplib.send(
            msg,
            hostname=settings.smtp_host,
            port=settings.smtp_port,
            username=settings.smtp_user,
            password=settings.smtp_password,
            use_tls=False,
            start_tls=True,
        )
    except Exception as e:
        print(f"[SMTP ERROR] 이메일 발송 실패: {e}")
