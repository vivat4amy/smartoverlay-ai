from abc import ABC, abstractmethod
from PIL import Image

from ...schemas.vision import AnalysisResult


class VisionProvider(ABC):
    @abstractmethod
    async def analyze(self, image: Image.Image) -> AnalysisResult:
        """Analyze a screenshot and return structured results."""
        ...

    @property
    @abstractmethod
    def name(self) -> str:
        ...


# Singleton провайдера. Сбрасывается при изменении настроек пользователя
# (см. routers/user.py → update_settings).
_provider_instance: VisionProvider | None = None


def reset_vision_provider() -> None:
    """Сбросить кэш провайдера, чтобы при следующем запросе пересоздался."""
    global _provider_instance
    _provider_instance = None


async def _resolve_provider_settings() -> tuple[str, str, str, str]:
    """
    Возвращает (provider_name, openai_api_key, openai_model, language).
    Берёт значения из БД (User), с fallback на .env / config.
    """
    from ...config import config
    from ...database import async_session
    from ...models.user import User
    from sqlalchemy import select

    provider = config.vision_provider
    api_key = config.openai_api_key
    model = config.openai_model
    language = config.language

    try:
        async with async_session() as db:
            result = await db.execute(select(User).limit(1))
            user = result.scalar_one_or_none()
            if user:
                raw = (user.vision_provider or "").strip()
                if raw in ("nvidia", "gpt4o_nvidia"):
                    provider = "gpt4o"
                else:
                    provider = raw or provider
                api_key = (user.openai_api_key or "").strip() or api_key
                model = user.openai_model or model
                language = user.language or language
    except Exception:
        pass

    if provider in ("nvidia", "gpt4o_nvidia"):
        provider = "gpt4o"

    return provider, api_key, model, language


async def get_vision_provider() -> VisionProvider:
    """Получить или создать провайдер на основе текущих настроек пользователя."""
    global _provider_instance
    if _provider_instance is not None:
        return _provider_instance

    provider_name, api_key, model, _language = await _resolve_provider_settings()

    if provider_name == "clip":
        from .clip import CLIPProvider

        _provider_instance = CLIPProvider()
    elif provider_name == "gpt4o":
        from .gpt4o import GPT4oVisionProvider

        _provider_instance = GPT4oVisionProvider(api_key=api_key, model=model)
    elif provider_name == "hybrid":
        from .hybrid import HybridProvider

        _provider_instance = HybridProvider(api_key=api_key, model=model)
    elif provider_name == "ollama":
        from .ollama_vision import OllamaVisionProvider

        _provider_instance = OllamaVisionProvider()
    else:
        from .mock import MockVisionProvider

        _provider_instance = MockVisionProvider()

    return _provider_instance
