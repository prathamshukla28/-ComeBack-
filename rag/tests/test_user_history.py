"""ingest/user_history.py: weekly summaries, top-set selection, and privacy."""

from __future__ import annotations

import json

import httpx
import respx

from app.config import EMBEDDING_DIM
from ingest import user_history
from ingest.user_history import build_summaries

GL = "https://generativelanguage.googleapis.com/v1beta"
REST = "https://test.supabase.co/rest/v1"


def _set(name: str, kg: float, reps: int, when: str = "2026-10-20T10:00:00Z") -> dict:
    return {"exercise_name": name, "weight_kg": kg, "reps": reps, "created_at": when}


def _workout_line(summaries: list[dict]) -> str:
    return next(m["content"] for m in summaries if m["kind"] == "workout_summary")


def test_top_set_is_the_best_estimated_1rm_not_the_heaviest_or_latest():
    # 100×10 (e1RM 133.3) beats a later 120×1 (e1RM 124). The old code compared each
    # set's e1RM against the stored best *weight* (100), so 124 > 100 replaced it.
    rows = [_set("Squat", 100, 10), _set("Squat", 120, 1)]
    content = _workout_line(build_summaries(rows, [], []))
    assert "Squat 100kg×10" in content
    assert "120kg" not in content


def test_top_set_is_order_independent():
    rows = [_set("Bench", 80, 8), _set("Bench", 90, 2), _set("Bench", 85, 5)]
    expected = _workout_line(build_summaries(rows, [], []))
    assert _workout_line(build_summaries(list(reversed(rows)), [], [])) == expected
    assert "Bench 80kg×8" in expected  # e1RM 101.3 vs 96 and 99.2


def test_bodyweight_exercises_are_kept_with_their_best_reps():
    rows = [_set("Pull-up", 0, 8), _set("Pull-up", 0, 12)]
    content = _workout_line(build_summaries(rows, [], []))
    assert "Pull-up 0kg×12" in content


def test_habit_summary_never_includes_the_private_habit():
    habits = [
        {"kind": "cigarette", "amount": 3, "occurred_at": "2026-10-20T10:00:00Z"},
        {"kind": "intimacy", "amount": 2, "occurred_at": "2026-10-20T22:00:00Z"},
    ]
    out = build_summaries([], habits, [])
    text = json.dumps(out).lower()
    assert "intimacy" not in text
    assert "cigarette: 3" in text


def test_a_week_with_only_the_private_habit_produces_no_habit_memory():
    habits = [{"kind": "intimacy", "amount": 1, "occurred_at": "2026-10-20T22:00:00Z"}]
    assert build_summaries([], habits, []) == []


@respx.mock
async def test_main_never_reads_the_private_habit(monkeypatch):
    monkeypatch.setenv("USER_ACCESS_TOKEN", "user-jwt")
    respx.get(url__regex=rf"{REST}/workout_sets.*").mock(return_value=httpx.Response(200, json=[]))
    habits = respx.get(url__regex=rf"{REST}/habit_logs.*").mock(
        return_value=httpx.Response(200, json=[])
    )
    respx.get(url__regex=rf"{REST}/body_metrics.*").mock(return_value=httpx.Response(200, json=[]))
    respx.post(url__regex=rf"{GL}/models/.*:embedContent").mock(
        return_value=httpx.Response(200, json={"embedding": {"values": [0.02] * EMBEDDING_DIM}})
    )

    await user_history.main()

    url = str(habits.calls.last.request.url)
    assert "kind=neq.intimacy" in url
    assert habits.calls.last.request.headers["authorization"] == "Bearer user-jwt"
