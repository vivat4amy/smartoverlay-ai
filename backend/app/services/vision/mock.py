"""Мок-провайдер для разработки. Возвращает реалистичные данные,
а также использует OCR и анализатор если доступны.
"""

import random
import uuid
from PIL import Image
from .base import VisionProvider
from ...schemas.vision import AnalysisResult
from . import ocr, analyzer

_MOCK_SCENARIOS = [
    {
        "category": "gaming",
        "title": "Elden Ring — Limgrave",
        "confidence": 0.92,
        "detected_objects": ["фэнтези пейзаж", "персонаж", "полоска здоровья", "мини-карта"],
    },
    {
        "category": "video",
        "title": "YouTube — Обзор технологий",
        "confidence": 0.88,
        "detected_objects": ["видеоплеер", "прогресс-бар", "комментарии"],
    },
    {
        "category": "music",
        "title": "Spotify — Сейчас играет",
        "confidence": 0.95,
        "detected_objects": ["обложка альбома", "название трека", "кнопка play"],
    },
    {
        "category": "coding",
        "title": "VS Code — Python проект",
        "confidence": 0.97,
        "detected_objects": ["редактор кода", "боковая панель", "терминал"],
    },
    {
        "category": "social",
        "title": "Telegram — Чат",
        "confidence": 0.90,
        "detected_objects": ["список сообщений", "поле ввода", "аватарки"],
    },
    {
        "category": "browsing",
        "title": "Google — Результаты поиска",
        "confidence": 0.85,
        "detected_objects": ["строка поиска", "ссылки результатов"],
    },
    {
        "category": "documents",
        "title": "Google Docs — Документ",
        "confidence": 0.91,
        "detected_objects": ["текст", "панель инструментов", "разметка страницы"],
    },
]


class MockVisionProvider(VisionProvider):
    @property
    def name(self) -> str:
        return "mock"

    async def analyze(self, image: Image.Image) -> AnalysisResult:
        text_content = ""
        if ocr.is_available():
            text_content = ocr.extract_text(image)

        if text_content:
            tokens = analyzer.tokenize(text_content)
            category = analyzer.detect_category(tokens)
            keywords = analyzer.top_keywords(tokens, k=8)
            title = f"Распознано: {', '.join(keywords[:3])}" if keywords else "Неизвестный контент"
            return AnalysisResult(
                category=category,
                title=title,
                confidence=0.75,
                detected_objects=keywords[:5],
                text_content=text_content[:500],
                metadata={"provider": "mock+ocr", "request_id": str(uuid.uuid4())},
            )

        scenario = random.choice(_MOCK_SCENARIOS)
        return AnalysisResult(
            category=scenario["category"],
            title=scenario["title"],
            confidence=scenario["confidence"],
            detected_objects=scenario["detected_objects"],
            text_content=f"Мок-текст для {scenario['title']} ({image.size[0]}x{image.size[1]})",
            metadata={"provider": "mock", "request_id": str(uuid.uuid4())},
        )
