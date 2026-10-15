"""Диалоговый ассистент через Ollama + SQLite + долговременная память (RAG)."""

import asyncio
import json
import os
import tempfile
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import Response
from openai import OpenAI
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import config
from ..database import get_db
from ..models.assistant_memory_chunk import AssistantMemoryChunk
from ..models.assistant_message import AssistantMessage
from ..schemas.assistant_local import (
    AssistantHistoryMsg,
    AssistantTranscribeResponse,
    LocalAssistantChatRequest,
    LocalAssistantChatResponse,
)
from ..services.assistant_long_memory import (
    index_exchange,
    retrieve_memory_block,
    try_embed_query,
)
from ..services.assistant_reply_sanitize import sanitize_reply_for_ui_language
from ..services.ollama_client import ollama_chat, ollama_error_detail
from ..services.stt_whisper_guard import hallucination_user_hint, looks_like_whisper_hallucination
from ..services.vision.base import _resolve_provider_settings

router = APIRouter(prefix="/api/assistant", tags=["assistant"])

USER_ID = 1
MAX_DB_MESSAGES = 400

_SYSTEM_TEMPLATE = """\
Ты SmartOverlay AI — персональный ассистент, встроенный в рабочий стол пользователя.
Характер: умный, лаконичный, дружелюбный. Говоришь по-русски как живой человек.
Сейчас: {datetime}.

ФОРМАТ ОТВЕТА:
• По умолчанию — 1–2 предложения. Никогда не начинай с «Конечно!», «Отличный вопрос!» или подобных вводных.
• Списки — только если пользователь явно просит перечислить.
• Развёрнутый ответ — только если спрашивают «подробнее», «объясни», «как именно».
• Не пересказывай вопрос, сразу отвечай по сути.

КОНТЕКСТ:
• Если есть «Память» — используй как факты о пользователе; не упоминай её явно.
• Если есть «Экран» — учитывай, но не пересказывай без запроса.
• Не выдавай за факт то, чего не знаешь — лучше скажи честно.

ЗАПРЕЩЕНО:
• Любые языки кроме русского. Ни одного иероглифа, ни одной латинской фразы целиком.
• Фразы: «как языковая модель», «я не могу», «позвольте уточнить», «в данном контексте».
• Нумерованные списки и маркеры (★ • 1)) без явного запроса.\
"""

_SYSTEM_VISION_TEMPLATE = """\
Ты SmartOverlay AI — персональный ассистент, встроенный в рабочий стол пользователя.
Характер: умный, лаконичный, дружелюбный. Говоришь по-русски как живой человек.
Сейчас: {datetime}.
К последнему сообщению приложён скриншот — используй его вместе с историей и памятью.

ФОРМАТ ОТВЕТА:
• По умолчанию — 1–2 предложения. Никогда не начинай с «Конечно!» или подобных вводных.
• Опиши только то, о чём спросили. Не перечисляй всё на экране без запроса.
• Если на картинке неразборчиво — так и скажи.

КОНТЕКСТ:
• Если есть «Память» — используй как факты о пользователе; не упоминай её явно.
• Не выдавай за факт то, чего не знаешь.

ЗАПРЕЩЕНО:
• Любые языки кроме русского. Ни одного иероглифа.
• Фразы: «как языковая модель», «я не могу», «позвольте уточнить».\
"""


def _build_system(vision: bool = False) -> str:
    now = datetime.now().strftime("%A, %d %B %Y, %H:%M")
    template = _SYSTEM_VISION_TEMPLATE if vision else _SYSTEM_TEMPLATE
    return template.replace("{datetime}", now)


def _strip_data_url(b64: str) -> str:
    s = (b64 or "").strip()
    if s.startswith("data:") and "," in s:
        return s.split(",", 1)[1].strip()
    return s


async def _load_history_rows(db: AsyncSession, limit: int) -> list[AssistantMessage]:
    r = await db.execute(
        select(AssistantMessage)
        .where(AssistantMessage.user_id == USER_ID)
        .order_by(AssistantMessage.id.desc())
        .limit(limit),
    )
    rows = list(r.scalars().all())
    rows.reverse()
    return rows


async def _trim_old(db: AsyncSession) -> None:
    sub = (
        select(AssistantMessage.id)
        .where(AssistantMessage.user_id == USER_ID)
        .order_by(AssistantMessage.id.desc())
        .offset(MAX_DB_MESSAGES - 1)
        .limit(1)
    )
    res = await db.execute(sub)
    cutoff_id = res.scalar_one_or_none()
    if cutoff_id is None:
        return
    await db.execute(
        delete(AssistantMessage).where(
            AssistantMessage.user_id == USER_ID,
            AssistantMessage.id < cutoff_id,
        ),
    )


async def _append_exchange(
    db: AsyncSession, user_text: str, assistant_text: str, persist: bool
) -> None:
    if not persist:
        return
    db.add(
        AssistantMessage(
            user_id=USER_ID,
            role="user",
            content=user_text[:120_000],
        ),
    )
    db.add(
        AssistantMessage(
            user_id=USER_ID,
            role="assistant",
            content=assistant_text[:120_000],
        ),
    )
    await db.commit()
    await _trim_old(db)


def _ctx_block(body: LocalAssistantChatRequest) -> str:
    ctx: list[str] = []
    if body.context_title:
        ctx.append(f"Сейчас на экране (кратко): {body.context_title}")
    if body.context_category:
        ctx.append(f"Категория: {body.context_category}")
    if body.context_screen_text:
        ctx.append(
            "Текст с последнего распознавания:\n"
            + (body.context_screen_text.strip()[:3500])
        )
    return "\n".join(ctx)


@router.get("/messages", response_model=list[AssistantHistoryMsg])
async def list_assistant_messages(
    limit: int = 200,
    db: AsyncSession = Depends(get_db),
):
    lim = max(1, min(limit, 500))
    rows = await _load_history_rows(db, lim)
    return [AssistantHistoryMsg(role=r.role, content=r.content) for r in rows]


@router.delete("/messages")
async def clear_assistant_messages(db: AsyncSession = Depends(get_db)):
    await db.execute(delete(AssistantMessage).where(AssistantMessage.user_id == USER_ID))
    await db.execute(
        delete(AssistantMemoryChunk).where(AssistantMemoryChunk.user_id == USER_ID),
    )
    await db.commit()
    return {"ok": True}


def _sniff_audio_suffix(data: bytes) -> str:
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WAVE":
        return ".wav"
    return ".webm"


async def _whisper_transcribe_bytes(content: bytes, api_key: str, language: str) -> str:
    lang = "ru" if (language or "ru").lower().startswith("ru") else "en"

    def run() -> str:
        suffix = _sniff_audio_suffix(content)
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(content)
            path = tmp.name
        try:
            client = OpenAI(api_key=api_key)
            with open(path, "rb") as fh:
                tr = client.audio.transcriptions.create(
                    model="whisper-1",
                    file=fh,
                    language=lang,
                )
            return (tr.text or "").strip()
        finally:
            try:
                os.unlink(path)
            except OSError:
                pass

    return await asyncio.to_thread(run)


async def _transcribe_local_bytes(content: bytes, language: str) -> str:
    model_id = (config.assistant_whisper_local_model or "tiny").strip().lower()

    def run() -> str:
        suffix = _sniff_audio_suffix(content)
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(content)
            path = tmp.name
        try:
            from ..services.local_whisper_stt import transcribe_path_sync

            return transcribe_path_sync(path, language, model_id)
        finally:
            try:
                os.unlink(path)
            except OSError:
                pass

    return await asyncio.to_thread(run)


@router.post("/transcribe", response_model=AssistantTranscribeResponse)
async def transcribe_assistant_voice(
    audio: UploadFile = File(..., description="Запись с микрофона (webm/opus или wav)"),
):
    """
    Распознавание речи: по умолчанию локальный Whisper (faster-whisper, без ключа),
    при `ASSISTANT_STT_MODE=openai` или при сбое локально — OpenAI, если задан ключ.
    """
    raw = await audio.read()
    if len(raw) < 256:
        raise HTTPException(status_code=400, detail="Запись слишком короткая")
    if len(raw) > 24 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Аудио больше 24 МБ")

    _, api_key, _, language = await _resolve_provider_settings()
    api_key = (api_key or "").strip()
    mode = (config.assistant_stt_mode or "auto").strip().lower()
    if mode not in ("auto", "local", "openai"):
        mode = "auto"

    tried: list[str] = []

    if mode in ("auto", "local"):
        try:
            text = await _transcribe_local_bytes(raw, language)
            if text:
                if looks_like_whisper_hallucination(text):
                    raise HTTPException(status_code=422, detail=hallucination_user_hint())
                return AssistantTranscribeResponse(text=text)
            tried.append("локальный Whisper вернул пустой текст")
        except Exception as e:
            tried.append(f"локально: {str(e)[:320]}")
        if mode == "local":
            raise HTTPException(
                status_code=502,
                detail="Локальное распознавание не удалось. "
                + " ".join(tried)
                + " Нужны: зависимости backend (dev.bat или pip install -r requirements.txt), достаточно RAM; "
                "первый запуск скачивает модель.",
            )

    if mode in ("auto", "openai"):
        if not api_key:
            if mode == "openai":
                raise HTTPException(
                    status_code=503,
                    detail="Режим openai: задайте API-ключ OpenAI в настройках приложения или OPENAI_API_KEY в .env.",
                )
            raise HTTPException(
                status_code=503,
                detail=(
                    "Локальное распознавание недоступно, а ключа OpenAI нет. "
                    + (" ".join(tried) + " " if tried else "")
                    + "Бесплатный путь: запустите dev.bat из корня проекта (или pip install -r requirements.txt в backend). "
                    "Первый запуск скачает модель Whisper (см. ASSISTANT_WHISPER_LOCAL_MODEL в .env).",
                ),
            )
        try:
            text = await _whisper_transcribe_bytes(raw, api_key, language)
        except Exception as e:
            raise HTTPException(
                status_code=502,
                detail=f"OpenAI Whisper: {str(e)[:400]}",
            ) from e
        if not text:
            raise HTTPException(
                status_code=422,
                detail="Пустая расшифровка (OpenAI) — повторите запись громче",
            )
        if looks_like_whisper_hallucination(text):
            raise HTTPException(status_code=422, detail=hallucination_user_hint())
        return AssistantTranscribeResponse(text=text)


@router.get("/tts/voices")
async def tts_voices(lang: str = Query(default="ru")):
    """Список доступных голосов Silero для данного языка."""
    from ..services.silero_tts import SILERO_VOICES, DEFAULT_VOICE

    lang = lang.lower()[:2]
    voices = SILERO_VOICES.get(lang, SILERO_VOICES["ru"])
    default = DEFAULT_VOICE.get(lang, voices[0])
    return {"voices": voices, "default": default}


@router.get("/tts")
async def tts_synthesize(
    text: str = Query(..., max_length=800),
    speaker: str = Query(default="kseniya"),
    lang: str = Query(default="ru"),
):
    """Синтез речи через Silero TTS. Возвращает WAV-аудио."""
    text = text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Пустой текст")

    from ..services.silero_tts import SILERO_VOICES, synthesize_wav

    lang = lang.lower()[:2]
    allowed = SILERO_VOICES.get(lang, SILERO_VOICES["ru"])
    if speaker not in allowed:
        speaker = allowed[0]

    try:
        wav_bytes = await asyncio.to_thread(synthesize_wav, text, speaker, lang)
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Silero TTS: {str(e)[:300]}. Убедитесь что установлен torch: pip install torch --index-url https://download.pytorch.org/whl/cpu",
        ) from e

    return Response(content=wav_bytes, media_type="audio/wav")


@router.post("/chat", response_model=LocalAssistantChatResponse)
async def assistant_chat(
    body: LocalAssistantChatRequest,
    db: AsyncSession = Depends(get_db),
):
    base = (config.ollama_base_url or "").strip()
    chat_model = (config.ollama_chat_model or "").strip()
    vision_model = (config.ollama_vision_model or "").strip()
    embed_model = (config.ollama_embed_model or "").strip()
    if not base or (not chat_model and not vision_model):
        raise HTTPException(
            status_code=503,
            detail="Ollama не настроен: OLLAMA_BASE_URL и модели в .env",
        )

    img = _strip_data_url(body.image_base64 or "")
    use_vision = bool(img)
    model = (vision_model if use_vision else chat_model).strip()
    if not model:
        raise HTTPException(
            status_code=503,
            detail="Нужна OLLAMA_VISION_MODEL для ответа со скрином или OLLAMA_CHAT_MODEL для текста",
        )

    ctx_block = _ctx_block(body)
    system = _build_system(vision=use_vision)
    if ctx_block:
        system = system + "\n\nДополнительный контекст:\n" + ctx_block

    new_content = (body.content or "").strip()
    if new_content and embed_model:
        qv = await try_embed_query(base, embed_model, new_content)
        mem = await retrieve_memory_block(
            db,
            query=new_content,
            query_vec=qv,
            top_k=config.assistant_memory_top_k,
            scan=config.assistant_memory_scan_chunks,
            floor=config.assistant_memory_similarity_floor,
        )
        if mem:
            system = system + "\n\n" + mem

    messages: list[dict] = [{"role": "system", "content": system}]
    user_line_for_persist: str | None = None

    if new_content:
        user_line_for_persist = new_content[:12000]
        hist_limit = max(4, config.assistant_max_history_messages)
        hist_rows = await _load_history_rows(db, hist_limit)
        for r in hist_rows:
            if r.role not in ("user", "assistant"):
                continue
            messages.append({"role": r.role, "content": (r.content or "")[:12000]})
        entry: dict = {"role": "user", "content": user_line_for_persist}
        if use_vision:
            entry["images"] = [img]
        messages.append(entry)
    else:
        if not body.messages:
            raise HTTPException(status_code=400, detail="messages пуст")
        hist = body.messages[-24:]
        last = hist[-1]
        if last.role != "user":
            raise HTTPException(
                status_code=400,
                detail="Последнее сообщение должно быть от пользователя",
            )
        user_line_for_persist = (last.content or "")[:12000]
        for i, m in enumerate(hist):
            role = m.role if m.role in ("user", "assistant", "system") else "user"
            content = (m.content or "")[:12000]
            entry = {"role": role, "content": content}
            is_last = i == len(hist) - 1
            if use_vision and is_last and role == "user":
                entry["images"] = [img]
            messages.append(entry)

    try:
        _np = int(getattr(config, "ollama_assistant_num_predict", 320) or 0)
        reply = await ollama_chat(
            base_url=base,
            model=model,
            messages=messages,
            temperature=config.ollama_temperature,
            json_format=False,
            timeout_sec=180.0 if use_vision else 120.0,
            num_predict=_np if _np > 0 else None,
        )
        text = sanitize_reply_for_ui_language(reply.strip(), config.language)
        if new_content and user_line_for_persist is not None and body.persist:
            await _append_exchange(db, user_line_for_persist, text, True)
            if embed_model:
                await index_exchange(
                    db,
                    base_url=base,
                    embed_model=embed_model,
                    chat_model=chat_model,
                    user_text=user_line_for_persist,
                    assistant_text=text,
                    temperature=config.ollama_temperature,
                )
        return LocalAssistantChatResponse(reply=text, model=model)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=json.dumps({"error": ollama_error_detail(e)}, ensure_ascii=False),
        ) from e
