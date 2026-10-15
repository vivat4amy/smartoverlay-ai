"""Анализатор контекста — токенизация, ключевые слова, категоризация."""

import re

_DEV_WORDS = {
    "function", "class", "def", "import", "api", "error", "traceback",
    "python", "async", "await", "java", "typescript", "sdk", "code",
    "github", "stack", "overflow", "debug", "console", "terminal",
}
_VIDEO_WORDS = {"youtube", "видео", "video", "play", "player", "twitch", "stream", "netflix"}
_MUSIC_WORDS = {"spotify", "music", "track", "album", "artist", "shazam", "soundcloud", "яндекс.музыка"}
_GAME_WORDS = {"steam", "game", "игра", "fps", "rpg", "level", "score", "player", "epic"}
_CHAT_WORDS = {"slack", "telegram", "discord", "чат", "сообщение", "whatsapp", "messenger"}
_DOC_WORDS = {"документ", "текст", "редактор", "word", "docs", "sheets", "excel", "notion"}
_BROWSER_WORDS = {"http", "https", "www", "страница", "сайт", "google", "browser"}

_URL_RE = re.compile(r"https?://[\w\-\./%#?=&:+]+", re.IGNORECASE)


def tokenize(text: str) -> list[str]:
    return [t.lower() for t in re.findall(r"[\w\-]{3,}", text)]


def top_keywords(tokens: list[str], k: int = 16) -> list[str]:
    freq: dict[str, int] = {}
    for t in tokens:
        if len(t) > 30:
            continue
        freq[t] = freq.get(t, 0) + 1
    return [w for w, _ in sorted(freq.items(), key=lambda x: x[1], reverse=True)[:k]]


def detect_category(tokens: list[str]) -> str:
    s = set(tokens)
    if s & _GAME_WORDS:
        return "gaming"
    if s & _DEV_WORDS:
        return "coding"
    if s & _MUSIC_WORDS:
        return "music"
    if s & _VIDEO_WORDS:
        return "video"
    if s & _CHAT_WORDS:
        return "social"
    if s & _DOC_WORDS:
        return "documents"
    if s & _BROWSER_WORDS:
        return "browsing"
    return "general"


def extract_urls(text: str) -> list[str]:
    return list(_URL_RE.findall(text))
