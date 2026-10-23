"""Thin PostgREST client.

Every user-data call carries the END USER'S access token in Authorization, so the
request executes as that user and row-level security governs visibility. The service
never substitutes the service-role key on the request path — that key is reserved for
the offline curated-KB ingest (see ingest/exercise_kb.py), which touches no user data.
"""

from __future__ import annotations

from typing import Any

import httpx
from fastapi import HTTPException

from .config import get_settings


def format_vector(embedding: list[float]) -> str:
    """pgvector literal. PostgREST passes this text to a `vector(768)` RPC argument,
    which Postgres casts — the array-param form is unreliable, the string form isn't."""
    return "[" + ",".join(f"{x:.8f}" for x in embedding) + "]"


def _headers(user_jwt: str) -> dict[str, str]:
    settings = get_settings()
    return {
        "apikey": settings.supabase_anon_key,  # identifies the project / API gateway
        "Authorization": f"Bearer {user_jwt}",  # identifies the USER → drives RLS
        "Content-Type": "application/json",
    }


async def rpc(
    fn: str,
    params: dict[str, Any],
    user_jwt: str,
    client: httpx.AsyncClient | None = None,
) -> Any:
    """Call a Postgres function via PostgREST as the forwarded user."""
    settings = get_settings()
    url = f"{settings.rest_url}/rpc/{fn}"

    owns = client is None
    client = client or httpx.AsyncClient(timeout=30)
    try:
        res = await client.post(url, json=params, headers=_headers(user_jwt))
    finally:
        if owns:
            await client.aclose()

    if res.status_code in (401, 403):
        # RLS / auth rejection — surface as an auth error, not a 500.
        raise HTTPException(status_code=401, detail="Supabase rejected the user token")
    if not res.is_success:
        raise HTTPException(status_code=502, detail=f"Supabase {res.status_code}: {res.text[:200]}")
    return res.json()


async def match_exercise_kb(
    query_embedding: list[float],
    match_count: int,
    filter_muscle: str | None,
    user_jwt: str,
    client: httpx.AsyncClient | None = None,
) -> list[dict]:
    return await rpc(
        "match_exercise_kb",
        {
            "query_embedding": format_vector(query_embedding),
            "match_count": match_count,
            "filter_muscle": filter_muscle,
        },
        user_jwt,
        client,
    )


async def match_user_memories(
    query_embedding: list[float],
    match_count: int,
    filter_kind: str | None,
    user_jwt: str,
    client: httpx.AsyncClient | None = None,
) -> list[dict]:
    return await rpc(
        "match_user_memories",
        {
            "query_embedding": format_vector(query_embedding),
            "match_count": match_count,
            "filter_kind": filter_kind,
        },
        user_jwt,
        client,
    )


async def upsert_user_memory(
    kind: str,
    content: str,
    embedding: list[float],
    metadata: dict,
    dedupe_key: str | None,
    user_jwt: str,
    client: httpx.AsyncClient | None = None,
) -> str:
    return await rpc(
        "upsert_user_memory",
        {
            "p_kind": kind,
            "p_content": content,
            "p_embedding": format_vector(embedding),
            "p_metadata": metadata,
            "p_dedupe_key": dedupe_key,
        },
        user_jwt,
        client,
    )
