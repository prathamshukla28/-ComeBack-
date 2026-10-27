---
description: Report current project status — phase, gates, open SPEC-GAPs, test/lint health, and git state — without changing anything.
---

Report ComeBack's current status. **Read-only — change nothing, commit nothing.**

## Gather (run these, don't assume)

1. **Git** — `git status --short`, current branch, and `git tag --list 'p*-verified'`
   to show the last verified phase. Note any uncommitted work.

2. **Health** — run `npm run typecheck`, `npm run lint`, and `npm test`; capture the real
   summary lines. If `rag/` has changes, note that `pytest` should also run.

3. **SPEC-GAPs** — read `docs/SPEC-GAPS.md`; list open (undecided) gaps with their blast radius.
4. **Phase** — infer the current/next phase from the latest `pNN-verified` tag and the
   phase map in the architecture summary / `docs/`.

## Output

A concise dashboard:

- **Phase**: last verified = `pNN`; next = `p(NN+1)` + its one-line goal.
- **Health**: typecheck / lint / tests — PASS/FAIL with the real counts.
- **Working tree**: clean, or the list of changed/untracked files.
- **Open SPEC-GAPs**: id · title · blast radius (undecided only).
- **Next action**: the single most useful next step (e.g. "run `/build-phase 3`",
  "resolve SPEC-GAP-004", "human: review the gate for p02").

Report only what you actually ran. Do not fix anything from this command.
