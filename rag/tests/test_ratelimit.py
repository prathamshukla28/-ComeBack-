"""Per-user throttle: the pure policy, then the HTTP behaviour."""

from __future__ import annotations

import httpx
import respx
from fastapi.testclient import TestClient

from app import ratelimit
from app.main import app
from app.ratelimit import SlidingWindowLimiter
from tests.conftest import GL_BASE, REST, auth_user_route

client = TestClient(app)


def test_allows_up_to_the_limit_then_blocks():
    lim = SlidingWindowLimiter(limit=3, window_s=60)
    assert [lim.check("u", now=t)[0] for t in (0, 1, 2)] == [True, True, True]
    allowed, retry = lim.check("u", now=3)
    assert allowed is False
    assert retry == 57  # the oldest hit (t=0) expires at t=60


def test_window_slides():
    lim = SlidingWindowLimiter(limit=2, window_s=10)
    lim.check("u", now=0)
    lim.check("u", now=5)
    assert lim.check("u", now=9)[0] is False
    assert lim.check("u", now=10.01)[0] is True  # t=0 fell out of the window


def test_subjects_are_independent():
    lim = SlidingWindowLimiter(limit=1, window_s=60)
    assert lim.check("a", now=0)[0] is True
    assert lim.check("b", now=0)[0] is True
    assert lim.check("a", now=1)[0] is False


def test_zero_limit_disables_throttling():
    lim = SlidingWindowLimiter(limit=0, window_s=60)
    assert all(lim.check("u", now=t)[0] for t in range(100))


def test_prune_drops_expired_subjects():
    lim = SlidingWindowLimiter(limit=5, window_s=10)
    for i in range(ratelimit._PRUNE_AT + 1):
        lim.check(f"user-{i}", now=0)
    lim.check("late", now=100)  # triggers the sweep; everything from t=0 is stale
    assert set(lim._hits) == {"late"}


@respx.mock
def test_over_limit_returns_429_and_spends_nothing(auth_header):
    ratelimit._limiter = SlidingWindowLimiter(limit=2, window_s=60)
    auth_user_route(ok=True)
    embed = respx.post(url__regex=rf"{GL_BASE}/models/.*:embedContent").mock(
        return_value=httpx.Response(200, json={"embedding": {"values": [0.02] * 768}})
    )
    respx.post(f"{REST}/rpc/match_exercise_kb").mock(return_value=httpx.Response(200, json=[]))
    respx.post(f"{REST}/rpc/match_user_memories").mock(return_value=httpx.Response(200, json=[]))

    codes = [
        client.post("/rag/retrieve", json={"query": "x"}, headers=auth_header).status_code
        for _ in range(3)
    ]

    assert codes == [200, 200, 429]
    assert embed.call_count == 2
    third = client.post("/rag/retrieve", json={"query": "x"}, headers=auth_header)
    assert third.status_code == 429
    assert int(third.headers["retry-after"]) >= 1


@respx.mock
def test_unverified_flood_is_not_counted_against_anyone(auth_header):
    ratelimit._limiter = SlidingWindowLimiter(limit=1, window_s=60)
    auth_route = auth_user_route(ok=False)
    for _ in range(5):
        r = client.post(
            "/rag/retrieve", json={"query": "x"}, headers={"Authorization": "Bearer junk"}
        )
        assert r.status_code == 401
    assert auth_route.call_count == 5

    # The real user still has their full window.
    auth_route.mock(
        return_value=httpx.Response(200, json={"id": "user-123", "aud": "authenticated"})
    )
    respx.post(url__regex=rf"{GL_BASE}/models/.*:embedContent").mock(
        return_value=httpx.Response(200, json={"embedding": {"values": [0.02] * 768}})
    )
    respx.post(f"{REST}/rpc/match_exercise_kb").mock(return_value=httpx.Response(200, json=[]))
    respx.post(f"{REST}/rpc/match_user_memories").mock(return_value=httpx.Response(200, json=[]))
    assert client.post("/rag/retrieve", json={"query": "x"}, headers=auth_header).status_code == 200
