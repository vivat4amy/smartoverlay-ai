import base64
import io

from fastapi import APIRouter, Depends, HTTPException
from PIL import Image
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models.recognition import Recognition as RecognitionModel
from ..schemas.vision import VisionAnalyzeRequest, VisionAnalyzeResponse
from ..services.vision import get_vision_provider
from ..services.interest_grouper import update_interests_from_recognition
from ..services.tip_context import build_overlay_tips
from ..services.app_state import app_state
from ..websocket import ws_manager

router = APIRouter(prefix="/api/vision", tags=["vision"])


@router.post("/analyze", response_model=VisionAnalyzeResponse)
async def analyze_screenshot(
    req: VisionAnalyzeRequest, db: AsyncSession = Depends(get_db)
):
    if app_state.is_paused:
        raise HTTPException(status_code=409, detail="paused")
    image_bytes = base64.b64decode(req.image)
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")

    provider = await get_vision_provider()
    result = await provider.analyze(image)

    # Music у нас теперь — основной источник AudD-listener.
    # Если GPT-4o-vision назвал music, но не дал artist/track — даунгрейдим,
    # чтобы пустая «Now Playing» карточка не перебивала живой трек из listener.
    if result.category == "music":
        e = result.entity
        artist = (e.artist if e else None) or ""
        track = (e.track if e else None) or ""
        if not (artist.strip() or track.strip()):
            result.category = "general"

    # Если провайдер вернул ошибку (UnicodeEncodeError, no_api_key, rate_limit, ...) —
    # не засоряем историю и не бродкастим в оверлей. Просто возвращаем результат фронту.
    has_error = bool(
        isinstance(result.metadata, dict) and result.metadata.get("error")
    )
    if has_error:
        return VisionAnalyzeResponse(recognition=result, tips=[])

    tips = await build_overlay_tips(db, result)

    extra = dict(result.metadata or {})
    if result.entity:
        extra["entity"] = result.entity.model_dump(exclude_none=True)

    rec = RecognitionModel(
        category=result.category,
        title=result.title,
        confidence=result.confidence,
        detected_objects=result.detected_objects,
        text_content=result.text_content,
        extra_data=extra,
        tips=[t.model_dump() for t in tips],
    )
    db.add(rec)
    await db.commit()

    await update_interests_from_recognition(
        category=result.category,
        title=result.title,
        detected_objects=result.detected_objects,
        db=db,
    )

    await ws_manager.broadcast(
        "overlay_update",
        {
            "recognition": result.model_dump(),
            "tips": [t.model_dump() for t in tips],
        },
    )

    return VisionAnalyzeResponse(recognition=result, tips=tips)


@router.get("/providers")
async def list_providers():
    provider = await get_vision_provider()
    return {
        "current": provider.name,
        "available": ["mock", "clip", "gpt4o", "hybrid", "ollama"],
    }


@router.post("/test")
async def test_current_provider():
    """Быстрая проверка текущего провайдера на пустом тестовом изображении."""
    provider = await get_vision_provider()
    test_image = Image.new("RGB", (320, 200), color="black")
    try:
        result = await provider.analyze(test_image)
        return {
            "ok": result.confidence > 0,
            "provider": provider.name,
            "title": result.title,
            "error": result.metadata.get("error") if isinstance(result.metadata, dict) else None,
        }
    except Exception as e:
        return {"ok": False, "provider": provider.name, "error": str(e)[:200]}
