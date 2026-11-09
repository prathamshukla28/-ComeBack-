"""Server-side Pro enforcement for the paid endpoints.

The app's paywall is a client-side check, which is all a feature running on the
user's own Gemini key needs. Every route in this service spends the OPERATOR's
Gemini key, so each one re-checks the entitlement here, server-side, from the
`user_entitlements` table that only the RevenueCat webhook can write
(db/entitlements.sql, app/webhooks.py).

Dependency order: verify token → rate limit → entitlement → (Gemini). A caller
without Pro gets a 403 having spent nothing on Gemini. The app's dev-only
demo-Pro mode (lib/demo.ts) does not change any of this.
"""

from __future__ import annotations

from fastapi import Depends, HTTPException

from . import supabase
from .config import get_settings
from .ratelimit import rate_limited
from .security import UserToken


async def require_pro(user: UserToken = Depends(rate_limited)) -> UserToken:
    """FastAPI dependency: an authenticated, throttled caller who holds Pro."""
    entitlement = get_settings().pro_entitlement
    if not await supabase.has_entitlement(entitlement, user.raw):
        raise HTTPException(status_code=403, detail="ComeBack Pro is required for this endpoint")
    return user
