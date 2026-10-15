"""Базовый класс и кэш для поисковых сервисов."""

from abc import ABC, abstractmethod
from datetime import datetime, timedelta
from typing import Any

_cache: dict[str, tuple[datetime, list[dict]]] = {}
CACHE_TTL = timedelta(hours=1)


class SearchProvider(ABC):
    @property
    @abstractmethod
    def search_type(self) -> str:
        ...

    @abstractmethod
    async def _search(self, query: str) -> list[dict]:
        ...

    async def search(self, query: str) -> list[dict]:
        cache_key = f"{self.search_type}:{query.lower().strip()}"
        if cache_key in _cache:
            cached_time, cached_data = _cache[cache_key]
            if datetime.now() - cached_time < CACHE_TTL:
                return cached_data

        results = await self._search(query)
        _cache[cache_key] = (datetime.now(), results)
        return results
