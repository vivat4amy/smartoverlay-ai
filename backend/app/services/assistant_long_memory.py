"""Долговременная память ассистента: эмбеддинги Ollama + семантический отбор + факты."""

from __future__ import annotations

import json
import math
import re
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import config
from ..models.assistant_memory_chunk import AssistantMemoryChunk
from .ollama_client import ollama_chat, ollama_embed

USER_ID = 1
MAX_CHUNKS = 2200


def cosine_similarity(a: list[float], b: list[float]) -> float:
    if len(a) != len(b) or not a:
        return 0.0
    dot = 0.0
    na = 0.0
    nb = 0.0
    for x, y in zip(a, b, strict=True):
        dot += x * y
        na += x * x
        nb += y * y
    na = math.sqrt(na)
    nb = math.sqrt(nb)
    if na < 1e-12 or nb < 1e-12:
        return 0.0
    return dot / (na * nb)


def _parse_json_facts(raw: str) -> list[str]:
    s = (raw or "").strip()
    if not s:
        return []
    if s.startswith("```"):
        s = re.sub(r"^```[a-zA-Z]*\n?", "", s)
        s = re.sub(r"\n?```\s*$", "", s).strip()
    try:
        data: Any = json.loads(s)
    except json.JSONDecodeError:
        return []
    out: list[str] = []
    if isinstance(data, list):
        for x in data:
            if isinstance(x, str) and x.strip():
                out.append(x.strip()[:500])
    elif isinstance(data, dict):
        arr = data.get("facts") or data.get("items") or data.get("result")
        if isinstance(arr, list):
            for x in arr:
                if isinstance(x, str) and x.strip():
                    out.append(x.strip()[:500])
    return out[:6]


async def extract_facts_with_ollama(
    *,
    base_url: str,
    chat_model: str,
    user_text: str,
    assistant_text: str,
    temperature: float,
) -> list[str]:
    system = (
        "Из последнего обмена репликами выдели только устойчивые факты о пользователе или его планах "
        "(стек, проекты, предпочтения). 0–5 коротких строк по-русски. "
        "Ответ строго JSON-массив строк. Без комментариев. Если нечего сохранить — []."
    )
    user_block = (
        f"USER:\n{(user_text or '')[:3500]}\n\nASSISTANT:\n{(assistant_text or '')[:3500]}"
    )
    raw = await ollama_chat(
        base_url=base_url,
        model=chat_model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user_block},
        ],
        temperature=max(0.1, min(temperature, 0.45)),
        json_format=True,
        timeout_sec=90.0,
    )
    return _parse_json_facts(raw)


async def retrieve_memory_block(
    db: AsyncSession,
    *,
    query: str,
    query_vec: list[float] | None,
    top_k: int,
    scan: int,
    floor: float,
) -> str:
    if not query_vec or not (query or "").strip():
        return ""
    lim = max(100, min(scan, 2000))
    r = await db.execute(
        select(AssistantMemoryChunk)
        .where(AssistantMemoryChunk.user_id == USER_ID)
        .order_by(AssistantMemoryChunk.id.desc())
        .limit(lim),
    )
    rows = list(r.scalars().all())
    scored: list[tuple[float, str, str]] = []
    for row in rows:
        try:
            vec = json.loads(row.embedding_json)
            if not isinstance(vec, list) or len(vec) != len(query_vec):
                continue
            vf = [float(x) for x in vec]
            s = cosine_similarity(query_vec, vf)
            scored.append((s, row.text, row.kind))
        except (json.JSONDecodeError, TypeError, ValueError):
            continue
    scored.sort(key=lambda x: x[0], reverse=True)
    picked = [x for x in scored[:top_k] if x[0] >= floor]
    if not picked:
        picked = [x for x in scored[: max(3, top_k // 2)] if x[0] >= 0.05]
    if not picked:
        return ""
    lines: list[str] = []
    for _s, text, kind in picked:
        label = "факт" if kind == "fact" else "фрагмент"
        snippet = (text or "").replace("\n", " ").strip()[:700]
        if len(snippet) < 4:
            continue
        lines.append(f"- [{label}] {snippet}")
    if not lines:
        return ""
    return (
        "## Долговременная память (подобрано по смыслу к текущему сообщению)\n"
        + "\n".join(lines)
        + "\n\nИспользуй как справку; если не по теме — не навязывай."
    )


async def prune_memory_chunks(db: AsyncSession) -> None:
    sub = (
        select(AssistantMemoryChunk.id)
        .where(AssistantMemoryChunk.user_id == USER_ID)
        .order_by(AssistantMemoryChunk.id.desc())
        .offset(MAX_CHUNKS - 1)
        .limit(1)
    )
    res = await db.execute(sub)
    cid = res.scalar_one_or_none()
    if cid is None:
        return
    await db.execute(
        delete(AssistantMemoryChunk).where(
            AssistantMemoryChunk.user_id == USER_ID,
            AssistantMemoryChunk.id < cid,
        ),
    )
    await db.commit()


async def index_exchange(
    db: AsyncSession,
    *,
    base_url: str,
    embed_model: str,
    chat_model: str,
    user_text: str,
    assistant_text: str,
    temperature: float,
) -> None:
    turn = (
        f"USER:\n{(user_text or '')[:4000]}\n\nASSISTANT:\n{(assistant_text or '')[:4000]}"
    )
    try:
        emb = await ollama_embed(
            base_url=base_url,
            model=embed_model,
            prompt=turn[:8000],
        )
        db.add(
            AssistantMemoryChunk(
                user_id=USER_ID,
                kind="turn",
                text=turn[:12000],
                embedding_json=json.dumps(emb),
            ),
        )
        await db.commit()
    except Exception:
        await db.rollback()

    facts: list[str] = []
    try:
        facts = await extract_facts_with_ollama(
            base_url=base_url,
            chat_model=chat_model,
            user_text=user_text,
            assistant_text=assistant_text,
            temperature=temperature,
        )
    except Exception:
        facts = []

    for fact in facts:
        ft = fact.strip()
        if len(ft) < 4:
            continue
        try:
            embf = await ollama_embed(
                base_url=base_url,
                model=embed_model,
                prompt=ft[:2000],
            )
            db.add(
                AssistantMemoryChunk(
                    user_id=USER_ID,
                    kind="fact",
                    text=ft[:2000],
                    embedding_json=json.dumps(embf),
                ),
            )
        except Exception:
            continue
    try:
        await db.commit()
    except Exception:
        await db.rollback()

    await prune_memory_chunks(db)


async def try_embed_query(
    base_url: str,
    embed_model: str,
    text: str,
) -> list[float] | None:
    m = (embed_model or "").strip()
    if not m:
        return None
    try:
        return await ollama_embed(
            base_url=base_url,
            model=m,
            prompt=text[:8000],
            timeout_sec=45.0,
        )
    except Exception:
        return None
