"""RevenueCat webhook → `user_entitlements`.

RevenueCat → Project settings → Integrations → Webhooks:
    URL:                  https://<rag-host>/webhooks/revenuecat
    Authorization header: the value of REVENUECAT_WEBHOOK_SECRET

The endpoint is disabled (404) until that secret is configured. Authentication is a
constant-time comparison of the Authorization header; anything else is a 401 before
the body is even parsed.

The app configures RevenueCat with the Supabase user id as the app user id
(lib/purchases.ts), so `app_user_id` maps straight to `auth.users.id`. Anonymous
RevenueCat ids are acknowledged and ignored.

Event handling (only events that list the configured entitlement are applied):
    grant-like  INITIAL_PURCHASE, RENEWAL, PRODUCT_CHANGE, UNCANCELLATION,
                NON_RENEWING_PURCHASE, SUBSCRIPTION_EXTENDED, TEMPORARY_ENTITLEMENT_GRANT,
                REFUND_REVERSED, CANCELLATION, BILLING_ISSUE
                → expires_at = expiration_at_ms (a cancelled or failing subscription
                  keeps access until it actually expires, matching RevenueCat)
    revoke      EXPIRATION → expires now
    TRANSFER    revokes from each `transferred_from` id; the recipient is granted by
                its next purchase/renewal event
    anything else (TEST, SUBSCRIBER_ALIAS, ...) → acknowledged, no change

A 2xx tells RevenueCat the event is handled; a Supabase failure returns 502 so
RevenueCat retries. Out-of-order deliveries are resolved in SQL by event timestamp.
"""

from __future__ import annotations

import hmac
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from . import supabase
from .config import get_settings

logger = logging.getLogger("comeback.rag.webhooks")

router = APIRouter()

GRANT_EVENTS = frozenset(
    {
        "INITIAL_PURCHASE",
        "RENEWAL",
        "PRODUCT_CHANGE",
        "UNCANCELLATION",
        "NON_RENEWING_PURCHASE",
        "SUBSCRIPTION_EXTENDED",
        "TEMPORARY_ENTITLEMENT_GRANT",
        "REFUND_REVERSED",
        "CANCELLATION",
        "BILLING_ISSUE",
    }
)
REVOKE_EVENTS = frozenset({"EXPIRATION"})


class EntitlementChange(BaseModel):
    owner_id: str
    expires_at: str | None
    revoke: bool
    event_ms: int


def _as_user_id(value: Any) -> str | None:
    """A Supabase user id, or None for anonymous / malformed RevenueCat ids."""
    if not isinstance(value, str):
        return None
    try:
        return str(uuid.UUID(value))
    except ValueError:
        return None


def _ms_to_iso(ms: Any) -> str | None:
    if not isinstance(ms, (int, float)) or isinstance(ms, bool):
        return None
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat()


def changes_for_event(event: dict[str, Any], entitlement: str) -> list[EntitlementChange]:
    """Pure mapping from one RevenueCat event to the entitlement writes it implies."""
    kind = event.get("type")
    ids = event.get("entitlement_ids") or []
    if not isinstance(ids, list) or entitlement not in ids:
        return []
    raw_ms = event.get("event_timestamp_ms")
    event_ms = int(raw_ms) if isinstance(raw_ms, (int, float)) and not isinstance(raw_ms, bool) else 0

    if kind in GRANT_EVENTS or kind in REVOKE_EVENTS:
        owner = _as_user_id(event.get("app_user_id"))
        if owner is None:
            return []
        revoke = kind in REVOKE_EVENTS
        expires = None if revoke else _ms_to_iso(event.get("expiration_at_ms"))
        return [
            EntitlementChange(owner_id=owner, expires_at=expires, revoke=revoke, event_ms=event_ms)
        ]

    if kind == "TRANSFER":
        sources = event.get("transferred_from")
        if not isinstance(sources, list):
            return []
        owners = [o for o in (_as_user_id(s) for s in sources) if o is not None]
        return [
            EntitlementChange(owner_id=o, expires_at=None, revoke=True, event_ms=event_ms)
            for o in owners
        ]

    return []


def _authorised(header: str | None, secret: str) -> bool:
    if not header:
        return False
    candidate = header.strip()
    if candidate.lower().startswith("bearer "):
        candidate = candidate[7:].strip()
    return hmac.compare_digest(candidate.encode(), secret.encode())


@router.post("/webhooks/revenuecat")
async def revenuecat_webhook(
    payload: dict[str, Any],
    authorization: str | None = Header(default=None),
) -> dict:
    settings = get_settings()
    secret = settings.revenuecat_webhook_secret
    if not secret:
        raise HTTPException(status_code=404, detail="Not Found")
    if not _authorised(authorization, secret):
        raise HTTPException(status_code=401, detail="Invalid webhook authorization")

    event = payload.get("event")
    if not isinstance(event, dict):
        raise HTTPException(status_code=422, detail="Missing 'event' object")

    changes = changes_for_event(event, settings.pro_entitlement)
    for change in changes:
        await supabase.service_rpc(
            "apply_entitlement_event",
            {
                "p_owner": change.owner_id,
                "p_entitlement": settings.pro_entitlement,
                "p_expires_at": change.expires_at,
                "p_event_ms": change.event_ms,
                "p_revoke": change.revoke,
            },
        )

    # The event type comes from the request body: strip line breaks so it cannot forge log lines.
    event_type = str(event.get("type"))[:64].replace("\r\n", "").replace("\n", "").replace("\r", "")
    logger.info("revenuecat event=%s applied=%d", event_type, len(changes))
    return {"ok": True, "applied": len(changes)}
