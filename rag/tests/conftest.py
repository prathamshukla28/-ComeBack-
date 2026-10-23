"""Test config: populate a fake environment BEFORE app modules read settings."""

from __future__ import annotations

import os

import jwt
import pytest

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "anon-key-anon-key-anon-key")
os.environ.setdefault("GEMINI_API_KEY", "test-gemini-key")
os.environ.setdefault("RAG_MIN_SIMILARITY", "0.35")
# Leave SUPABASE_JWT_SECRET unset by default so require_user uses unverified decode.

from app.config import EMBEDDING_DIM, get_settings  # noqa: E402

get_settings.cache_clear()

GL_BASE = "https://generativelanguage.googleapis.com/v1beta"
REST = "https://test.supabase.co/rest/v1"


@pytest.fixture
def embedding() -> list[float]:
    # Deterministic non-zero vector of the right dimension.
    return [0.01 * ((i % 10) + 1) for i in range(EMBEDDING_DIM)]


@pytest.fixture
def user_jwt() -> str:
    return jwt.encode({"sub": "user-123", "aud": "authenticated"}, "x", algorithm="HS256")


@pytest.fixture
def auth_header(user_jwt: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {user_jwt}"}
