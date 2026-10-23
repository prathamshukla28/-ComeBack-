"""Gemini REST clients: embeddings (text-embedding-004) and chat (generateContent).

Kept dependency-free (httpx only) so the embedding task-type and request shape are
explicit — the same Generative Language API the mobile app's lib/gemini.ts talks to.
"""

from __future__ import annotations

from typing import Literal

import httpx
from fastapi import HTTPException

from .config import EMBEDDING_DIM, get_settings

BASE = "https://generativelanguage.googleapis.com/v1beta"

# task_type materially changes embedding quality for retrieval: documents and
# queries are embedded into aligned-but-distinct subspaces.
EmbedTaskType = Literal["RETRIEVAL_DOCUMENT", "RETRIEVAL_QUERY"]


def _raise_for_gemini(res: httpx.Response) -> None:
    if res.is_success:
        return
    body = res.text[:200]
    if res.status_code in (401, 403):
        raise HTTPException(status_code=502, detail="Gemini auth failed — check GEMINI_API_KEY")
    if res.status_code == 429:
        raise HTTPException(status_code=429, detail="Gemini rate limit hit")
    raise HTTPException(status_code=502, detail=f"Gemini {res.status_code}: {body}")


async def embed(
    text: str,
    task_type: EmbedTaskType,
    client: httpx.AsyncClient | None = None,
) -> list[float]:
    """Return a 768-dim embedding for `text`."""
    settings = get_settings()
    model = settings.gemini_embed_model
    url = f"{BASE}/models/{model}:embedContent"
    payload = {
        "model": f"models/{model}",
        "content": {"parts": [{"text": text}]},
        "taskType": task_type,
    }
    headers = {"Content-Type": "application/json", "x-goog-api-key": settings.gemini_api_key}

    owns = client is None
    client = client or httpx.AsyncClient(timeout=30)
    try:
        res = await client.post(url, json=payload, headers=headers)
        _raise_for_gemini(res)
        values = (res.json().get("embedding") or {}).get("values") or []
    finally:
        if owns:
            await client.aclose()

    if len(values) != EMBEDDING_DIM:
        raise HTTPException(
            status_code=502,
            detail=f"Expected {EMBEDDING_DIM}-dim embedding, got {len(values)}",
        )
    return [float(v) for v in values]


async def generate(
    system_prompt: str,
    user_message: str,
    client: httpx.AsyncClient | None = None,
) -> str:
    """Single-turn grounded generation."""
    settings = get_settings()
    model = settings.gemini_chat_model
    url = f"{BASE}/models/{model}:generateContent"
    payload = {
        "systemInstruction": {"parts": [{"text": system_prompt}]},
        "contents": [{"role": "user", "parts": [{"text": user_message}]}],
        "generationConfig": {"temperature": 0.6, "maxOutputTokens": 2048},
    }
    headers = {"Content-Type": "application/json", "x-goog-api-key": settings.gemini_api_key}

    owns = client is None
    client = client or httpx.AsyncClient(timeout=60)
    try:
        res = await client.post(url, json=payload, headers=headers)
        _raise_for_gemini(res)
        data = res.json()
    finally:
        if owns:
            await client.aclose()

    parts = (data.get("candidates") or [{}])[0].get("content", {}).get("parts", [])
    text = "".join(p.get("text", "") for p in parts).strip()
    if not text:
        raise HTTPException(status_code=502, detail="Empty response from Gemini")
    return text
