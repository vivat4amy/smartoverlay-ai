from pydantic import BaseModel


class UserSettings(BaseModel):
    language: str = "ru"
    overlay_opacity: float = 0.95
    capture_interval_sec: int = 4
    vision_provider: str = "gpt4o"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o"
    panel_width: int = 380
    panel_height: int = 560


class InterestOut(BaseModel):
    id: int
    name: str
    category: str
    icon: str
    count: int
    tags: list[str]


class HistoryEntry(BaseModel):
    id: int
    title: str
    subtitle: str | None = None
    category: str
    icon: str
    confidence: float
    timestamp: str
    entity: dict | None = None
    text_content: str | None = None
    url: str | None = None  # кликабельная ссылка (Spotify search / raw URL / YouTube / Twitch)


class RecommendationOut(BaseModel):
    id: str
    title: str
    description: str
    category: str
    icon: str
    subcategory: str | None = None
    subcategory_label: str | None = None
    url: str | None = None
    accent: str | None = None  # подсказка-окраска для UI (например, "spotify", "youtube", "twitch")
