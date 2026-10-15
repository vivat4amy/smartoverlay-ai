from fastapi import APIRouter, HTTPException
from ..schemas.search import SearchResponse, SearchResult
from ..services.search import get_search_provider

router = APIRouter(prefix="/api/search", tags=["search"])

VALID_TYPES = {"music", "games", "media", "people"}


@router.get("/{search_type}", response_model=SearchResponse)
async def search_content(search_type: str, query: str):
    """Поиск контента по типу: music, games, media, people."""
    if search_type not in VALID_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Неизвестный тип поиска: {search_type}. Доступные: {', '.join(VALID_TYPES)}",
        )

    provider = get_search_provider(search_type)
    if not provider:
        raise HTTPException(status_code=500, detail="Провайдер поиска не найден")

    raw_results = await provider.search(query)

    results = [
        SearchResult(
            id=r.get("id", ""),
            title=r.get("title", ""),
            description=r.get("description", ""),
            category=r.get("category", search_type),
            icon=r.get("icon", "🔍"),
            url=r.get("url"),
            image_url=r.get("image_url"),
            metadata=r.get("metadata", {}),
        )
        for r in raw_results
    ]

    return SearchResponse(query=query, search_type=search_type, results=results)


@router.get("/", response_model=dict)
async def list_search_types():
    return {
        "types": list(VALID_TYPES),
        "description": {
            "music": "Поиск музыки (iTunes Search API)",
            "games": "Поиск игр (RAWG API)",
            "media": "Поиск фильмов и сериалов (TMDb API)",
            "people": "Поиск людей и персонажей (Wikidata)",
        },
    }
