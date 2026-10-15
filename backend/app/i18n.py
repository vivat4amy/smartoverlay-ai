"""Простая i18n система. Расширяемая в будущем."""

_TRANSLATIONS: dict[str, dict[str, str]] = {
    "ru": {
        "no_recognition": "Нет активного распознавания",
        "analyze_hint": "Анализ экрана выполняется автоматически по интервалу из настроек",
        "paused": "На паузе",
        "interests_empty": "Интересы ещё не обнаружены",
        "history_empty": "История пуста",
        "recommendations_empty": "Рекомендаций пока нет",
        "settings_saved": "Настройки сохранены",
        "provider_mock": "Мок-провайдер (разработка)",
        "provider_clip": "CLIP (локальный)",
        "provider_gpt4o": "GPT-4o Vision (облако)",
        "provider_hybrid": "Гибрид (CLIP + GPT-4o)",
    },
    "en": {
        "no_recognition": "No active recognition",
        "analyze_hint": "Screen analysis runs automatically on your configured interval",
        "paused": "Paused",
        "interests_empty": "No interests detected yet",
        "history_empty": "History is empty",
        "recommendations_empty": "No recommendations yet",
        "settings_saved": "Settings saved",
        "provider_mock": "Mock provider (development)",
        "provider_clip": "CLIP (local)",
        "provider_gpt4o": "GPT-4o Vision (cloud)",
        "provider_hybrid": "Hybrid (CLIP + GPT-4o)",
    },
}


def t(key: str, lang: str = "ru") -> str:
    return _TRANSLATIONS.get(lang, _TRANSLATIONS["en"]).get(key, key)
