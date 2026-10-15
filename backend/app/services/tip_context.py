"""Контекстные подсказки для оверлея.

Идея: вместо «контент записан в историю / N-й раз» — реально полезные строки на
основе истории и интересов пользователя.

Для каждой категории генерируются ровно три подсказки:
  1) что распознано (с кликабельной ссылкой если есть);
  2) персональный контекст («N-й раз», топ-артист / любимый канал / частый сайт);
  3) actionable next step с URL (Spotify / YouTube / Twitch / Reddit / Steam / docs).

Похожие сущности и URL-шаблоны переиспользуются из recommender.py.
"""

from __future__ import annotations

import uuid
from urllib.parse import quote_plus, urlparse, urlunparse

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.recognition import Recognition
from ..schemas.vision import AnalysisResult, EntityInfo, TipItem
from .recommender import (
    _find_similar_channels,
    _find_similar_games,
    _find_similar_music,
    _find_similar_sites,
    _spotify_search,
    _twitch_search,
    _youtube_search,
)


# ── URL helpers ───────────────────────────────────────────────────────────────


def _norm_url(u: str) -> str:
    p = urlparse(u.strip())
    path = p.path.rstrip("/") or "/"
    return urlunparse((p.scheme.lower(), p.netloc.lower(), path, "", "", ""))


def _safe_url(u: str | None) -> str | None:
    if not u:
        return None
    u = u.strip()
    if not u:
        return None
    if u.startswith(("http://", "https://")):
        return u
    return f"https://{u}"


def _twitch_channel_url(channel: str) -> str:
    slug = quote_plus(channel.strip().lower().replace(" ", ""))
    return f"https://www.twitch.tv/{slug}"


_LANG_DOCS: dict[str, tuple[str, str]] = {
    "python":     ("Real Python", "https://realpython.com/"),
    "javascript": ("JavaScript.info", "https://javascript.info/"),
    "typescript": ("TypeScript Handbook", "https://www.typescriptlang.org/docs/"),
    "rust":       ("The Rust Book", "https://doc.rust-lang.org/book/"),
    "go":         ("Go Tour", "https://go.dev/tour/welcome/1"),
    "java":       ("Baeldung", "https://www.baeldung.com/"),
    "kotlin":     ("Kotlin Docs", "https://kotlinlang.org/docs/home.html"),
    "swift":      ("Hacking with Swift", "https://www.hackingwithswift.com/"),
    "cpp":        ("cppreference", "https://en.cppreference.com/"),
    "csharp":     ("Microsoft Learn (C#)", "https://learn.microsoft.com/dotnet/csharp/"),
}


# ── DB stats ──────────────────────────────────────────────────────────────────


async def _count_prior_matches(db: AsyncSession, result: AnalysisResult) -> int:
    """Сколько похожих записей уже в БД (до новой строки)."""
    cat = result.category or "general"
    ent = result.entity

    stmt = select(func.count(Recognition.id)).where(Recognition.category == cat)

    if cat == "browsing" and ent:
        url = (ent.url or "").strip()
        site = (ent.site_name or "").strip()
        if url:
            nu = _norm_url(url)
            stmt = stmt.where(
                or_(
                    Recognition.extra_data["entity"]["url"].as_string() == url,
                    Recognition.extra_data["entity"]["url"].as_string() == nu,
                )
            )
        elif site:
            stmt = stmt.where(
                Recognition.extra_data["entity"]["site_name"].as_string() == site
            )
        else:
            stmt = stmt.where(Recognition.title == result.title)
    elif cat == "music" and ent:
        art = (ent.artist or "").strip().lower()
        tr = (ent.track or "").strip().lower()
        if art or tr:
            if art:
                stmt = stmt.where(
                    func.lower(Recognition.extra_data["entity"]["artist"].as_string()) == art
                )
            if tr:
                stmt = stmt.where(
                    func.lower(Recognition.extra_data["entity"]["track"].as_string()) == tr
                )
        else:
            stmt = stmt.where(Recognition.title == result.title)
    else:
        stmt = stmt.where(Recognition.title == result.title)

    try:
        r = await db.execute(stmt)
        return int(r.scalar_one() or 0)
    except Exception:
        stmt2 = select(func.count(Recognition.id)).where(
            Recognition.category == cat,
            Recognition.title == result.title,
        )
        r2 = await db.execute(stmt2)
        return int(r2.scalar_one() or 0)


async def _user_top_stats(db: AsyncSession, limit: int = 300) -> dict:
    """Сводка по последним N записям — топ-артисты/игры/каналы/языки."""
    result = await db.execute(
        select(Recognition).order_by(Recognition.created_at.desc()).limit(limit)
    )
    recs = result.scalars().all()

    artist_plays: dict[str, int] = {}
    artist_total: int = 0
    game_plays: dict[str, int] = {}
    site_visits: dict[str, int] = {}
    yt_views: dict[str, int] = {}
    tw_views: dict[str, int] = {}
    lang_uses: dict[str, int] = {}

    for r in recs:
        cat = r.category or "general"
        entity = (r.extra_data or {}).get("entity", {}) or {}
        if cat == "music":
            artist = (entity.get("artist") or "").strip()
            if artist:
                artist_plays[artist] = artist_plays.get(artist, 0) + 1
                artist_total += 1
        elif cat == "gaming":
            g = (entity.get("game_title") or entity.get("name") or "").strip()
            if g:
                game_plays[g] = game_plays.get(g, 0) + 1
        elif cat == "browsing":
            s = (entity.get("site_name") or entity.get("platform") or "").strip()
            if s:
                site_visits[s] = site_visits.get(s, 0) + 1
        elif cat == "video":
            ch = (entity.get("channel") or "").strip()
            platform = (entity.get("platform") or "").strip().lower()
            if ch:
                if platform == "twitch":
                    tw_views[ch] = tw_views.get(ch, 0) + 1
                else:
                    yt_views[ch] = yt_views.get(ch, 0) + 1
        elif cat == "coding":
            lang = (entity.get("language") or "").strip()
            if lang:
                lang_uses[lang] = lang_uses.get(lang, 0) + 1

    return {
        "artists": artist_plays,
        "artist_total": artist_total,
        "games": game_plays,
        "sites": site_visits,
        "yt_channels": yt_views,
        "tw_channels": tw_views,
        "langs": lang_uses,
    }


def _times(n: int) -> str:
    n_abs = abs(n)
    if 11 <= n_abs % 100 <= 14:
        return "раз"
    last = n_abs % 10
    if last == 1:
        return "раз"
    if 2 <= last <= 4:
        return "раза"
    return "раз"


def _short(s: str, n: int = 42) -> str:
    s = (s or "").strip()
    return s if len(s) <= n else s[: n - 1] + "…"


# ── Per-category tip builders ─────────────────────────────────────────────────


def _tips_music(
    title: str,
    ent: EntityInfo | None,
    visit: int,
    stats: dict,
) -> list[TipItem]:
    artist = (ent.artist or "").strip() if ent else ""
    track = (ent.track or "").strip() if ent else ""
    label = f"{artist} — {track}" if artist and track else (track or artist or title)

    detected_url = _spotify_search(f"{artist} {track}".strip() or label)
    detected = TipItem(
        id=str(uuid.uuid4()),
        text=f"🎵 {label}",
        category="music",
        url=detected_url,
    )

    artist_plays = stats["artists"].get(artist, 0) if artist else 0
    artist_total = max(stats.get("artist_total", 0), 1)
    share = round(artist_plays * 100 / artist_total) if artist else 0

    if not artist:
        ctx_text = "Распознавание без исполнителя — добавь источник со звуком (Stereo Mix / WASAPI loopback)."
        ctx_url = None
    elif visit <= 1 and artist_plays <= 1:
        ctx_text = f"Новый исполнитель в твоей библиотеке: {artist}. Открой страницу в Spotify, чтобы услышать его другие треки."
        ctx_url = _spotify_search(artist)
    elif visit > 1:
        ctx_text = (
            f"Слышу этот трек {visit}-й {_times(visit)}. "
            f"«{artist}» уже среди топ-исполнителей ({share}% всех музыкальных распознаваний)."
        )
        ctx_url = _spotify_search(artist)
    else:
        ctx_text = (
            f"«{artist}» у тебя в топ-исполнителях — {artist_plays} {_times(artist_plays)}. "
            "Дальше покажу, сколько раз повторился именно этот трек."
        )
        ctx_url = _spotify_search(f"{artist} album")

    context = TipItem(
        id=str(uuid.uuid4()),
        text=ctx_text,
        category="music",
        url=ctx_url,
    )

    similar = _find_similar_music(artist) if artist else []
    if similar:
        s_name = similar[0]
        action = TipItem(
            id=str(uuid.uuid4()),
            text=f"Попробуй {s_name} — фанаты {artist} часто слушают именно его.",
            category="music",
            url=_spotify_search(s_name),
        )
    elif artist:
        action = TipItem(
            id=str(uuid.uuid4()),
            text=(
                f"Найди в Spotify плейлисты с «{artist}» — пользователи часто собирают подборки, "
                "где он рядом с другими артистами, не только официальные релизы."
            ),
            category="music",
            url=_spotify_search(f"{artist} playlist"),
        )
    else:
        action = TipItem(
            id=str(uuid.uuid4()),
            text="Включи длительный трек и проверь распознавание — SmartOverlay снимает 8-секундный фрагмент.",
            category="music",
        )

    return [detected, context, action]


def _tips_browsing(
    title: str,
    ent: EntityInfo | None,
    visit: int,
    stats: dict,
) -> list[TipItem]:
    site = (ent.site_name or "").strip() if ent else ""
    url = _safe_url(ent.url if ent else None)
    host = ""
    if url:
        try:
            host = urlparse(url).netloc
        except Exception:
            host = ""

    label = site or host or _short(title)
    detected = TipItem(
        id=str(uuid.uuid4()),
        text=f"🌐 {label}",
        category="browsing",
        url=url,
    )

    site_visits = stats["sites"].get(site or host, 0)

    if visit <= 1 and site_visits <= 1:
        ctx_text = f"Новый сайт в твоей истории: {label}. Если зайдёшь сюда ещё — попадёт в раздел Браузинг."
    elif visit > 1:
        ctx_text = f"Эта страница уже {visit}-й {_times(visit)} в истории — закладка напрашивается."
    else:
        ctx_text = f"«{label}» — частый ресурс ({site_visits} {_times(site_visits)} в последних сессиях)."

    context = TipItem(
        id=str(uuid.uuid4()),
        text=ctx_text,
        category="browsing",
        url=url,
    )

    similar = _find_similar_sites(site or host)
    if similar:
        alt = similar[0]
        action = TipItem(
            id=str(uuid.uuid4()),
            text=f"Альтернатива {label}: {alt} и ещё {len(similar) - 1} похожих.",
            category="browsing",
            url=f"https://duckduckgo.com/?q={quote_plus(alt)}",
        )
    else:
        action = TipItem(
            id=str(uuid.uuid4()),
            text="Собирай любимые сайты в Feedly или Inoreader — одна лента вместо десятка вкладок.",
            category="browsing",
            url="https://feedly.com/",
        )

    return [detected, context, action]


def _tips_video(
    title: str,
    ent: EntityInfo | None,
    visit: int,
    stats: dict,
) -> list[TipItem]:
    channel = (ent.channel or "").strip() if ent else ""
    video_title = (ent.video_title or "").strip() if ent else ""
    platform = (ent.platform or "").strip().lower() if ent else ""

    if platform == "twitch":
        url = _twitch_channel_url(channel) if channel else None
    elif platform in ("netflix", "kinopoisk", "ivi", "okko"):
        url = _youtube_search(f"{video_title or channel or title} trailer")
    else:
        url = _youtube_search(channel or video_title or title)

    label = channel or video_title or _short(title)
    icon = "🟣" if platform == "twitch" else "📺"

    detected = TipItem(
        id=str(uuid.uuid4()),
        text=f"{icon} {label}",
        category="video",
        url=url,
    )

    views_dict = stats["tw_channels"] if platform == "twitch" else stats["yt_channels"]
    ch_views = views_dict.get(channel, 0) if channel else 0

    if not channel:
        ctx_text = "Канал не определён — попробуй увеличить интервал захвата, чтобы AI успел прочитать имя."
        ctx_url = None
    elif visit <= 1 and ch_views <= 1:
        ctx_text = f"Канал {channel} впервые в истории. Подпишись, если зайдёт — отслежу повторы."
        ctx_url = url
    elif visit > 1:
        ctx_text = f"Возвращаешься к {channel} уже {visit}-й {_times(visit)} — один из любимых."
        ctx_url = url
    else:
        ctx_text = f"{channel} — частый канал, {ch_views} {_times(ch_views)} в истории."
        ctx_url = url

    context = TipItem(
        id=str(uuid.uuid4()),
        text=ctx_text,
        category="video",
        url=ctx_url,
    )

    if platform == "twitch":
        action = TipItem(
            id=str(uuid.uuid4()),
            text="Открой Twitch Directory и фильтруй по игре, которую смотришь чаще всего.",
            category="video",
            url="https://www.twitch.tv/directory",
        )
    else:
        similar = _find_similar_channels(channel) if channel else []
        if similar:
            s0 = similar[0]
            action = TipItem(
                id=str(uuid.uuid4()),
                text=f"Похожие каналы: {', '.join(similar[:3])}. Открыть {s0} в YouTube.",
                category="video",
                url=_youtube_search(s0),
            )
        else:
            action = TipItem(
                id=str(uuid.uuid4()),
                text="Открой YouTube → вкладка «Подписки» — там обычно лежат самые свежие видео любимых авторов.",
                category="video",
                url="https://www.youtube.com/feed/subscriptions",
            )

    return [detected, context, action]


def _tips_gaming(
    title: str,
    ent: EntityInfo | None,
    visit: int,
    stats: dict,
) -> list[TipItem]:
    game = (ent.game_title or ent.name or "").strip() if ent else ""
    label = game or _short(title)

    detected = TipItem(
        id=str(uuid.uuid4()),
        text=f"🎮 {label}",
        category="gaming",
        url=f"https://store.steampowered.com/search/?term={quote_plus(label)}" if label else None,
    )

    plays = stats["games"].get(game, 0) if game else 0
    if not game:
        ctx_text = "AI не уверен в названии игры — попробуй задержаться на главном меню."
        ctx_url = None
    elif visit <= 1 and plays <= 1:
        ctx_text = f"Первый раз вижу {game}. Если будешь играть чаще — попадёт в топ-игры."
        ctx_url = f"https://www.reddit.com/search/?q={quote_plus(game)}"
    elif visit > 1:
        ctx_text = f"{game} распознана уже {visit}-й {_times(visit)} — одна из основных за последнее время."
        ctx_url = f"https://www.reddit.com/r/{quote_plus(game.lower().replace(' ', ''))}"
    else:
        ctx_text = f"{game} — частый гость ({plays} {_times(plays)} в истории)."
        ctx_url = f"https://www.reddit.com/search/?q={quote_plus(game)}"

    context = TipItem(
        id=str(uuid.uuid4()),
        text=ctx_text,
        category="gaming",
        url=ctx_url,
    )

    similar = _find_similar_games(game) if game else []
    if similar:
        s0 = similar[0]
        action = TipItem(
            id=str(uuid.uuid4()),
            text=f"Если нравится {game}, посмотри {s0} (и {', '.join(similar[1:3])}).",
            category="gaming",
            url=f"https://store.steampowered.com/search/?term={quote_plus(s0)}",
        )
    else:
        action = TipItem(
            id=str(uuid.uuid4()),
            text="Загляни в сабреддит игры — там часто свежие гайды, моды и патчи.",
            category="gaming",
            url=f"https://www.reddit.com/search/?q={quote_plus(label)}",
        )

    return [detected, context, action]


def _tips_coding(
    title: str,
    ent: EntityInfo | None,
    visit: int,
    stats: dict,
) -> list[TipItem]:
    lang = (ent.language or "").strip() if ent else ""
    fw = (ent.framework or "").strip() if ent else ""
    label = " + ".join(x for x in [lang, fw] if x) or _short(title)

    detected = TipItem(
        id=str(uuid.uuid4()),
        text=f"💻 {label}",
        category="coding",
    )

    lang_uses = stats["langs"].get(lang, 0) if lang else 0
    if not lang:
        ctx_text = "AI не определил язык — открой файл с расширением или активируй вкладку с кодом."
        ctx_url = None
    elif lang_uses <= 1:
        ctx_text = f"Новый язык в твоей сессии: {lang}. Дальше покажу, как часто ты к нему возвращаешься."
        ctx_url = None
    else:
        ctx_text = f"{lang} — основной язык последних сессий ({lang_uses} {_times(lang_uses)})."
        ctx_url = None

    context = TipItem(
        id=str(uuid.uuid4()),
        text=ctx_text,
        category="coding",
    )

    if lang and lang.lower() in _LANG_DOCS:
        name, url = _LANG_DOCS[lang.lower()]
        action = TipItem(
            id=str(uuid.uuid4()),
            text=f"Лучший справочник по {lang}: {name}.",
            category="coding",
            url=url,
        )
    elif lang:
        action = TipItem(
            id=str(uuid.uuid4()),
            text=f"Документация и Awesome-список по {lang} на GitHub — собран всё нужное.",
            category="coding",
            url=f"https://github.com/topics/{quote_plus(lang.lower())}",
        )
    else:
        action = TipItem(
            id=str(uuid.uuid4()),
            text="Открой Stack Overflow и забей вопрос текущей задачи — экономия часов.",
            category="coding",
            url="https://stackoverflow.com/",
        )

    return [detected, context, action]


def _tips_social(title: str, ent: EntityInfo | None, visit: int, stats: dict) -> list[TipItem]:
    label = (ent.name or ent.platform or _short(title)) if ent else _short(title)
    detected = TipItem(id=str(uuid.uuid4()), text=f"💬 {label}", category="social")
    context = TipItem(
        id=str(uuid.uuid4()),
        text="Соцсети часто съедают фокус — закрой лишние вкладки и оставь только нужный диалог.",
        category="social",
    )
    action = TipItem(
        id=str(uuid.uuid4()),
        text="Cold Turkey: ограничь время в соцсетях, чтобы не уходить туда машинально.",
        category="social",
        url="https://getcoldturkey.com/",
    )
    return [detected, context, action]


def _tips_generic(title: str, cat: str, visit: int) -> list[TipItem]:
    detected = TipItem(
        id=str(uuid.uuid4()),
        text=f"✨ {_short(title)}",
        category=cat,
    )
    if visit <= 1:
        ctx_text = "Новый сценарий в истории — буду отслеживать повторы и предлагать контекст."
    else:
        ctx_text = f"Этот сценарий уже {visit}-й {_times(visit)} в истории."
    context = TipItem(
        id=str(uuid.uuid4()),
        text=ctx_text,
        category=cat,
    )
    action = TipItem(
        id=str(uuid.uuid4()),
        text="Посмотри раздел «Рекомендации» — там подборки по твоим интересам.",
        category=cat,
    )
    return [detected, context, action]


# ── Public API ────────────────────────────────────────────────────────────────


async def build_overlay_tips(
    db: AsyncSession, result: AnalysisResult
) -> list[TipItem]:
    prior = await _count_prior_matches(db, result)
    visit = prior + 1
    cat = (result.category or "general").lower()
    ent = result.entity
    stats = await _user_top_stats(db, limit=300)

    if cat == "music":
        return _tips_music(result.title, ent, visit, stats)
    if cat == "browsing":
        return _tips_browsing(result.title, ent, visit, stats)
    if cat == "video":
        return _tips_video(result.title, ent, visit, stats)
    if cat == "gaming":
        return _tips_gaming(result.title, ent, visit, stats)
    if cat == "coding":
        return _tips_coding(result.title, ent, visit, stats)
    if cat == "social":
        return _tips_social(result.title, ent, visit, stats)
    return _tips_generic(result.title, cat, visit)


async def count_music_track_prior(db: AsyncSession, artist: str, track: str) -> int:
    """Сколько раз artist+track уже был в истории (до новой записи).

    Используется music_listener для отдельного учёта.
    """
    a = (artist or "").strip().lower()
    t = (track or "").strip().lower()
    if not a and not t:
        return 0
    stmt = select(func.count(Recognition.id)).where(Recognition.category == "music")
    if a:
        stmt = stmt.where(
            func.lower(Recognition.extra_data["entity"]["artist"].as_string()) == a
        )
    if t:
        stmt = stmt.where(
            func.lower(Recognition.extra_data["entity"]["track"].as_string()) == t
        )
    try:
        r = await db.execute(stmt)
        return int(r.scalar_one() or 0)
    except Exception:
        return 0
