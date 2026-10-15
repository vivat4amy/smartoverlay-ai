from pydantic_settings import BaseSettings
from pathlib import Path


class AppConfig(BaseSettings):
    openai_api_key: str = ""
    openai_model: str = "gpt-4o"
    openai_temperature: float = 0.5
    vision_provider: str = "gpt4o"
    language: str = "ru"
    overlay_opacity: float = 0.9
    capture_interval_sec: int = 4
    db_path: str = "data/smartoverlay.db"
    rawg_api_key: str = ""
    tmdb_api_key: str = ""
    host: str = "127.0.0.1"
    port: int = 18321

    audd_api_token: str = ""
    music_listener_enabled: bool = True
    music_listener_interval_sec: float = 30.0
    music_listener_capture_sec: float = 10.0
    music_listener_silence_rms: float = 0.002

    # Локальный Ollama (https://ollama.com) — без облачных API.
    # Дефолты — лёгкие для слабого железа: moondream (~1.7 ГБ, ~2–3 ГБ RAM).
    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_vision_model: str = "moondream"
    ollama_chat_model: str = "moondream"
    ollama_temperature: float = 0.35
    # Лимит длины ответа ассистента (токены Ollama); меньше — короче ответы.
    ollama_assistant_num_predict: int = 320
    # Качество кадра для Ollama Vision (мелкий текст / UI): больше max_side и quality — тяжелее по VRAM и времени.
    ollama_vision_max_side: int = 1536
    ollama_vision_jpeg_quality: int = 92
    ollama_vision_jpeg_subsampling: int = 0
    # Embeddings для долговременной памяти (ollama pull nomic-embed-text)
    ollama_embed_model: str = "nomic-embed-text"
    assistant_memory_top_k: int = 6
    assistant_memory_scan_chunks: int = 900
    assistant_memory_similarity_floor: float = 0.12
    assistant_max_history_messages: int = 28
    # Голос → текст: auto (сначала локальный Whisper; при сбое — OpenAI, если есть ключ) | local | openai
    assistant_stt_mode: str = "auto"
    # Модель faster-whisper: tiny | base | small | medium (tiny — легче и быстрее для слабого железа)
    assistant_whisper_local_model: str = "tiny"

    model_config = {"env_file": ".env", "extra": "ignore"}


config = AppConfig()

db_dir = Path(config.db_path).parent
db_dir.mkdir(parents=True, exist_ok=True)
