"""CLIP-провайдер — локальная классификация скриншотов.
Использует OpenCLIP для zero-shot классификации по категориям.
Установка: pip install open-clip-torch torch
"""

import uuid
from PIL import Image
from .base import VisionProvider
from ...schemas.vision import AnalysisResult

_CATEGORIES = [
    ("gaming", "a screenshot of a video game"),
    ("video", "a screenshot of a video player or streaming service"),
    ("music", "a screenshot of a music player or music streaming app"),
    ("coding", "a screenshot of a code editor or programming IDE"),
    ("social", "a screenshot of a messaging app or social media"),
    ("browsing", "a screenshot of a web browser with search results or articles"),
    ("documents", "a screenshot of a document editor or spreadsheet"),
]

_CATEGORY_TITLES = {
    "gaming": "Игра обнаружена",
    "video": "Видеоконтент",
    "music": "Музыкальный плеер",
    "coding": "Среда разработки",
    "social": "Мессенджер / соцсеть",
    "browsing": "Веб-браузер",
    "documents": "Документ",
}

_model = None
_preprocess = None
_tokenizer = None


def _load_model():
    global _model, _preprocess, _tokenizer
    if _model is not None:
        return

    try:
        import open_clip
        import torch

        model_name = "ViT-B-32"
        pretrained = "laion2b_s34b_b79k"

        _model, _, _preprocess = open_clip.create_model_and_transforms(
            model_name, pretrained=pretrained
        )
        _tokenizer = open_clip.get_tokenizer(model_name)
        _model.eval()

        if torch.cuda.is_available():
            _model = _model.cuda()
    except ImportError:
        raise RuntimeError(
            "CLIP не установлен. Выполните: pip install open-clip-torch torch"
        )


class CLIPProvider(VisionProvider):
    @property
    def name(self) -> str:
        return "clip"

    async def analyze(self, image: Image.Image) -> AnalysisResult:
        import torch

        _load_model()
        assert _model is not None and _preprocess is not None and _tokenizer is not None

        device = next(_model.parameters()).device

        img_tensor = _preprocess(image).unsqueeze(0).to(device)

        texts = [desc for _, desc in _CATEGORIES]
        text_tokens = _tokenizer(texts).to(device)

        with torch.no_grad():
            image_features = _model.encode_image(img_tensor)
            text_features = _model.encode_text(text_tokens)

            image_features /= image_features.norm(dim=-1, keepdim=True)
            text_features /= text_features.norm(dim=-1, keepdim=True)

            similarity = (image_features @ text_features.T).squeeze(0)
            probs = similarity.softmax(dim=0).cpu().numpy()

        best_idx = probs.argmax()
        category = _CATEGORIES[best_idx][0]
        confidence = float(probs[best_idx])

        top_3 = sorted(
            zip([c[0] for c in _CATEGORIES], probs),
            key=lambda x: x[1],
            reverse=True,
        )[:3]

        detected_objects = [f"{cat}: {score:.0%}" for cat, score in top_3]

        return AnalysisResult(
            category=category,
            title=_CATEGORY_TITLES.get(category, "Контент обнаружен"),
            confidence=confidence,
            detected_objects=detected_objects,
            text_content="",
            metadata={
                "provider": "clip",
                "model": "ViT-B-32",
                "request_id": str(uuid.uuid4()),
                "scores": {cat: float(score) for cat, score in top_3},
            },
        )
