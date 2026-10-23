"""User-token handling.

The isolation guarantee: every query against user data runs under the end user's
Supabase JWT, so Postgres row-level security decides what rows are visible. This
module extracts that token from the Authorization header and, when a JWT secret is
configured, verifies it locally as well (defense in depth) before we ever touch the DB.
Even without local verification, PostgREST verifies the token at the database boundary,
so a forged token can never read another user's rows.
"""

from __future__ import annotations

import jwt
from fastapi import Header, HTTPException

from .config import get_settings


class UserToken:
    """The caller's bearer token plus whatever claims we could read from it."""

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


async def require_user(authorization: str | None = Header(default=None)) -> UserToken:
    """FastAPI dependency: reject anonymous callers, return the verified token."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    token = _strip_bearer(authorization)
    settings = get_settings()

    if settings.supabase_jwt_secret:
        try:
            claims = jwt.decode(
                token,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                audience="authenticated",
                options={"require": ["exp", "sub"]},
            )
        except jwt.PyJWTError as exc:
            raise HTTPException(status_code=401, detail=f"Invalid token: {exc}") from exc
    else:
        # No local secret configured: don't trust these claims for authz — they are
        # for logging/metadata only. RLS at the DB is the real gate.
        try:
            claims = jwt.decode(token, options={"verify_signature": False})
        except jwt.PyJWTError:
            claims = {}

    return UserToken(raw=token, claims=claims)
