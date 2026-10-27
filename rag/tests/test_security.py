"""Token extraction / verification behaviour of the `require_user` dependency."""

from __future__ import annotations

import time

import httpx
import jwt
import pytest
import respx
from fastapi import HTTPException

from app.security import require_user
from tests.conftest import AUTH, LOCAL_JWT_SECRET, auth_user_route


async def test_missing_authorization_is_rejected():
    with pytest.raises(HTTPException) as exc:
        await require_user(authorization=None)
    assert exc.value.status_code == 401


async def test_non_bearer_scheme_is_rejected():
    with pytest.raises(HTTPException) as exc:
        await require_user(authorization="Basic abc123")
    assert exc.value.status_code == 401


# --- default deployment: no local secret → Supabase Auth is the verifier ---


async def test_remote_verification_accepts_a_live_session(user_jwt: str):
    with respx.mock:
        route = auth_user_route(ok=True)
        tok = await require_user(authorization=f"Bearer {user_jwt}")
    assert route.called
    assert tok.raw == user_jwt
    assert tok.subject == "user-123"
    # The anon key identifies the project; the USER's token is what gets checked.
    req = route.calls.last.request
    assert req.headers["apikey"] == "anon-key-anon-key-anon-key"
    assert req.headers["authorization"] == f"Bearer {user_jwt}"


async def test_remote_verification_subject_comes_from_supabase_not_the_token():
    # A token can claim any `sub`; only the verifier's answer is trusted.
    forged = jwt.encode({"sub": "someone-else", "aud": "authenticated"}, "junk", algorithm="HS256")
    with respx.mock:
        auth_user_route(ok=True, sub="user-123")
        tok = await require_user(authorization=f"Bearer {forged}")
    assert tok.subject == "user-123"


async def test_remote_verification_rejects_an_invalid_token():
    with respx.mock:
        auth_user_route(ok=False)
        with pytest.raises(HTTPException) as exc:
            await require_user(authorization="Bearer not-a-real-token")
    assert exc.value.status_code == 401


async def test_remote_verifier_unreachable_fails_closed():
    with respx.mock:
        respx.get(f"{AUTH}/user").mock(side_effect=httpx.ConnectError("down"))
        with pytest.raises(HTTPException) as exc:
            await require_user(authorization="Bearer whatever")
    assert exc.value.status_code == 503


# --- hardened deployment: SUPABASE_JWT_SECRET set → local HS256, no network ---


async def test_local_verification_accepts_a_signed_token(local_jwt_secret: str, user_jwt: str):
    with respx.mock:  # assert_all_mocked: any network call would raise
        tok = await require_user(authorization=f"Bearer {user_jwt}")
    assert tok.subject == "user-123"


async def test_local_verification_rejects_wrong_signature(local_jwt_secret: str):
    forged = jwt.encode(
        {"sub": "user-123", "aud": "authenticated", "exp": int(time.time()) + 60},
        "not-the-secret",
        algorithm="HS256",
    )
    with pytest.raises(HTTPException) as exc:
        await require_user(authorization=f"Bearer {forged}")
    assert exc.value.status_code == 401


async def test_local_verification_rejects_expired_token(local_jwt_secret: str):
    expired = jwt.encode(
        {"sub": "user-123", "aud": "authenticated", "exp": int(time.time()) - 60},
        LOCAL_JWT_SECRET,
        algorithm="HS256",
    )
    with pytest.raises(HTTPException) as exc:
        await require_user(authorization=f"Bearer {expired}")
    assert exc.value.status_code == 401


async def test_local_verification_rejects_junk(local_jwt_secret: str):
    with pytest.raises(HTTPException) as exc:
        await require_user(authorization="Bearer junk")
    assert exc.value.status_code == 401
