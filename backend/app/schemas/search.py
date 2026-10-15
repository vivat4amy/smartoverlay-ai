from pydantic import BaseModel


class SearchResult(BaseModel):
    id: str
    title: str
    description: str = ""
    category: str
    icon: str = ""
    url: str | None = None
    image_url: str | None = None
    metadata: dict = {}


class SearchResponse(BaseModel):
    query: str
    search_type: str
    results: list[SearchResult] = []
