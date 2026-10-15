"""HTTP-клиент к локальному Ollama (бесплатный inference на своём ПК)."""

from __future__ import annotations

from typing import Any

import httpx


async def ollama_chat(
    *,
    base_url: str,
    model: str,
    messages: list[dict[str, Any]],
    temperature: float = 0.3,
    json_format: bool = False,
    timeout_sec: float = 180.0,
    num_predict: int | None = None,
) -> str:
    """
    POST /api/chat, stream=false.
    Для vision: в сообщении user добавьте "images": ["<raw base64 без data:>"].
    """
    url = base_url.rstrip("/") + "/api/chat"
    body: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "stream": False,
        "options": {"temperature": temperature},
    }
    if num_predict is not None and num_predict > 0:
        body["options"]["num_predict"] = int(num_predict)
    if json_format:
        body["format"] = "json"

    async with httpx.AsyncClient(timeout=timeout_sec) as client:
        r = await client.post(url, json=body)
        r.raise_for_status()
        data = r.json()

    msg = data.get("message") or {}
    return (msg.get("content") or "").strip()


async def ollama_embed(
    *,
    base_url: str,
    model: str,
    prompt: str,
    timeout_sec: float = 90.0,
) -> list[float]:
    """POST /api/embeddings — для RAG-памяти (например nomic-embed-text)."""
    url = base_url.rstrip("/") + "/api/embeddings"
    body: dict[str, Any] = {"model": model, "prompt": (prompt or "")[:8000]}
    async with httpx.AsyncClient(timeout=timeout_sec) as client:
        r = await client.post(url, json=body)
        r.raise_for_status()
        data = r.json()
    emb = data.get("embedding")
    if not isinstance(emb, list):
        raise ValueError("ollama: в ответе нет embedding")
    return [float(x) for x in emb]


def ollama_error_detail(exc: BaseException) -> str:
    if isinstance(exc, httpx.HTTPStatusError):
        try:
            return (exc.response.text or str(exc))[:500]
        except Exception:
            return str(exc)[:500]
    return str(exc)[:500]
