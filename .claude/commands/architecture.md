---
description: Phase 0 — establish architecture before any feature code (ADRs, data model, API contracts, repo scaffold, CI).
argument-hint: "[optional focus, e.g. 'rag' or 'auth']"
---

Run **Phase 0: Architecture** for ComeBack. Produce design, not feature code.

Optional focus: $ARGUMENTS

## Steps

1. **Read the spec** — `CLAUDE.md`, everything in `docs/` (SETUP, RAG, MONETIZATION,
   SECURITY, AGENTS), `db/schema.sql`, `db/rag.sql`, and `rag/`. Resolve against the
   sources-of-truth order. Do not read real `.env`.

2. **Delegate to the `architect` agent** to produce, in this order:
   - **ADRs** in `docs/adr/NNNN-*.md` — at minimum: data model & RLS as the isolation
     invariant; AI/RAG topology (optional service); client state strategy; billing/
     entitlement; offline/outbox policy; versioning via release-please.
   - **Data model** — confirm/annotate tables + RLS + the 768-dim pgvector contract.
   - **API contracts** — Supabase query signatures and `rag/` endpoints with request/
     response shapes.
   - **Repo scaffold** — confirm the directory layout and any new top-level dirs
     (`docs/adr/`, `docs/SPEC-GAPS.md`).
   - **CI design** — the gate list CI must enforce (must mirror the DoD).
3. **Seed `docs/SPEC-GAPS.md`** with the gap log template and the open gaps already known.
4. **Do not implement features, migrations against a real DB, or install native modules.**

## Output

An architecture summary: ADRs written (paths), contracts, the phase map (what p01…pNN
each deliver), open SPEC-GAPs, and the top risks. End by asking the human to approve the
architecture before any `/build-phase`.
