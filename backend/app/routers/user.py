from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..database import get_db
from ..models.user import User
from ..schemas.user import UserSettings
from ..services.vision.base import reset_vision_provider

router = APIRouter(prefix="/api/user", tags=["user"])


async def get_or_create_user(db: AsyncSession) -> User:
    result = await db.execute(select(User).limit(1))
    user = result.scalar_one_or_none()
    if not user:
        user = User(name="Default User")
        db.add(user)
        await db.commit()
        await db.refresh(user)
    return user


def _mask_key(key: str | None) -> str:
    if not key:
        return ""
    if len(key) <= 11:
        return "•" * len(key)
    return f"{key[:6]}…{key[-4:]}"


@router.get("/settings")
async def get_settings(db: AsyncSession = Depends(get_db)):
    user = await get_or_create_user(db)
    return {
        "language": user.language,
        "overlay_opacity": user.overlay_opacity,
        "capture_interval_sec": user.capture_interval_sec,
        "vision_provider": user.vision_provider,
        "openai_api_key": "",
        "openai_api_key_preview": _mask_key(user.openai_api_key),
        "openai_api_key_set": bool(user.openai_api_key),
        "openai_model": user.openai_model or "gpt-4o",
        "panel_width": user.panel_width or 380,
        "panel_height": user.panel_height or 560,
    }


@router.put("/settings")
async def update_settings(settings: UserSettings, db: AsyncSession = Depends(get_db)):
    user = await get_or_create_user(db)

    vp = (settings.vision_provider or "gpt4o").strip()
    if vp in ("nvidia", "gpt4o_nvidia"):
        vp = "gpt4o"

    user.language = settings.language
    user.overlay_opacity = settings.overlay_opacity
    user.capture_interval_sec = settings.capture_interval_sec
    user.vision_provider = vp
    user.openai_model = settings.openai_model or "gpt-4o"
    user.panel_width = max(280, min(900, settings.panel_width or 380))
    user.panel_height = max(320, min(1200, settings.panel_height or 560))

    incoming = (settings.openai_api_key or "").strip()
    if incoming == "__clear__":
        user.openai_api_key = ""
    elif incoming:
        user.openai_api_key = incoming

    await db.commit()
    await db.refresh(user)
    reset_vision_provider()
    return {
        "language": user.language,
        "overlay_opacity": user.overlay_opacity,
        "capture_interval_sec": user.capture_interval_sec,
        "vision_provider": user.vision_provider,
        "openai_api_key": "",
        "openai_api_key_preview": _mask_key(user.openai_api_key),
        "openai_api_key_set": bool(user.openai_api_key),
        "openai_model": user.openai_model or "gpt-4o",
        "panel_width": user.panel_width or 380,
        "panel_height": user.panel_height or 560,
    }
