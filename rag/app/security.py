"""User-token handling.

Two guarantees live here.

The isolation guarantee: every query against user data runs under the end user's
Supabase JWT, so Postgres row-level security decides what rows are visible.

The spending guarantee: no Gemini call (embedding or generation, billed to the
service's key) happens until the caller's token has been verified. Verification is
local HS256 when SUPABASE_JWT_SECRET is configured; otherwise it is a round-trip to
Supabase Auth (`GET /auth/v1/user`), which works for every project, including those
on asymmetric (ES256/RS256) signing keys where no shared secret exists. Either way an
unverifiable token is a 401 before any model or database work, and an unreachable
verifier is a 503 — never a fall-through to "assume valid".
"""

from __future__ import annotations

import httpx
import jwt
from fastapi import Header, HTTPException

from .config import Settings, get_settings


class UserToken:
    """The caller's bearer token plus the claims verification established."""

    def __init__(self, raw: str, claims: dict):
        self.raw = raw
        self.claims = claims

    @property
    def subject(self) -> str | None:
        return self.claims.get("sub")


def _strip_bearer(authorization: str) -> str:
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(status_code=401, detail="Expected 'Authorization: Bearer <token>'")
    return token.strip()


def _verify_locally(token: str, secret: str) -> dict:
    try:
        return jwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            audience="authenticated",
            options={"require": ["exp", "sub"]},
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail=f"Invalid token: {exc}") from exc


async def _verify_with_supabase_auth(token: str, settings: Settings) -> dict:
    """Ask Supabase Auth whether this token is a live session; the response's `id`
    is the authoritative subject."""
    headers = {"apikey": settings.supabase_anon_key, "Authorization": f"Bearer {token}"}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.get(f"{settings.auth_url}/user", headers=headers)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="Auth verifier unreachable") from exc

    if res.status_code in (401, 403):
        raise HTTPException(status_code=401, detail="Supabase rejected the user token")
    if not res.is_success:
        raise HTTPException(status_code=502, detail=f"Supabase auth {res.status_code}")

    user = res.json() if res.content else {}
    subject = user.get("id") if isinstance(user, dict) else None
    if not subject:
        raise HTTPException(status_code=401, detail="Supabase returned no user for the token")

    try:
        claims = jwt.decode(token, options={"verify_signature": False})
    except jwt.PyJWTError:
        claims = {}
    claims["sub"] = subject
    return claims


async def require_user(authorization: str | None = Header(default=None)) -> UserToken:
    """FastAPI dependency: reject anonymous or unverifiable callers, return the token."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    token = _strip_bearer(authorization)
    settings = get_settings()

    if settings.supabase_jwt_secret:
        claims = _verify_locally(token, settings.supabase_jwt_secret)
    else:
        claims = await _verify_with_supabase_auth(token, settings)

    return UserToken(raw=token, claims=claims)
