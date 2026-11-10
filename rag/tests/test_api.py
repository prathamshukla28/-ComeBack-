"""End-to-end API tests with the network (Gemini + Supabase) mocked via respx."""

from __future__ import annotations

import httpx
import respx
from fastapi.testclient import TestClient

from app.config import EMBEDDING_DIM
from app.main import app
from tests.conftest import auth_user_route

client = TestClient(app)

GL = "https://generativelanguage.googleapis.com/v1beta"
REST = "https://test.supabase.co/rest/v1"


def _embed_route():
    return respx.post(url__regex=rf"{GL}/models/.*:embedContent").mock(
        return_value=httpx.Response(200, json={"embedding": {"values": [0.02] * EMBEDDING_DIM}})
    )


def _generate_route(text="Squat to depth. Based on [KB1], break parallel."):
    return respx.post(url__regex=rf"{GL}/models/.*:generateContent").mock(
        return_value=httpx.Response(
            200, json={"candidates": [{"content": {"parts": [{"text": text}]}}]}
        )
    )


KB_ROWS = [
    {
        "id": "00000000-0000-0000-0000-0000000000a1",
        "slug": "squat-setup",
        "title": "Squat setup",
        "section": "form",
        "muscle_group": "legs",
        "content": "Break at hips and knees; descend below parallel.",
        "source": "KB",
        "similarity": 0.82,
    },
    {  # below RAG_MIN_SIMILARITY (0.35) → must be filtered out
        "id": "00000000-0000-0000-0000-0000000000a2",
        "slug": "sleep-recovery",
        "title": "Sleep",
        "section": "recovery",
        "muscle_group": None,
        "content": "Sleep 7-9 hours.",
        "source": "KB",
        "similarity": 0.12,
    },
]

MEM_ROWS = [
    {
        "id": "00000000-0000-0000-0000-0000000000b1",
        "kind": "workout_summary",
        "content": "Week 42: squat 100kg x5",
        "metadata": {"week": "2026-W42"},
        "created_at": "2026-10-20T00:00:00+00:00",
        "similarity": 0.77,
    }
]


def test_health():
    assert client.get("/health").json()["status"] == "ok"


def test_coach_requires_auth():
    # No network should be touched — auth gate fails first.
    r = client.post("/rag/coach", json={"query": "how deep do I squat?"})
    assert r.status_code == 401


@respx.mock
def test_retrieve_filters_low_similarity(auth_header):
    auth_user_route()
    _embed_route()
    respx.post(f"{REST}/rpc/match_exercise_kb").mock(return_value=httpx.Response(200, json=KB_ROWS))
    respx.post(f"{REST}/rpc/match_user_memories").mock(
        return_value=httpx.Response(200, json=MEM_ROWS)
    )

    r = client.post("/rag/retrieve", json={"query": "squat depth"}, headers=auth_header)
    assert r.status_code == 200
    ctx = r.json()["context"]
    # Only the above-threshold KB row survives.
    assert [c["slug"] for c in ctx["kb"]] == ["squat-setup"]
    assert ctx["memories"][0]["content"] == "Week 42: squat 100kg x5"
    assert "[KB1] Squat setup" in r.json()["prompt_preview"]


@respx.mock
def test_coach_forwards_user_jwt_to_supabase(auth_header, user_jwt):
    auth_user_route()
    _embed_route()
    _generate_route()
    kb = respx.post(f"{REST}/rpc/match_exercise_kb").mock(
        return_value=httpx.Response(200, json=KB_ROWS)
    )
    mem = respx.post(f"{REST}/rpc/match_user_memories").mock(
        return_value=httpx.Response(200, json=MEM_ROWS)
    )

    r = client.post(
        "/rag/coach", json={"query": "how deep do I squat?", "thread": "guru"}, headers=auth_header
    )
    assert r.status_code == 200
    body = r.json()
    assert "[KB1]" in body["answer"]
    assert body["sources"]["kb"][0]["slug"] == "squat-setup"

    # The isolation contract: the USER's token — not the anon/service key — is what
    # reaches Postgres on the user-memory lookup.
    assert mem.calls.last.request.headers["authorization"] == f"Bearer {user_jwt}"
    assert kb.calls.last.request.headers["apikey"] == "anon-key-anon-key-anon-key"


@respx.mock
def test_add_memory_embeds_as_document_and_upserts(auth_header):
    auth_user_route()
    embed = _embed_route()
    upsert = respx.post(f"{REST}/rpc/upsert_user_memory").mock(
        return_value=httpx.Response(200, json="00000000-0000-0000-0000-0000000000c1")
    )

    r = client.post(
        "/rag/memories",
        json={"kind": "note", "content": "Tweaked knee on leg press", "dedupe_key": "note:knee"},
        headers=auth_header,
    )
    assert r.status_code == 200
    assert r.json()["id"] == "00000000-0000-0000-0000-0000000000c1"
    # Stored content is embedded with the document task type.
    assert embed.calls.last.request.read().decode().count("RETRIEVAL_DOCUMENT") == 1
    sent = upsert.calls.last.request.read().decode()
    assert "Tweaked knee" in sent and "note:knee" in sent
