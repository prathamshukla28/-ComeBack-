"""Token extraction / isolation-gate behaviour."""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.security import require_user


@pytest.mark.asyncio
async def test_missing_authorization_is_rejected():
    with pytest.raises(HTTPException) as exc:
        await require_user(authorization=None)
    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_non_bearer_scheme_is_rejected():
    with pytest.raises(HTTPException) as exc:
        await require_user(authorization="Basic abc123")
    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_bearer_token_claims_are_readable(user_jwt: str):
    tok = await require_user(authorization=f"Bearer {user_jwt}")
    assert tok.raw == user_jwt
    assert tok.subject == "user-123"
