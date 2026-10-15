"""Подчистка ответа ассистента: у Qwen иногда «прорывается» китайский текст в русском режиме."""


def sanitize_reply_for_ui_language(reply: str, language: str) -> str:
    """Для ru: обрезаем ответ с первого иероглифа/хангыля/каны (модель не должна смешивать языки)."""
    lang = (language or "ru").strip().lower()
    if not lang.startswith("ru"):
        return (reply or "").strip()
    text = (reply or "").strip()
    if not text:
        return text
    for i, ch in enumerate(text):
        o = ord(ch)
        if 0x4E00 <= o <= 0x9FFF:  # CJK Unified Ideographs
            break
        if 0x3040 <= o <= 0x30FF:  # Hiragana / Katakana
            break
        if 0xAC00 <= o <= 0xD7AF:  # Hangul syllables
            break
    else:
        return text

    head = text[:i].rstrip(" ,;:—-\t\n«»")
    if len(head) < 12:
        return (
            "Ответ модели ушёл в другой язык. Повторите вопрос короче или переформулируйте "
            "(в настройках язык интерфейса русский — ожидается только русский текст)."
        )
    return head + "…"
