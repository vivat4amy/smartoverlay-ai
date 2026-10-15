"""Гибридный провайдер — CLIP для быстрой классификации,
GPT-4o для детального анализа при смене контекста или по запросу.
"""

import uuid
from PIL import Image
from .base import VisionProvider
from ...schemas.vision import AnalysisResult

_last_category: str | None = None


class HybridProvider(VisionProvider):
    def __init__(self, api_key: str | None = None, model: str | None = None):
        self._api_key = api_key
        self._model = model
        self._clip = None
        self._gpt4o = None

    def _get_clip(self):
        if self._clip is None:
            from .clip import CLIPProvider
            self._clip = CLIPProvider()
        return self._clip

    def _get_gpt4o(self):
        if self._gpt4o is None:
            from .gpt4o import GPT4oVisionProvider
            self._gpt4o = GPT4oVisionProvider(api_key=self._api_key, model=self._model)
        return self._gpt4o

    @property
    def name(self) -> str:
        return "hybrid"

    async def analyze(self, image: Image.Image) -> AnalysisResult:
        global _last_category

        try:
            clip_result = await self._get_clip().analyze(image)
        except Exception:
            clip_result = AnalysisResult(
                category="general",
                title="CLIP недоступен",
                confidence=0.5,
                detected_objects=[],
                text_content="",
                metadata={"provider": "hybrid", "error": "clip_failed"},
            )

        context_changed = _last_category is not None and clip_result.category != _last_category
        _last_category = clip_result.category

        use_gpt4o = context_changed and clip_result.confidence < 0.7

        if use_gpt4o:
            try:
                gpt_result = await self._get_gpt4o().analyze(image)
                if gpt_result.confidence > 0:
                    gpt_result.metadata["provider"] = "hybrid(gpt4o)"
                    gpt_result.metadata["clip_category"] = clip_result.category
                    gpt_result.metadata["clip_confidence"] = clip_result.confidence
                    return gpt_result
            except Exception:
                pass

        clip_result.metadata["provider"] = "hybrid(clip)"
        clip_result.metadata["context_changed"] = context_changed
        clip_result.metadata["request_id"] = str(uuid.uuid4())
        return clip_result
