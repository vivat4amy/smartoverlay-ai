"""Поиск игр через RAWG API (бесплатный ключ на rawg.io/apidocs)."""

import httpx
from .base import SearchProvider


RAWG_BASE = "https://api.rawg.io/api"


class GameSearchProvider(SearchProvider):
    def __init__(self, api_key: str = ""):
        self.api_key = api_key

    @property
    def search_type(self) -> str:
        return "games"

    async def _search(self, query: str) -> list[dict]:
        if not self.api_key:
            return self._placeholder(query)

        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    f"{RAWG_BASE}/games",
                    params={"key": self.api_key, "search": query, "page_size": 5},
                )
                resp.raise_for_status()
                data = resp.json()

            results = []
            for game in data.get("results", [])[:5]:
                genres = ", ".join(g["name"] for g in game.get("genres", [])[:3])
                results.append({
                    "id": f"game-{game['id']}",
                    "title": game["name"],
                    "description": f"Рейтинг: {game.get('rating', 'N/A')}/5 | Жанры: {genres}",
                    "category": "games",
                    "icon": "🎮",
                    "url": f"https://rawg.io/games/{game.get('slug', '')}",
                    "image_url": game.get("background_image"),
                    "metadata": {
                        "rating": game.get("rating"),
                        "released": game.get("released"),
                        "genres": [g["name"] for g in game.get("genres", [])],
                    },
                })
            return results
        except Exception:
            return self._placeholder(query)

    def _placeholder(self, query: str) -> list[dict]:
        return [{
            "id": "game-placeholder",
            "title": query,
            "description": "Для поиска игр добавьте RAWG_API_KEY в .env",
            "category": "games",
            "icon": "🎮",
            "metadata": {"source": "placeholder"},
        }]
