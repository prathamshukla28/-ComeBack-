"""System prompts + grounded-context assembly.

Mirrors the voice of the app's Guru/Coach tabs (app/(tabs)/guru.tsx) but swaps the
blunt last-30-days data dump for *retrieved* context: only the KB chunks and user
memories relevant to this question, each labelled so the model can cite them.
"""

from __future__ import annotations

from .schemas import KBSource, MemorySource, RetrievedContext, Thread

GURU_SYSTEM = """You are the FITNESS GURU inside "ComeBack" — a no-BS, high-intensity personal trainer.

Style:
- Direct. Tactical. Short paragraphs. Metric units (kg, cm).
- Zero preachy filler, zero "as an AI" disclaimers.

Job:
- Program advice, form cues, deload calls, warmups, exercise swaps, injury workarounds.
- Ground every claim in the CURATED KNOWLEDGE below; prefer it over your own priors.
- Use the USER HISTORY to personalise — reference their specific numbers when useful.

Rules:
- NEVER prescribe medical treatment. Refer to a doctor for injuries or medical questions.
- If the knowledge base doesn't cover something, say so briefly rather than inventing specifics.
- If the user has no relevant history, coach them to start logging."""

COACH_SYSTEM = """You are the LIFE COACH inside "ComeBack" — a grounded, supportive accountability partner.

Style:
- Warm but honest. Practical. No lecturing.

Job:
- Habit change, consistency, motivation, recovery from slip-ups.
- Ground advice in the CURATED KNOWLEDGE below and personalise with the USER HISTORY.

Rules:
- NEVER give medical, legal, or crisis advice. Point to a professional for those.
- If history is sparse, encourage logging rather than guessing."""

SYSTEM_BY_THREAD: dict[Thread, str] = {"guru": GURU_SYSTEM, "coach": COACH_SYSTEM}


def _fmt_kb(kb: list[KBSource]) -> str:
    if not kb:
        return "(no curated knowledge matched this question)"
    lines = []
    for i, c in enumerate(kb, 1):
        tag = f"[KB{i}] {c.title}"
        if c.section:
            tag += f" · {c.section}"
        lines.append(f"{tag}\n{c.content}")
    return "\n\n".join(lines)


def _fmt_memories(mem: list[MemorySource]) -> str:
    if not mem:
        return "(no relevant history logged yet)"
    lines = []
    for i, m in enumerate(mem, 1):
        when = (m.created_at or "")[:10]
        lines.append(f"[H{i}] ({m.kind}{', ' + when if when else ''}) {m.content}")
    return "\n".join(lines)


def build_user_message(query: str, ctx: RetrievedContext) -> str:
    """The grounded turn sent to Gemini: context first, question last."""
    return (
        "=== CURATED KNOWLEDGE (cite as [KB#]) ===\n"
        f"{_fmt_kb(ctx.kb)}\n\n"
        "=== USER HISTORY (cite as [H#]) ===\n"
        f"{_fmt_memories(ctx.memories)}\n\n"
        "=== QUESTION ===\n"
        f"{query}"
    )
