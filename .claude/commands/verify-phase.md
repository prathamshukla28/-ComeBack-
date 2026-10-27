---
description: Independently re-verify a phase's Definition of Done from a clean state and report PASS/FAIL with evidence.
argument-hint: '<phase number>, e.g. 2'
---

Independently verify **phase $1** of ComeBack. This is a gate, not a build step — nothing
is fixed here.

## Steps

1. Delegate to the **`verifier`** agent (read-only) and have it re-run the full Definition
   of Done from `CLAUDE.md` §9 against the current tree, running every check itself:
   - `git status` (clean/intended tree)
   - `npm run typecheck`
   - `npm run lint` (`--max-warnings=0`)
   - `npm test` (full suite)
   - `npm run format:check` + `npx markdownlint-cli2` on touched docs
   - `pytest` in `rag/` if it changed
2. Have it confirm `docs/SPEC-GAPS.md` lists phase $1's gaps and that no banned git op
   was used.

## Output

The verifier's verdict block: **PASS | FAIL**, a per-DoD-item table (item → status →
exact command → real summary), discrepancies between claimed and reproduced results, and
blocking items if FAIL.

Rules: paste real output only. Any check that genuinely can't run (device/live DB) is
**UNVERIFIED**, never PASS. One unreproducible "done" makes the verdict FAIL. Do not
commit or tag from this command — that belongs to `/build-phase` after the human gate.
