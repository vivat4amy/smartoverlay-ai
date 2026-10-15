"""Анализ скриншота через локальный Ollama (VLM). Без облака и API-ключей."""

import base64
import io
import json
import uuid

from PIL import Image

from .base import VisionProvider
from .json_analysis_prompt import VISION_JSON_SYSTEM_PROMPT
from ...schemas.vision import AnalysisResult, EntityInfo
from ..ollama_client import ollama_chat, ollama_error_detail


def _rgb_without_metadata(image: Image.Image) -> Image.Image:
    rgb = image.convert("RGB")
    return Image.frombytes("RGB", rgb.size, rgb.tobytes())


def _resize_for_vision(image: Image.Image, max_side: int) -> Image.Image:
    w, h = image.size
    if max(w, h) <= max_side:
        return image
    if w >= h:
        new_w = max_side
        new_h = int(h * (max_side / w))
    else:
        new_h = max_side
        new_w = int(w * (max_side / h))
    return image.resize((new_w, new_h), Image.LANCZOS)


class OllamaVisionProvider(VisionProvider):
    def __init__(
        self,
        base_url: str | None = None,
        model: str | None = None,
        temperature: float | None = None,
    ):
        from ...config import config

        self.base_url = (base_url or config.ollama_base_url or "").strip()
        self.model = (model or config.ollama_vision_model or "llava").strip()
        self.temperature = (
            temperature if temperature is not None else config.ollama_temperature
        )
        self._max_side = max(512, min(int(config.ollama_vision_max_side or 1536), 2560))
        self._jpeg_q = max(60, min(int(config.ollama_vision_jpeg_quality or 92), 98))
        sub = int(config.ollama_vision_jpeg_subsampling)
        self._jpeg_sub = sub if sub in (0, 1, 2) else 0

    @property
    def name(self) -> str:
        return "ollama"

    async def analyze(self, image: Image.Image) -> AnalysisResult:
        if not self.base_url:
            return AnalysisResult(
                category="general",
                title="Ollama URL не задан",
                confidence=0.0,
                detected_objects=[],
                text_content="Укажите OLLAMA_BASE_URL в .env (например http://127.0.0.1:11434).",
                metadata={"provider": "ollama", "error": "no_base_url"},
            )

        small = _resize_for_vision(_rgb_without_metadata(image), self._max_side)
        buf = io.BytesIO()
        small.save(
            buf,
            format="JPEG",
            quality=self._jpeg_q,
            subsampling=self._jpeg_sub,
        )
        b64 = base64.b64encode(buf.getvalue()).decode()

        messages = [
            {"role": "system", "content": VISION_JSON_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": "Проанализируй этот скриншот. Ответь только одним JSON-объектом.",
                "images": [b64],
            },
        ]

        try:
            content = await ollama_chat(
                base_url=self.base_url,
                model=self.model,
                messages=messages,
                temperature=self.temperature,
                json_format=True,
                timeout_sec=240.0,
            )
            if content.startswith("```"):
                content = content.split("\n", 1)[1].rsplit("```", 1)[0].strip()

            data = json.loads(content)

            entity_data = data.get("entity") or {}
            entity = None
            if entity_data and isinstance(entity_data, dict):
                entity = EntityInfo(
                    type=entity_data.get("type"),
                    name=entity_data.get("name"),
                    artist=entity_data.get("artist"),
                    track=entity_data.get("track"),
                    album=entity_data.get("album"),
                    game_title=entity_data.get("game_title"),
                    video_title=entity_data.get("video_title"),
                    channel=entity_data.get("channel"),
                    platform=entity_data.get("platform"),
                    language=entity_data.get("language"),
                    framework=entity_data.get("framework"),
                    url=entity_data.get("url"),
                    site_name=entity_data.get("site_name"),
                )

            return AnalysisResult(
                category=data.get("category", "general"),
                title=data.get("title", "Анализ завершён"),
                confidence=float(data.get("confidence", 0.75)),
                detected_objects=data.get("detected_objects", []) or [],
                text_content=data.get("text_content", "") or "",
                entity=entity,
                metadata={
                    "provider": "ollama",
                    "model": self.model,
                    "request_id": str(uuid.uuid4()),
                },
            )
        except json.JSONDecodeError as e:
            return AnalysisResult(
                category="general",
                title="Ошибка парсинга JSON (Ollama)",
                confidence=0.4,
                detected_objects=[],
                text_content=str(e)[:200],
                metadata={"provider": "ollama", "error": "json_parse_error"},
            )
        except Exception as e:
            err = type(e).__name__
            return AnalysisResult(
                category="general",
                title=f"Ollama недоступен ({err})",
                confidence=0.0,
                detected_objects=[],
                text_content=ollama_error_detail(e),
                metadata={"provider": "ollama", "error": err},
            )
