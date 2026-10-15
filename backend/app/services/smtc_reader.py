"""Чтение текущего трека через Windows SMTC (System Media Transport Controls).

Не требует микрофона, AudD-токена или захвата звука — читает то же самое,
что Windows показывает во всплывающем виджете над треем.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)

# Маппинг SourceAppUserModelId → читаемое название
_APP_LABELS: dict[str, str] = {
    "chrome":          "Google Chrome",
    "firefox":         "Firefox",
    "msedge":          "Microsoft Edge",
    "spotify":         "Spotify",
    "vlc":             "VLC",
    "foobar":          "foobar2000",
    "aimp":            "AIMP",
    "mpc":             "MPC-HC",
    "musicbee":        "MusicBee",
    "yandexmusic":     "Яндекс.Музыка",
    "vkmusic":         "VK Музыка",
}


def _app_label(source_id: str) -> str:
    sid = (source_id or "").lower()
    for key, label in _APP_LABELS.items():
        if key in sid:
            return label
    # Берём имя до первой точки: "Chrome.exe" → "Chrome"
    part = source_id.split(".")[0] if source_id else ""
    return part.capitalize() or "Медиаплеер"


@dataclass
class NowPlayingInfo:
    title: str
    artist: str
    album: str
    app_label: str
    source_id: str

    @property
    def display_title(self) -> str:
        if self.artist and self.title:
            return f"{self.artist} — {self.title}"
        return self.title or self.artist or "Музыка"


async def get_now_playing() -> Optional[NowPlayingInfo]:
    """Возвращает текущий трек или None если ничего не играет."""
    try:
        from winrt.windows.media.control import (  # type: ignore
            GlobalSystemMediaTransportControlsSessionManager as Manager,
            GlobalSystemMediaTransportControlsSessionPlaybackStatus as Status,
        )

        manager = await Manager.request_async()
        session = manager.get_current_session()
        if session is None:
            return None

        # Проверяем что реально играет (не на паузе)
        pb_info = session.get_playback_info()
        if pb_info and pb_info.playback_status != Status.PLAYING:
            return None

        props = await session.try_get_media_properties_async()
        if props is None:
            return None

        title = (props.title or "").strip()
        artist = (props.artist or "").strip()
        album = (props.album_title or "").strip()
        source = session.source_app_user_model_id or ""

        if not title and not artist:
            return None

        return NowPlayingInfo(
            title=title,
            artist=artist,
            album=album,
            app_label=_app_label(source),
            source_id=source,
        )

    except Exception as e:
        logger.debug(f"[SMTC] Ошибка чтения: {e}")
        return None
