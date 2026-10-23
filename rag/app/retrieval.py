"""Retrieval orchestration: embed the query once, fan out to both stores, filter."""

from __future__ import annotations

import asyncio

import httpx

from . import gemini, supabase
from .config import get_settings
from .schemas import KBSource, MemorySource, RetrievedContext


def _above_threshold(rows: list[dict], min_sim: float) -> list[dict]:
    return [r for r in rows if float(r.get("similarity", 0)) >= min_sim]


async def retrieve(
    query: str,
    user_jwt: str,
    muscle_group: str | None = None,
    kb_k: int | None = None,
    memory_k: int | None = None,
    client: httpx.AsyncClient | None = None,
) -> RetrievedContext:
    """Embed `query` (as a retrieval query) and pull curated KB + the caller's memories.

    The two Supabase calls run under the user's JWT, so `match_user_memories` can only
    ever return rows RLS exposes to this user.
    """
    settings = get_settings()
    kb_k = kb_k or settings.kb_top_k
    memory_k = memory_k or settings.memory_top_k

    owns = client is None
    client = client or httpx.AsyncClient(timeout=30)
    try:
        query_vec = await gemini.embed(query, task_type="RETRIEVAL_QUERY", client=client)

        kb_rows, mem_rows = await asyncio.gather(
            supabase.match_exercise_kb(query_vec, kb_k, muscle_group, user_jwt, client),
            supabase.match_user_memories(query_vec, memory_k, None, user_jwt, client),
        )
    finally:
        if owns:
            await client.aclose()

    kb_rows = _above_threshold(kb_rows or [], settings.min_similarity)
    mem_rows = _above_threshold(mem_rows or [], settings.min_similarity)

    return RetrievedContext(
        kb=[KBSource(**r) for r in kb_rows],
        memories=[MemorySource(**{**r, "id": str(r["id"]), "created_at": r.get("created_at")}) for r in mem_rows],
    )
