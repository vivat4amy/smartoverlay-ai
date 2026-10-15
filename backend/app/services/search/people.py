"""Поиск людей и персонажей через Wikidata API (бесплатный, без ключа)."""

import httpx
from .base import SearchProvider


WIKIDATA_API = "https://www.wikidata.org/w/api.php"


class PeopleSearchProvider(SearchProvider):
    @property
    def search_type(self) -> str:
        return "people"

    async def _search(self, query: str) -> list[dict]:
        try:
            headers = {"User-Agent": "SmartOverlayAI/0.1 (https://github.com/smartoverlay)"}
            async with httpx.AsyncClient(timeout=10, headers=headers) as client:
                resp = await client.get(
                    WIKIDATA_API,
                    params={
                        "action": "wbsearchentities",
                        "search": query,
                        "language": "ru",
                        "uselang": "ru",
                        "type": "item",
                        "limit": 5,
                        "format": "json",
                    },
                )
                resp.raise_for_status()
                data = resp.json()

            results = []
            for item in data.get("search", [])[:5]:
                results.append({
                    "id": f"person-{item['id']}",
                    "title": item.get("label", query),
                    "description": item.get("description", ""),
                    "category": "people",
                    "icon": "👤",
                    "url": item.get("concepturi", f"https://www.wikidata.org/wiki/{item['id']}"),
                    "metadata": {
                        "wikidata_id": item["id"],
                    },
                })
            return results
        except Exception:
            return [{
                "id": "person-fallback",
                "title": query,
                "description": "Не удалось найти информацию",
                "category": "people",
                "icon": "👤",
                "metadata": {"source": "error"},
            }]
