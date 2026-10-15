"""Поиск фильмов и сериалов через TMDb API (бесплатный ключ на themoviedb.org)."""

import httpx
from .base import SearchProvider


TMDB_BASE = "https://api.themoviedb.org/3"


class MediaSearchProvider(SearchProvider):
    def __init__(self, api_key: str = ""):
        self.api_key = api_key

    @property
    def search_type(self) -> str:
        return "media"

    async def _search(self, query: str) -> list[dict]:
        if not self.api_key:
            return self._placeholder(query)

        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    f"{TMDB_BASE}/search/multi",
                    params={
                        "api_key": self.api_key,
                        "query": query,
                        "language": "ru-RU",
                    },
                )
                resp.raise_for_status()
                data = resp.json()

            results = []
            for item in data.get("results", [])[:5]:
                media_type = item.get("media_type", "movie")
                title = item.get("title") or item.get("name", "Неизвестно")
                year = (item.get("release_date") or item.get("first_air_date") or "")[:4]
                poster = item.get("poster_path")

                results.append({
                    "id": f"media-{item['id']}",
                    "title": f"{title} ({year})" if year else title,
                    "description": (item.get("overview") or "")[:200],
                    "category": "media",
                    "icon": "🎬" if media_type == "movie" else "📺",
                    "url": f"https://www.themoviedb.org/{media_type}/{item['id']}",
                    "image_url": f"https://image.tmdb.org/t/p/w200{poster}" if poster else None,
                    "metadata": {
                        "media_type": media_type,
                        "rating": item.get("vote_average"),
                        "year": year,
                    },
                })
            return results
        except Exception:
            return self._placeholder(query)

    def _placeholder(self, query: str) -> list[dict]:
        return [{
            "id": "media-placeholder",
            "title": query,
            "description": "Для поиска фильмов добавьте TMDB_API_KEY в .env",
            "category": "media",
            "icon": "🎬",
            "metadata": {"source": "placeholder"},
        }]
