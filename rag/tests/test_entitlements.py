"""Server-side Pro enforcement: the paywall is not just a client-side check.

Every /rag/* route spends the service's Gemini key. A verified caller WITHOUT the
Pro entitlement must get a 403 having spent nothing, and the entitlement lookup must
run under the caller's own JWT (so RLS, not this service, scopes it).
"""

from __future__ import annotations

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from app import ratelimit
from app.main import app
from app.ratelimit import SlidingWindowLimiter
from tests.conftest import GL_BASE, REST, auth_user_route, entitlement_route

client = TestClient(app)

PAID_ROUTES = [
    ("/rag/coach", {"query": "squat depth", "thread": "coach"}),
    ("/rag/retrieve", {"query": "squat depth"}),
    ("/rag/memories", {"kind": "note", "content": "x"}),
]


def _gemini_routes():
    embed = respx.post(url__regex=rf"{GL_BASE}/models/.*:embedContent").mock(
        return_value=httpx.Response(200, json={"embedding": {"values": [0.02] * 768}})
    )
    generate = respx.post(url__regex=rf"{GL_BASE}/models/.*:generateContent").mock(
        return_value=httpx.Response(
            200, json={"candidates": [{"content": {"parts": [{"text": "ok"}]}}]}
        )
    )
    return embed, generate


@pytest.mark.parametrize(("path", "body"), PAID_ROUTES)
@respx.mock
def test_free_user_is_refused_before_any_gemini_spend(path, body, auth_header):
    auth_user_route(pro=False)
    embed, generate = _gemini_routes()

    r = client.post(path, json=body, headers=auth_header)

    assert r.status_code == 403
    assert "Pro" in r.json()["detail"]
    assert not embed.called
    assert not generate.called


@respx.mock
def test_entitlement_lookup_runs_under_the_callers_jwt(auth_header, user_jwt):
    auth_user_route(pro=None)
    check = entitlement_route(pro=True)
    _gemini_routes()
    respx.post(f"{REST}/rpc/match_exercise_kb").mock(return_value=httpx.Response(200, json=[]))
    respx.post(f"{REST}/rpc/match_user_memories").mock(return_value=httpx.Response(200, json=[]))

    r = client.post("/rag/retrieve", json={"query": "x"}, headers=auth_header)

    assert r.status_code == 200
    sent = check.calls.last.request
    assert sent.headers["authorization"] == f"Bearer {user_jwt}"
    assert sent.headers["apikey"] == "anon-key-anon-key-anon-key"  # never the service key
    assert b'"p_entitlement":"pro"' in sent.read().replace(b" ", b"")


@respx.mock
def test_non_boolean_entitlement_response_is_not_pro(auth_header):
    auth_user_route(pro=None)
    respx.post(f"{REST}/rpc/has_entitlement").mock(
        return_value=httpx.Response(200, json=[{"has_entitlement": True}])
    )
    embed, _ = _gemini_routes()

    r = client.post("/rag/retrieve", json={"query": "x"}, headers=auth_header)

    assert r.status_code == 403  # fail closed on an unexpected shape
    assert not embed.called


@respx.mock
def test_supabase_rejecting_the_lookup_is_a_401(auth_header):
    auth_user_route(pro=None)
    respx.post(f"{REST}/rpc/has_entitlement").mock(return_value=httpx.Response(401, json={}))
    embed, _ = _gemini_routes()

    r = client.post("/rag/retrieve", json={"query": "x"}, headers=auth_header)

    assert r.status_code == 401
    assert not embed.called


@respx.mock
def test_rate_limit_is_applied_before_the_entitlement_lookup(auth_header):
    ratelimit._limiter = SlidingWindowLimiter(limit=1, window_s=60)
    auth_user_route(pro=None)
    check = entitlement_route(pro=False)

    codes = [
        client.post("/rag/retrieve", json={"query": "x"}, headers=auth_header).status_code
        for _ in range(3)
    ]

    assert codes == [403, 429, 429]
    assert check.call_count == 1  # throttled calls never reach Supabase


def test_health_needs_no_entitlement():
    assert client.get("/health").status_code == 200
