"""Поиск музыки. Использует iTunes Search API (бесплатный, без ключа) как базовый вариант.
Для полноценного распознавания аудио интегрировать Shazam/AudD API.
"""

import httpx
from .base import SearchProvider


ITUNES_SEARCH = "https://itunes.apple.com/search"


class MusicSearchProvider(SearchProvider):
    @property
    def search_type(self) -> str:
        return "music"

    async def _search(self, query: str) -> list[dict]:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    ITUNES_SEARCH,
                    params={
                        "term": query,
                        "media": "music",
                        "limit": 5,
                        "lang": "ru_ru",
                    },
                )
                resp.raise_for_status()
                data = resp.json()

            results = []
            for track in data.get("results", [])[:5]:
                results.append({
                    "id": f"music-{track.get('trackId', 0)}",
                    "title": track.get("trackName", query),
                    "description": f"{track.get('artistName', 'Неизвестный')} — {track.get('collectionName', '')}",
                    "category": "music",
                    "icon": "🎵",
                    "url": track.get("trackViewUrl"),
                    "image_url": track.get("artworkUrl100"),
                    "metadata": {
                        "artist": track.get("artistName"),
                        "album": track.get("collectionName"),
                        "genre": track.get("primaryGenreName"),
                        "preview_url": track.get("previewUrl"),
                    },
                })
            return results
        except Exception:
            return [{
                "id": "music-fallback",
                "title": query,
                "description": "Не удалось найти трек",
                "category": "music",
                "icon": "🎵",
                "metadata": {"source": "error"},
            }]
