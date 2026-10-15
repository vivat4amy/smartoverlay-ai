from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from ..database import get_db
from ..models.interest import Interest
from ..models.recognition import Recognition
from ..schemas.user import InterestOut
from ..services.interest_grouper import rebuild_all_interests

router = APIRouter(prefix="/api/interests", tags=["interests"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class TrackInfo(BaseModel):
    title: str
    count: int

class ArtistInfo(BaseModel):
    name: str
    track_count: int
    play_count: int
    tracks: list[TrackInfo]

class GameInfo(BaseModel):
    title: str
    play_count: int
    platform: str | None = None

class VideoInfo(BaseModel):
    title: str
    channel: str | None = None
    platform: str | None = None
    view_count: int

class CategoryDetail(BaseModel):
    category: str
    name: str
    icon: str
    total_count: int
    artists: list[ArtistInfo] | None = None
    games: list[GameInfo] | None = None
    videos: list[VideoInfo] | None = None
    languages: list[TrackInfo] | None = None
    frameworks: list[TrackInfo] | None = None


_CATEGORY_ICONS = {
    "gaming": "🎮", "video": "🎬", "music": "🎵",
    "coding": "💻", "social": "💬", "browsing": "🌐",
    "documents": "📄", "general": "💡",
}
_CATEGORY_NAMES = {
    "gaming": "Игры", "video": "Видео", "music": "Музыка",
    "coding": "Программирование", "social": "Соцсети и чаты",
    "browsing": "Веб-сёрфинг", "documents": "Документы", "general": "Разное",
}


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("", response_model=list[InterestOut])
async def get_interests(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Interest).order_by(Interest.count.desc()))
    interests = result.scalars().all()
    return [
        InterestOut(
            id=i.id, name=i.name, category=i.category,
            icon=i.icon, count=i.count, tags=i.tags or [],
        )
        for i in interests
    ]


@router.get("/details", response_model=list[CategoryDetail])
async def get_interest_details(db: AsyncSession = Depends(get_db)):
    """Детальная информация по каждой категории интересов."""
    result = await db.execute(
        select(Recognition).order_by(Recognition.created_at.desc()).limit(500)
    )
    recognitions = result.scalars().all()

    by_category: dict[str, list] = {}
    for rec in recognitions:
        cat = rec.category or "general"
        by_category.setdefault(cat, []).append(rec)

    details: list[CategoryDetail] = []
    for cat, recs in sorted(by_category.items(), key=lambda x: -len(x[1])):
        detail = CategoryDetail(
            category=cat,
            name=_CATEGORY_NAMES.get(cat, cat.capitalize()),
            icon=_CATEGORY_ICONS.get(cat, "💡"),
            total_count=len(recs),
        )
        if cat == "music":
            detail.artists = _extract_artists(recs)
        elif cat == "gaming":
            detail.games = _extract_games(recs)
        elif cat == "video":
            detail.videos = _extract_videos(recs)
        elif cat == "coding":
            langs, fws = _extract_coding(recs)
            detail.languages = langs
            detail.frameworks = fws
        details.append(detail)

    return details


@router.post("/rebuild")
async def rebuild_interests(db: AsyncSession = Depends(get_db)):
    count = await rebuild_all_interests(db)
    return {"rebuilt": count}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _clean(val) -> str | None:
    if not val or not isinstance(val, str):
        return None
    val = val.strip()
    return val if val and val.lower() not in ("null", "none", "unknown", "n/a", "") else None


def _extract_artists(recs: list) -> list[ArtistInfo]:
    artists: dict[str, dict[str, int]] = {}
    artist_plays: dict[str, int] = {}
    for rec in recs:
        entity = (rec.extra_data or {}).get("entity", {})
        artist = _clean(entity.get("artist"))
        track = _clean(entity.get("track"))
        if not artist and rec.title and " — " in rec.title:
            parts = rec.title.split(" — ", 1)
            artist = _clean(parts[0])
            if not track:
                track = _clean(parts[1])
        if not artist:
            continue
        artist_plays[artist] = artist_plays.get(artist, 0) + 1
        if track:
            artists.setdefault(artist, {})
            artists[artist][track] = artists[artist].get(track, 0) + 1

    result = []
    for artist, track_counts in sorted(artists.items(), key=lambda x: -artist_plays.get(x[0], 0)):
        tracks = [TrackInfo(title=t, count=c) for t, c in sorted(track_counts.items(), key=lambda x: -x[1])]
        result.append(ArtistInfo(
            name=artist, track_count=len(track_counts),
            play_count=artist_plays.get(artist, 0), tracks=tracks[:20],
        ))
    return result[:30]


def _extract_games(recs: list) -> list[GameInfo]:
    games: dict[str, dict] = {}
    for rec in recs:
        entity = (rec.extra_data or {}).get("entity", {})
        title = _clean(entity.get("game_title")) or _clean(entity.get("name")) or _clean(rec.title)
        if not title:
            continue
        if title not in games:
            games[title] = {"count": 0, "platform": _clean(entity.get("platform"))}
        games[title]["count"] += 1
    return [GameInfo(title=t, play_count=d["count"], platform=d["platform"])
            for t, d in sorted(games.items(), key=lambda x: -x[1]["count"])][:20]


def _extract_videos(recs: list) -> list[VideoInfo]:
    videos: dict[str, dict] = {}
    for rec in recs:
        entity = (rec.extra_data or {}).get("entity", {})
        title = _clean(entity.get("video_title")) or _clean(entity.get("name")) or _clean(rec.title)
        if not title:
            continue
        if title not in videos:
            videos[title] = {"count": 0, "channel": _clean(entity.get("channel")), "platform": _clean(entity.get("platform"))}
        videos[title]["count"] += 1
    return [VideoInfo(title=t, channel=d["channel"], platform=d["platform"], view_count=d["count"])
            for t, d in sorted(videos.items(), key=lambda x: -x[1]["count"])][:20]


def _extract_coding(recs: list) -> tuple[list[TrackInfo], list[TrackInfo]]:
    langs: dict[str, int] = {}
    fws: dict[str, int] = {}
    for rec in recs:
        entity = (rec.extra_data or {}).get("entity", {})
        if lang := _clean(entity.get("language")):
            langs[lang] = langs.get(lang, 0) + 1
        if fw := _clean(entity.get("framework")):
            fws[fw] = fws.get(fw, 0) + 1
    return (
        [TrackInfo(title=k, count=v) for k, v in sorted(langs.items(), key=lambda x: -x[1])][:10],
        [TrackInfo(title=k, count=v) for k, v in sorted(fws.items(), key=lambda x: -x[1])][:10],
    )
