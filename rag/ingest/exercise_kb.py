"""Ingest the curated exercise knowledge base into Supabase (one-time / on update).

    python -m ingest.exercise_kb

This is the ONLY place the service-role key is used: exercise_kb holds shared,
curated, non-user data, so there is no per-user token to forward. Each chunk is
embedded with task type RETRIEVAL_DOCUMENT and upserted by `slug`.

Run from the `rag/` directory with the service's .env populated (needs
SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY).
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

import httpx

from app import gemini
from app.config import get_settings
from app.supabase import format_vector

DATA = Path(__file__).parent / "data" / "exercise_kb.json"


async def _upsert_batch(rows: list[dict], client: httpx.AsyncClient) -> None:
    settings = get_settings()
    if not settings.supabase_service_role_key:
        sys.exit("SUPABASE_SERVICE_ROLE_KEY is required to ingest the curated KB.")

    url = f"{settings.rest_url}/exercise_kb?on_conflict=slug"
    headers = {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    res = await client.post(url, json=rows, headers=headers)
    if not res.is_success:
        sys.exit(f"Upsert failed {res.status_code}: {res.text[:300]}")


async def main() -> None:
    chunks = json.loads(DATA.read_text())
    print(f"Embedding {len(chunks)} curated chunks with text-embedding-004 …")

    async with httpx.AsyncClient(timeout=60) as client:
        rows: list[dict] = []
        for c in chunks:
            vec = await gemini.embed(c["content"], task_type="RETRIEVAL_DOCUMENT", client=client)
            rows.append(
                {
                    "slug": c["slug"],
                    "title": c["title"],
                    "section": c.get("section"),
                    "muscle_group": c.get("muscle_group"),
                    "content": c["content"],
                    "source": c.get("source"),
                    "embedding": format_vector(vec),
                }
            )
            print(f"  ✓ {c['slug']}")

        await _upsert_batch(rows, client)

    print(f"Done — upserted {len(rows)} rows into exercise_kb.")


if __name__ == "__main__":
    asyncio.run(main())
