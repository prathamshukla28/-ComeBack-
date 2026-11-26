"""Safety parity with the app, and the /rag/coach crisis gate."""

from __future__ import annotations

import json
import re
from pathlib import Path

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from app.config import EMBEDDING_DIM
from app.main import app
from app.prompts import SYSTEM_BY_THREAD
from app.safety import CRISIS_RESOURCES, SAFETY_PREAMBLE, SELF_HARM_PATTERNS, detect_crisis
from tests.conftest import auth_user_route

client = TestClient(app)

GL = "https://generativelanguage.googleapis.com/v1beta"
REST = "https://test.supabase.co/rest/v1"
APP_SAFETY_TS = Path(__file__).resolve().parents[2] / "lib" / "safety.ts"


def _ts_template(name: str) -> str:
    src = APP_SAFETY_TS.read_text(encoding="utf-8")
    m = re.search(rf"export const {name} = `(.*?)`;", src, re.S)
    assert m, f"{name} not found in lib/safety.ts"
    return m.group(1)


def test_preamble_and_crisis_resources_match_the_app_byte_for_byte():
    assert SAFETY_PREAMBLE == _ts_template("SAFETY_PREAMBLE")
    assert CRISIS_RESOURCES == _ts_template("CRISIS_RESOURCES")


def test_self_harm_patterns_match_the_app():
    src = APP_SAFETY_TS.read_text(encoding="utf-8")
    block = re.search(r"SELF_HARM_PATTERNS: RegExp\[\] = \[(.*?)\];", src, re.S).group(1)
    ts_patterns = tuple(re.findall(r"^\s*/(.+)/i,$", block, re.M))
    assert ts_patterns and ts_patterns == SELF_HARM_PATTERNS


@pytest.mark.parametrize("thread", ["guru", "coach"])
def test_every_rag_system_prompt_carries_the_safety_preamble(thread):
    assert SAFETY_PREAMBLE in SYSTEM_BY_THREAD[thread]


@pytest.mark.parametrize(
    "text,expected",
    [
        ("I want to kill myself", True),
        ("thinking about SUICIDE", True),
        ("I don't want to wake up tomorrow", True),
        ("this workout is killing me", False),
        ("how do I cut weight safely?", False),
        ("", False),
    ],
)
def test_detect_crisis(text, expected):
    assert detect_crisis(text) is expected


def _embed_route():
    return respx.post(url__regex=rf"{GL}/models/.*:embedContent").mock(
        return_value=httpx.Response(200, json={"embedding": {"values": [0.02] * EMBEDDING_DIM}})
    )


def _generate_route():
    return respx.post(url__regex=rf"{GL}/models/.*:generateContent").mock(
        return_value=httpx.Response(
            200, json={"candidates": [{"content": {"parts": [{"text": "Brace and squat."}]}}]}
        )
    )


@respx.mock
@pytest.mark.parametrize("thread", ["guru", "coach"])
def test_crisis_message_gets_resources_and_never_reaches_gemini(auth_header, thread):
    auth_user_route()
    embed = _embed_route()
    generate = _generate_route()

    payload = {"query": "I want to end my life", "thread": thread}
    r = client.post("/rag/coach", json=payload, headers=auth_header)

    assert r.status_code == 200
    body = r.json()
    assert body["answer"] == CRISIS_RESOURCES
    assert body["model"] == "crisis-resources"  # no model produced it
    assert body["sources"] == {"kb": [], "memories": []}
    assert not embed.called and not generate.called


@respx.mock
@pytest.mark.parametrize("thread", ["guru", "coach"])
def test_normal_generation_sends_the_safety_preamble(auth_header, thread):
    auth_user_route()
    _embed_route()
    generate = _generate_route()
    respx.post(f"{REST}/rpc/match_exercise_kb").mock(return_value=httpx.Response(200, json=[]))
    respx.post(f"{REST}/rpc/match_user_memories").mock(return_value=httpx.Response(200, json=[]))

    payload = {"query": "how deep should I squat?", "thread": thread}
    r = client.post("/rag/coach", json=payload, headers=auth_header)

    assert r.status_code == 200
    sent = json.loads(generate.calls.last.request.read())
    assert SAFETY_PREAMBLE in sent["systemInstruction"]["parts"][0]["text"]
