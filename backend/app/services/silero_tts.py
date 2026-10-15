"""Локальный TTS через Silero (офлайн, без API-ключей)."""

import io
import threading
from typing import Optional

_lock = threading.Lock()
_model = None
_model_lang: Optional[str] = None

SILERO_VOICES = {
    "ru": ["kseniya", "xenia", "aidar", "baya", "eugene"],
    "en": ["en_0", "en_1", "en_2", "en_3"],
}

DEFAULT_VOICE: dict[str, str] = {
    "ru": "kseniya",
    "en": "en_0",
}

SAMPLE_RATE = 24000


_MODEL_ID = {
    "ru": "v5_ru",
    "en": "v3_en",
}


def _load_model(lang: str = "ru"):
    """Загружает модель Silero (кэшируется в памяти)."""
    global _model, _model_lang
    with _lock:
        if _model is not None and _model_lang == lang:
            return _model

        import torch

        model_id = _MODEL_ID.get(lang, "v5_ru")
        model, _ = torch.hub.load(
            repo_or_dir="snakers4/silero-models",
            model="silero_tts",
            language=lang if lang in ("ru", "en") else "ru",
            speaker=model_id,
            trust_repo=True,
        )
        _model = model
        _model_lang = lang
        return _model


def synthesize_wav(text: str, speaker: str = "kseniya", lang: str = "ru") -> bytes:
    """Синтезирует речь и возвращает WAV-байты."""
    import torch

    model = _load_model(lang)
    with _lock:
        audio = model.apply_tts(
            text=text,
            speaker=speaker,
            sample_rate=SAMPLE_RATE,
        )

    # tensor → WAV bytes
    import wave

    buf = io.BytesIO()
    samples = (audio.squeeze().numpy() * 32767).astype("int16")
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(samples.tobytes())
    return buf.getvalue()
