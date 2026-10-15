"""GPT-4o Vision провайдер — облачный анализ через OpenAI API.
Требует OPENAI_API_KEY в .env или в настройках пользователя.
"""

import base64
import io
import json
import uuid

from PIL import Image
from .base import VisionProvider
from .json_analysis_prompt import VISION_JSON_SYSTEM_PROMPT
from ...schemas.vision import AnalysisResult, EntityInfo


def _rgb_without_metadata(image: Image.Image) -> Image.Image:
    rgb = image.convert("RGB")
    return Image.frombytes("RGB", rgb.size, rgb.tobytes())


def _resize_for_vision(image: Image.Image, max_side: int = 1024) -> Image.Image:
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


class GPT4oVisionProvider(VisionProvider):
    def __init__(self, api_key: str | None = None, model: str | None = None):
        from ...config import config
        self.api_key = (api_key or config.openai_api_key or "").strip()
        self.model = model or config.openai_model
        self.temperature = config.openai_temperature

    @property
    def name(self) -> str:
        return "gpt4o"

    async def analyze(self, image: Image.Image) -> AnalysisResult:
        if not self.api_key:
            return AnalysisResult(
                category="general",
                title="API ключ OpenAI не настроен",
                confidence=0.0,
                detected_objects=[],
                text_content=(
                    "Откройте Настройки → AI Vision провайдер и добавьте "
                    "ваш OPENAI_API_KEY (sk-...)."
                ),
                metadata={"provider": "gpt4o", "error": "no_api_key"},
            )

        try:
            from openai import AsyncOpenAI
        except ImportError:
            return AnalysisResult(
                category="general",
                title="Пакет openai не установлен",
                confidence=0.0,
                detected_objects=[],
                text_content="Установите: pip install openai",
                metadata={"provider": "gpt4o", "error": "import_error"},
            )

        try:
            client = AsyncOpenAI(api_key=self.api_key)

            small = _resize_for_vision(_rgb_without_metadata(image))
            buf = io.BytesIO()
            small.save(buf, format="JPEG", quality=85, subsampling=2)
            b64 = base64.b64encode(buf.getvalue()).decode()

            response = await client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": VISION_JSON_SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/jpeg;base64,{b64}",
                                    "detail": "high",
                                },
                            },
                            {
                                "type": "text",
                                "text": "Проанализируй этот скриншот.",
                            },
                        ],
                    },
                ],
                temperature=self.temperature,
                max_tokens=1500,
                response_format={"type": "json_object"},
            )

            content = (response.choices[0].message.content or "{}").strip()
            if content.startswith("```"):
                content = content.split("\n", 1)[1].rsplit("```", 1)[0]

            data = json.loads(content)

            usage = getattr(response, "usage", None)
            usage_meta = (
                {
                    "prompt_tokens": usage.prompt_tokens,
                    "completion_tokens": usage.completion_tokens,
                    "total_tokens": usage.total_tokens,
                }
                if usage
                else {}
            )

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
                confidence=float(data.get("confidence", 0.85)),
                detected_objects=data.get("detected_objects", []) or [],
                text_content=data.get("text_content", "") or "",
                entity=entity,
                metadata={
                    "provider": "gpt4o",
                    "model": self.model,
                    "request_id": str(uuid.uuid4()),
                    **usage_meta,
                },
            )

        except json.JSONDecodeError as e:
            return AnalysisResult(
                category="general",
                title="Ошибка парсинга ответа GPT-4o",
                confidence=0.5,
                detected_objects=[],
                text_content=str(e)[:200],
                metadata={"provider": "gpt4o", "error": "json_parse_error"},
            )
        except Exception as e:
            err_type = type(e).__name__
            return AnalysisResult(
                category="general",
                title=f"Ошибка GPT-4o ({err_type})",
                confidence=0.0,
                detected_objects=[],
                text_content=str(e)[:240],
                metadata={"provider": "gpt4o", "error": err_type},
            )
