"""The spending guarantee, end to end: an unverified caller never reaches Gemini.

Before this gate existed, `/rag/coach` embedded the query (billed to the service's
key) and only then let Supabase reject the token — so any string after `Bearer `
could burn quota indefinitely. These tests pin the order: verify first, spend second.
"""

from __future__ import annotations

import httpx
import respx
from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import AUTH, GL_BASE, REST, auth_user_route

client = TestClient(app)


def _embed_route():
    return respx.post(url__regex=rf"{GL_BASE}/models/.*:embedContent").mock(
        return_value=httpx.Response(200, json={"embedding": {"values": [0.02] * 768}})
    )


def _generate_route():
    return respx.post(url__regex=rf"{GL_BASE}/models/.*:generateContent").mock(
        return_value=httpx.Response(
            200, json={"candidates": [{"content": {"parts": [{"text": "ok"}]}}]}
        )
    )


@respx.mock
def test_junk_token_is_rejected_before_any_gemini_call():
    auth_user_route(ok=False)
    embed = _embed_route()
    generate = _generate_route()

    r = client.post(
        "/rag/coach", json={"query": "squat depth"}, headers={"Authorization": "Bearer junk"}
    )

    assert r.status_code == 401
    assert not embed.called
    assert not generate.called


@respx.mock
def test_memory_write_with_junk_token_spends_nothing():
    auth_user_route(ok=False)
    embed = _embed_route()
    upsert = respx.post(f"{REST}/rpc/upsert_user_memory")

    r = client.post(
        "/rag/memories",
        json={"kind": "note", "content": "x"},
        headers={"Authorization": "Bearer junk"},
    )

    assert r.status_code == 401
    assert not embed.called
    assert not upsert.called


@respx.mock
def test_verifier_outage_fails_closed_without_spending():
    respx.get(f"{AUTH}/user").mock(side_effect=httpx.ConnectError("down"))
    embed = _embed_route()

    r = client.post(
        "/rag/retrieve", json={"query": "x"}, headers={"Authorization": "Bearer whatever"}
    )

    assert r.status_code == 503
    assert not embed.called


@respx.mock
def test_verified_caller_proceeds_to_retrieval(auth_header):
    auth_user_route(ok=True)
    embed = _embed_route()
    respx.post(f"{REST}/rpc/match_exercise_kb").mock(return_value=httpx.Response(200, json=[]))
    respx.post(f"{REST}/rpc/match_user_memories").mock(return_value=httpx.Response(200, json=[]))

    r = client.post("/rag/retrieve", json={"query": "x"}, headers=auth_header)

    assert r.status_code == 200
    assert embed.call_count == 1


@respx.mock
def test_local_secret_path_never_calls_supabase_auth(local_jwt_secret, auth_header):
    # With a local secret the verifier is PyJWT; the auth endpoint is not mocked, so
    # respx would raise on any attempt to call it.
    _embed_route()
    respx.post(f"{REST}/rpc/match_exercise_kb").mock(return_value=httpx.Response(200, json=[]))
    respx.post(f"{REST}/rpc/match_user_memories").mock(return_value=httpx.Response(200, json=[]))

    r = client.post("/rag/retrieve", json={"query": "x"}, headers=auth_header)

    assert r.status_code == 200
