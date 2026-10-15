"""Фоновый слушатель Now Playing через Windows SMTC → оверлей + WS-broadcast.

Читает системный медиа-виджет Windows (тот же что показывается над треем).
Не требует микрофона, захвата звука или AudD-токена.
Дедупликация: один и тот же трек не пишется чаще раз в SAME_TRACK_COOLDOWN.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta

from .smtc_reader import NowPlayingInfo, get_now_playing
from .app_state import app_state
from ..config import config
from ..database import async_session
from ..models.recognition import Recognition
from ..schemas.vision import AnalysisResult, EntityInfo
from ..services.interest_grouper import update_interests_from_recognition
from ..services.tip_context import build_overlay_tips
from ..websocket import ws_manager

logger = logging.getLogger(__name__)

POLL_INTERVAL_SEC = 5.0
SAME_TRACK_COOLDOWN = timedelta(seconds=120)


def _track_key(info: NowPlayingInfo) -> str:
    return f"{info.artist.lower()}::{info.title.lower()}"


async def _persist_and_broadcast(info: NowPlayingInfo) -> None:
    entity = {
        "type": "track",
        "name": info.title or None,
        "artist": info.artist or None,
        "track": info.title or None,
        "album": info.album or None,
        "platform": info.source_id.lower().split(".")[0] if info.source_id else "smtc",
    }
    entity = {k: v for k, v in entity.items() if v is not None}

    async with async_session() as db:
        ent_info = EntityInfo.model_validate(entity)
        analysis = AnalysisResult(
            category="music",
            title=info.display_title,
            confidence=0.99,
            detected_objects=[info.artist, info.title] if info.artist or info.title else [],
            text_content=info.display_title,
            metadata={"provider": "smtc", "app": info.app_label},
            entity=ent_info,
        )
        tip_models = await build_overlay_tips(db, analysis)
        tips = [t.model_dump() for t in tip_models]

        rec = Recognition(
            category="music",
            title=info.display_title,
            confidence=0.99,
            detected_objects=[x for x in (info.artist, info.title) if x],
            text_content=info.display_title,
            extra_data={"provider": "smtc", "entity": entity},
            tips=tips,
        )
        db.add(rec)
        await db.commit()

        try:
            await update_interests_from_recognition(
                category="music",
                title=info.display_title,
                detected_objects=[x for x in (info.artist, info.title) if x],
                db=db,
            )
        except Exception as e:
            logger.warning(f"[MusicListener] interest update failed: {e}")

    ws_payload = {
        "category": "music",
        "title": info.display_title,
        "confidence": 0.99,
        "detected_objects": [x for x in (info.artist, info.title) if x],
        "text_content": info.display_title,
        "entity": entity,
        "metadata": {"provider": "smtc", "app": info.app_label},
    }
    await ws_manager.broadcast("overlay_update", {"recognition": ws_payload, "tips": tips})
    logger.info(f"[MusicListener] Now playing: {info.display_title} [{info.app_label}]")


class MusicListener:
    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self._stop = asyncio.Event()
        self._last_key: str | None = None
        self._last_at: datetime | None = None

    def is_running(self) -> bool:
        return self._task is not None and not self._task.done()

    async def start(self) -> None:
        if self.is_running():
            return
        self._stop.clear()
        self._task = asyncio.create_task(self._loop(), name="music_listener")
        logger.info(f"[MusicListener] Started (SMTC, poll={POLL_INTERVAL_SEC}s)")

    async def stop(self) -> None:
        self._stop.set()
        if self._task:
            try:
                await asyncio.wait_for(self._task, timeout=5)
            except (asyncio.TimeoutError, Exception):
                self._task.cancel()
        self._task = None

    async def _sleep(self, sec: float) -> bool:
        try:
            await asyncio.wait_for(self._stop.wait(), timeout=sec)
            return True
        except asyncio.TimeoutError:
            return False

    async def _loop(self) -> None:
        await self._sleep(2.0)
        while not self._stop.is_set():
            try:
                await self._tick()
            except Exception as e:
                logger.error(f"[MusicListener] tick error: {e}", exc_info=False)
            if await self._sleep(POLL_INTERVAL_SEC):
                return

    async def _tick(self) -> None:
        if app_state.is_paused:
            return

        info = await get_now_playing()
        if info is None:
            return

        key = _track_key(info)
        now = datetime.utcnow()

        if (
            key == self._last_key
            and self._last_at is not None
            and now - self._last_at < SAME_TRACK_COOLDOWN
        ):
            return

        self._last_key = key
        self._last_at = now
        await _persist_and_broadcast(info)


music_listener = MusicListener()
