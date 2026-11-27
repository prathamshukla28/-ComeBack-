"""RevenueCat webhook: authentication, event mapping, and the service-role write."""

from __future__ import annotations

import json

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app
from app.webhooks import changes_for_event
from tests.conftest import REST

client = TestClient(app)

SECRET = "rc-webhook-secret-value"
SERVICE_KEY = "service-role-key-for-tests"
USER = "8f14e45f-ceea-467f-a0e6-5e8b6f1e2a11"
OTHER = "c9f0f895-fb98-4b91-8b6a-3c0d9a1e7b22"


@pytest.fixture
def webhook_env(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("REVENUECAT_WEBHOOK_SECRET", SECRET)
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _event(**overrides):
    event = {
        "type": "INITIAL_PURCHASE",
        "app_user_id": USER,
        "entitlement_ids": ["pro"],
        "expiration_at_ms": 1_893_456_000_000,  # 2030-01-01T00:00:00Z
        "event_timestamp_ms": 1_700_000_000_000,
    }
    event.update(overrides)
    return {"api_version": "1.0", "event": event}


def _post(payload, auth: str | None = SECRET):
    headers = {"Authorization": auth} if auth is not None else {}
    return client.post("/webhooks/revenuecat", json=payload, headers=headers)


# ---------- authentication ----------


def test_disabled_when_no_secret_configured():
    assert _post(_event()).status_code == 404


def test_disabled_endpoint_is_404_even_without_a_valid_body():
    client = TestClient(app)
    assert client.post("/webhooks/revenuecat").status_code == 404
    assert client.post("/webhooks/revenuecat", content=b"not json").status_code == 404


def test_unauthorised_request_is_401_before_the_body_is_parsed(webhook_env):
    client = TestClient(app)
    assert client.post("/webhooks/revenuecat", content=b"not json").status_code == 401


def test_authorised_non_json_or_non_object_body_is_422(webhook_env):
    client = TestClient(app)
    headers = {"Authorization": SECRET}
    assert client.post("/webhooks/revenuecat", content=b"not json", headers=headers).status_code == 422
    assert client.post("/webhooks/revenuecat", json=[1, 2], headers=headers).status_code == 422


@respx.mock
def test_wrong_or_missing_secret_is_rejected_without_writing(webhook_env):
    write = respx.post(f"{REST}/rpc/apply_entitlement_event")
    assert _post(_event(), auth="nope").status_code == 401
    assert _post(_event(), auth=None).status_code == 401
    assert not write.called


@respx.mock
def test_bearer_prefixed_secret_is_accepted(webhook_env):
    respx.post(f"{REST}/rpc/apply_entitlement_event").mock(return_value=httpx.Response(204))
    assert _post(_event(), auth=f"Bearer {SECRET}").status_code == 200


# ---------- the write ----------


@respx.mock
def test_purchase_grants_until_expiry_with_service_role(webhook_env):
    write = respx.post(f"{REST}/rpc/apply_entitlement_event").mock(
        return_value=httpx.Response(204)
    )

    r = _post(_event())

    assert r.status_code == 200
    assert r.json() == {"ok": True, "applied": 1}
    req = write.calls.last.request
    assert req.headers["authorization"] == f"Bearer {SERVICE_KEY}"
    assert req.headers["apikey"] == SERVICE_KEY
    body = json.loads(req.read())
    assert body == {
        "p_owner": USER,
        "p_entitlement": "pro",
        "p_expires_at": "2030-01-01T00:00:00+00:00",
        "p_event_ms": 1_700_000_000_000,
        "p_revoke": False,
    }


@respx.mock
def test_expiration_revokes(webhook_env):
    write = respx.post(f"{REST}/rpc/apply_entitlement_event").mock(
        return_value=httpx.Response(204)
    )
    assert _post(_event(type="EXPIRATION")).status_code == 200
    body = json.loads(write.calls.last.request.read())
    assert body["p_revoke"] is True
    assert body["p_expires_at"] is None


@respx.mock
def test_supabase_failure_returns_502_so_revenuecat_retries(webhook_env):
    respx.post(f"{REST}/rpc/apply_entitlement_event").mock(
        return_value=httpx.Response(409, json={"message": "fk violation"})
    )
    assert _post(_event()).status_code == 502


@respx.mock
def test_ignorable_events_are_acknowledged_without_writing(webhook_env):
    write = respx.post(f"{REST}/rpc/apply_entitlement_event")
    for payload in (
        _event(type="TEST"),
        _event(app_user_id="$RCAnonymousID:abc123"),
        _event(entitlement_ids=["something_else"]),
        _event(entitlement_ids=None),
    ):
        r = _post(payload)
        assert r.status_code == 200
        assert r.json()["applied"] == 0
    assert not write.called


def test_event_type_cannot_forge_log_lines(webhook_env, caplog: pytest.LogCaptureFixture):
    caplog.set_level("INFO", logger="comeback.rag.webhooks")
    r = _post(_event(type="TEST\nCRITICAL forged line\r\nmore"))
    assert r.status_code == 200
    logged = [rec.getMessage() for rec in caplog.records if "revenuecat event=" in rec.getMessage()]
    assert logged and all("\n" not in m and "\r" not in m for m in logged)


def test_missing_event_object_is_422(webhook_env):
    assert _post({"api_version": "1.0"}).status_code == 422


def test_service_key_missing_is_503(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("REVENUECAT_WEBHOOK_SECRET", SECRET)
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "")
    get_settings.cache_clear()
    try:
        assert _post(_event()).status_code == 503
    finally:
        get_settings.cache_clear()


# ---------- pure event mapping ----------


@pytest.mark.parametrize("kind", ["CANCELLATION", "BILLING_ISSUE", "RENEWAL", "PRODUCT_CHANGE"])
def test_access_continues_until_expiry_for_grant_like_events(kind):
    [change] = changes_for_event(_event(type=kind)["event"], "pro")
    assert change.revoke is False
    assert change.expires_at == "2030-01-01T00:00:00+00:00"


def test_non_renewing_purchase_without_expiry_is_lifetime():
    [change] = changes_for_event(
        _event(type="NON_RENEWING_PURCHASE", expiration_at_ms=None)["event"], "pro"
    )
    assert change.expires_at is None and change.revoke is False


def test_transfer_revokes_each_valid_source():
    event = _event(
        type="TRANSFER", transferred_from=[USER, "$RCAnonymousID:x", OTHER], transferred_to=["z"]
    )["event"]
    changes = changes_for_event(event, "pro")
    assert [c.owner_id for c in changes] == [USER, OTHER]
    assert all(c.revoke for c in changes)


def test_transfer_with_malformed_sources_is_ignored():
    assert changes_for_event(_event(type="TRANSFER", transferred_from="nope")["event"], "pro") == []


def test_unknown_event_type_changes_nothing():
    assert changes_for_event(_event(type="SUBSCRIBER_ALIAS")["event"], "pro") == []
