from pydantic import BaseModel


class VisionAnalyzeRequest(BaseModel):
    image: str  # base64-encoded screenshot


class EntityInfo(BaseModel):
    """Детальная информация о распознанной сущности."""
    type: str | None = None
    name: str | None = None
    # Music
    artist: str | None = None
    track: str | None = None
    album: str | None = None
    # Gaming
    game_title: str | None = None
    # Video
    video_title: str | None = None
    channel: str | None = None
    # Common
    platform: str | None = None
    # Coding
    language: str | None = None
    framework: str | None = None
    # Browsing
    url: str | None = None
    site_name: str | None = None
    # Music extras (Shazam/AudD)
    cover_url: str | None = None
    song_link: str | None = None


class AnalysisResult(BaseModel):
    category: str
    title: str
    confidence: float
    detected_objects: list[str] = []
    text_content: str = ""
    metadata: dict = {}
    entity: EntityInfo | None = None


class TipItem(BaseModel):
    id: str
    text: str
    category: str
    url: str | None = None


class VisionAnalyzeResponse(BaseModel):
    recognition: AnalysisResult
    tips: list[TipItem] = []
