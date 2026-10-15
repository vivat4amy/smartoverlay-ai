"""Локальное распознавание речи через faster-whisper (без OpenAI и без ключа)."""

from __future__ import annotations

import logging
import os
import shutil

_log = logging.getLogger(__name__)

_MODEL = None
_MODEL_ID: str | None = None

_ALLOWED = frozenset({"tiny", "base", "small", "medium", "large-v2", "large-v3"})

_FFMPEG_PREPARED = False


def _ensure_bundled_ffmpeg() -> None:
    """Подкладывает ffmpeg из imageio-ffmpeg в PATH, если системного нет."""
    global _FFMPEG_PREPARED
    if _FFMPEG_PREPARED:
        return
    _FFMPEG_PREPARED = True
    if shutil.which("ffmpeg"):
        return
    try:
        import imageio_ffmpeg

        exe = imageio_ffmpeg.get_ffmpeg_exe()
        bindir = os.path.dirname(exe)
        if bindir and os.path.isfile(exe):
            os.environ["PATH"] = bindir + os.pathsep + os.environ.get("PATH", "")
            _log.debug("ffmpeg из imageio-ffmpeg: %s", exe)
    except Exception as e:
        _log.warning("bundled ffmpeg недоступен: %s", e)


def _load_model(model_id: str):
    global _MODEL, _MODEL_ID
    _ensure_bundled_ffmpeg()
    try:
        from faster_whisper import WhisperModel
    except ImportError as e:
        raise RuntimeError(
            "Пакет faster-whisper не установлен. Запустите dev.bat или: pip install -r requirements.txt"
        ) from e

    mid = (model_id or "tiny").strip().lower() or "tiny"
    if mid not in _ALLOWED:
        mid = "tiny"

    if _MODEL is not None and _MODEL_ID == mid:
        return _MODEL

    _log.info(
        "Загрузка локальной модели faster-whisper (%s); первый запуск может скачать файлы с Hugging Face…",
        mid,
    )
    _MODEL = WhisperModel(mid, device="cpu", compute_type="int8")
    _MODEL_ID = mid
    return _MODEL


def transcribe_path_sync(audio_path: str, language: str, model_id: str) -> str:
    """
    Распознаёт файл аудио (webm, wav и др. через ffmpeg).
    VAD Silero по умолчанию — кастомные жёсткие пороги часто вырезали всю речь и давали «титры».
    """
    _ensure_bundled_ffmpeg()
    model = _load_model(model_id)
    lang = "ru" if (language or "ru").lower().startswith("ru") else "en"
    segments, _info = model.transcribe(
        audio_path,
        language=lang,
        vad_filter=True,
        beam_size=2,
        temperature=[0.0, 0.2],
        condition_on_previous_text=False,
        compression_ratio_threshold=2.4,
        no_speech_threshold=0.55,
        log_prob_threshold=-0.95,
    )
    parts: list[str] = []
    for seg in segments:
        t = (seg.text or "").strip()
        if t:
            parts.append(t)
    return " ".join(parts).strip()
