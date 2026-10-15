"""Эндпоинт распознавания музыки по системному аудио (Shazam-like)."""

from fastapi import APIRouter, Query
from ..services.audio_recognizer import identify_current_music, _list_audio_devices

router = APIRouter(prefix="/api/music", tags=["music"])


@router.post("/identify")
async def identify_music(duration: float = Query(default=8.0, ge=3.0, le=15.0)):
    """
    Захватывает системное аудио и отправляет в Shazam.
    Занимает duration секунд. Возвращает данные трека или {error: ...}.
    """
    result = await identify_current_music(duration_sec=duration)
    return result


@router.get("/devices")
async def list_audio_devices():
    """Список аудиоустройств (для диагностики)."""
    return _list_audio_devices()
