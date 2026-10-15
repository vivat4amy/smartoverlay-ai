from datetime import timezone
from urllib.parse import quote_plus

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, or_

from ..database import get_db
from ..models.recognition import Recognition
from ..schemas.user import HistoryEntry

router = APIRouter(prefix="/api/history", tags=["history"])

def _iso_timestamp_utc(dt) -> str:
    """SQLite CURRENT_TIMESTAMP — UTC; SQLAlchemy отдаёт naive datetime — помечаем как UTC."""
    if dt is None:
        return ""
    if getattr(dt, "tzinfo", None) is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat(timespec="seconds")


_CATEGORY_ICONS = {
    "gaming": "🎮",
    "video": "🎬",
    "music": "🎵",
    "coding": "💻",
    "social": "💬",
    "browsing": "🌐",
    "documents": "📄",
}


def _clean(val) -> str | None:
    if not val or not isinstance(val, str):
        return None
    v = val.strip()
    return v if v and v.lower() not in ("null", "none", "unknown", "n/a", "") else None


def _build_subtitle(category: str, entity: dict | None, title: str) -> str | None:
    """Строим человекочитаемый подзаголовок из entity-данных."""
    if not entity:
        return None

    if category == "music":
        artist = _clean(entity.get("artist"))
        track = _clean(entity.get("track"))
        platform = _clean(entity.get("platform"))
        parts = []
        if artist and track:
            parts.append(f"{artist} — {track}")
        elif artist:
            parts.append(artist)
        elif track:
            parts.append(track)
        if platform:
            parts.append(platform.capitalize())
        return " · ".join(parts) if parts else None

    elif category == "gaming":
        game = _clean(entity.get("game_title")) or _clean(entity.get("name"))
        platform = _clean(entity.get("platform"))
        if game and platform:
            return f"{game} · {platform}"
        return game

    elif category == "video":
        channel = _clean(entity.get("channel"))
        vtitle = _clean(entity.get("video_title"))
        platform = _clean(entity.get("platform"))
        parts = []
        if channel:
            parts.append(channel)
        if vtitle and vtitle.lower() != (channel or "").lower():
            parts.append(vtitle[:50])
        if platform:
            parts.append(platform.capitalize())
        return " · ".join(parts) if parts else None

    elif category == "browsing":
        site = _clean(entity.get("site_name"))
        url = _clean(entity.get("url"))
        platform = _clean(entity.get("platform"))
        return site or url or platform

    elif category == "coding":
        lang = _clean(entity.get("language"))
        fw = _clean(entity.get("framework"))
        platform = _clean(entity.get("platform"))
        parts = [x for x in [lang, fw, platform] if x]
        return " + ".join(parts) if parts else None

    elif category == "social":
        name = _clean(entity.get("name"))
        platform = _clean(entity.get("platform"))
        if name and platform:
            return f"{name} · {platform.capitalize()}"
        return platform or name

    return None


def _safe_http(u: str | None) -> str | None:
    if not u:
        return None
    u = u.strip()
    if not u:
        return None
    if u.startswith(("http://", "https://")):
        return u
    return f"https://{u}"


def _build_url(category: str, entity: dict | None, title: str) -> str | None:
    """Кликабельная ссылка для записи истории.

    music    → Spotify search (artist + track)
    browsing → исходный URL
    video    → twitch.tv/<channel> для twitch, иначе YouTube search
    gaming   → Steam search
    """
    if not entity:
        entity = {}

    if category == "music":
        artist = _clean(entity.get("artist"))
        track = _clean(entity.get("track"))
        q = " ".join(p for p in [artist, track] if p)
        if not q:
            q = _clean(title) or ""
        if not q:
            return None
        return f"https://open.spotify.com/search/{quote_plus(q)}"

    if category == "browsing":
        url = _safe_http(_clean(entity.get("url")))
        if url:
            return url
        site = _clean(entity.get("site_name"))
        if site:
            return f"https://duckduckgo.com/?q={quote_plus(site)}"
        return None

    if category == "video":
        channel = _clean(entity.get("channel"))
        platform = (_clean(entity.get("platform")) or "").lower()
        if platform == "twitch" and channel:
            slug = channel.strip().lower().replace(" ", "")
            return f"https://www.twitch.tv/{quote_plus(slug)}"
        q = channel or _clean(entity.get("video_title")) or _clean(title)
        if not q:
            return None
        return f"https://www.youtube.com/results?search_query={quote_plus(q)}"

    if category == "gaming":
        game = _clean(entity.get("game_title")) or _clean(entity.get("name")) or _clean(title)
        if not game:
            return None
        return f"https://store.steampowered.com/search/?term={quote_plus(game)}"

    if category == "coding":
        lang = _clean(entity.get("language"))
        if lang:
            return f"https://github.com/topics/{quote_plus(lang.lower())}"
        return None

    if category == "documents":
        return None

    return None


@router.get("", response_model=list[HistoryEntry])
async def get_history(
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Recognition).order_by(Recognition.created_at.desc()).limit(limit)
    )
    recs = result.scalars().all()

    entries = []
    for r in recs:
        extra = r.extra_data or {}
        # Скрываем технические ошибки Vision из ленты (UnicodeEncodeError, no_api_key и т.п.)
        if extra.get("error"):
            continue
        title = r.title or ""
        if title.lower().startswith("ошибка"):
            continue

        entity = extra.get("entity")
        cat = r.category or "general"
        subtitle = _build_subtitle(cat, entity, title)
        url = _build_url(cat, entity, title)
        entries.append(
            HistoryEntry(
                id=r.id,
                title=title or "Unknown",
                subtitle=subtitle,
                category=cat,
                icon=_CATEGORY_ICONS.get(r.category, "💡"),
                confidence=r.confidence or 0.0,
                timestamp=_iso_timestamp_utc(r.created_at),
                entity=entity,
                text_content=(r.text_content or "")[:200] if r.text_content else None,
                url=url,
            )
        )
    return entries


@router.delete("/errors")
async def purge_error_entries(db: AsyncSession = Depends(get_db)):
    """Удалить технические ошибки Vision из истории."""
    stmt = delete(Recognition).where(
        or_(
            Recognition.title.ilike("Ошибка%"),
            Recognition.title.ilike("Error%"),
        )
    )
    result = await db.execute(stmt)
    await db.commit()
    return {"deleted": result.rowcount or 0}
