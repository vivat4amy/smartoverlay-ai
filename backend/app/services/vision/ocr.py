"""OCR-сервис — извлечение текста из изображений через Tesseract.
Опциональный: работает только если Tesseract установлен.
"""

from PIL import Image, ImageOps

_tesseract_available = False
try:
    import pytesseract
    _tesseract_available = True
except ImportError:
    pass


def _preprocess(img: Image.Image) -> Image.Image:
    gray = ImageOps.grayscale(img)
    return ImageOps.autocontrast(gray)


def extract_text(img: Image.Image, lang: str = "eng+rus") -> str:
    if not _tesseract_available:
        return ""
    try:
        pre = _preprocess(img)
        text: str = pytesseract.image_to_string(pre, lang=lang)
        return text.strip()
    except Exception:
        return ""


def is_available() -> bool:
    return _tesseract_available
