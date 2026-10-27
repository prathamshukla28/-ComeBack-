"""Test config: populate a fake environment BEFORE app modules read settings."""

from __future__ import annotations

import os
import time

import httpx
import jwt
import pytest
import respx

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "anon-key-anon-key-anon-key")
os.environ.setdefault("GEMINI_API_KEY", "test-gemini-key")
os.environ.setdefault("RAG_MIN_SIMILARITY", "0.35")
# SUPABASE_JWT_SECRET stays unset by default: that is the shipped default, and it
# makes require_user verify tokens against Supabase Auth (mocked via auth_user_route).
# Tests that exercise local HS256 verification opt in with the `local_jwt_secret`
# fixture, whose value signs the `user_jwt` fixture.
LOCAL_JWT_SECRET = "x"

from app.config import EMBEDDING_DIM, get_settings  # noqa: E402

get_settings.cache_clear()

GL_BASE = "https://generativelanguage.googleapis.com/v1beta"
REST = "https://test.supabase.co/rest/v1"
AUTH = "https://test.supabase.co/auth/v1"


def auth_user_route(ok: bool = True, sub: str = "user-123"):
    """Mock Supabase Auth's session check (`GET /auth/v1/user`), the remote verifier
    require_user uses when no local JWT secret is configured."""
    if ok:
        body = {"id": sub, "aud": "authenticated", "role": "authenticated"}
        return respx.get(f"{AUTH}/user").mock(return_value=httpx.Response(200, json=body))
    return respx.get(f"{AUTH}/user").mock(
        return_value=httpx.Response(401, json={"msg": "invalid JWT"})
    )


@pytest.fixture
def embedding() -> list[float]:
    # Deterministic non-zero vector of the right dimension.
    return [0.01 * ((i % 10) + 1) for i in range(EMBEDDING_DIM)]


@pytest.fixture
def user_jwt() -> str:
    claims = {"sub": "user-123", "aud": "authenticated", "exp": int(time.time()) + 3600}
    return jwt.encode(claims, LOCAL_JWT_SECRET, algorithm="HS256")


@pytest.fixture
def auth_header(user_jwt: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {user_jwt}"}


@pytest.fixture
def local_jwt_secret(monkeypatch: pytest.MonkeyPatch):
    """Switch require_user to local HS256 verification for one test."""
    monkeypatch.setenv("SUPABASE_JWT_SECRET", LOCAL_JWT_SECRET)
    get_settings.cache_clear()
    yield LOCAL_JWT_SECRET
    get_settings.cache_clear()


@pytest.fixture(autouse=True)
def _fresh_rate_limiter():
    """Each test starts with an empty throttle window (and the default limit)."""
    from app import ratelimit

    ratelimit._limiter = None
    yield
    ratelimit._limiter = None
