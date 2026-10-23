"""Pure-unit tests: no network."""

from __future__ import annotations

from app.prompts import build_user_message
from app.schemas import KBSource, MemorySource, RetrievedContext
from app.supabase import format_vector


def test_format_vector_is_pgvector_literal():
    assert format_vector([1.0, 2.5, -0.5]) == "[1.00000000,2.50000000,-0.50000000]"


def test_build_user_message_orders_context_then_question():
    ctx = RetrievedContext(
        kb=[KBSource(slug="squat-setup", title="Squat setup", section="form", similarity=0.9)],
        memories=[
            MemorySource(id="1", kind="workout_summary", content="Week 42: squat 100kg×5", similarity=0.8)
        ],
    )
    msg = build_user_message("How deep should I squat?", ctx)
    assert "CURATED KNOWLEDGE" in msg
    assert "[KB1] Squat setup" in msg
    assert "[H1]" in msg and "100kg×5" in msg
    # Question comes last so the model reads context first.
    assert msg.rstrip().endswith("How deep should I squat?")


def test_build_user_message_handles_empty_context():
    msg = build_user_message("hi", RetrievedContext())
    assert "no curated knowledge matched" in msg
    assert "no relevant history" in msg
