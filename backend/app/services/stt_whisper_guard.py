"""Отсев типичных «галлюцинаций» Whisper на тишине/шуме (титры, титры создал, …)."""

from __future__ import annotations

# Жёсткие маркеры «титров» Whisper; остальное не отсекаем, чтобы не резать нормальную речь.
_HALLUCINATION_CORE = (
    "редактор субтитров",
    "субтитры создал",
    "субтитры сделал",
    "субтитры:",
    "subtitles by",
    "subtitle by",
    "captions by",
    "amara.org",
    "www.sendspace",
)


def looks_like_whisper_hallucination(text: str) -> bool:
    t = (text or "").strip().lower()
    if len(t) < 2:
        return True
    for m in _HALLUCINATION_CORE:
        if m in t:
            return True
    # Титры без слова «субтитры», но явно «редактор» и «корректор» в одной короткой строке
    if len(t) <= 90 and "редактор" in t and "корректор" in t:
        return True
    return False


def hallucination_user_hint() -> str:
    return (
        "Whisper выдал типичный «мусор» вместо речи (часто если в запись попала почти тишина или не тот вход). "
        "Проверьте: при записи полоска уровня должна заметно двигаться; в Windows — Параметры → Звук → "
        "микрофон по умолчанию (не «Стерео микшер»). Поговорите 1–2 секунды после нажатия. "
        "Если уже base в .env — попробуйте ASSISTANT_WHISPER_LOCAL_MODEL=small."
    )
