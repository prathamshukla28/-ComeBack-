---
description: Build phase N end-to-end following the phase protocol (plan → tests first → build → review → fix → verify → human gate → commit).
argument-hint: '<phase number>, e.g. 2'
---

Build **phase $1** of ComeBack, following the phase protocol in `CLAUDE.md` §5 exactly.
Do not skip a step, and do not commit without the human gate.

## 1. Plan

- Confirm the scope and Definition of Done for phase $1 from `docs/` and the ADRs.
- If no ADRs exist yet, stop and tell the human to run `/architecture` first.
- Delegate to `architect` to produce the plan + per-agent work breakdown, marking what
  runs `[parallel]`.

## 2. Tests first

- Delegate to `qa-engineer` to write **failing** tests for phase $1 from the spec,
  before any implementation. Confirm they fail for the right reason.

## 3. Build

- Delegate to the fitting builder(s) — `frontend`, `backend`, `data`, `devops` — to
  implement until phase $1's tests pass. During iteration run **only affected tests**.

## 4. Review (parallel)

- Launch `code-reviewer`, `security-reviewer`, and (if UI changed) `ux-reviewer`
  **in parallel**, in one message. They are read-only and report findings only.

## 5. Fix

- Hand findings to the authoring agents to fix. Re-run only the affected tests per loop.

## 6. Independent verify

- Delegate to `verifier` to re-run the full DoD from clean and return PASS/FAIL with
  real command output. If FAIL, return to step 5.

## 7. Human gate

- Present: phase summary, the verifier verdict, and **all** collected SPEC-GAPs.
- **Stop and wait for explicit human approval.** Do not commit before it.

## 8. Commit (only after approval)

- `git add -A`
- `git commit -m "<imperative summary of phase $1>"` — no co-author/trailer/signature.
- `git tag p$1-verified` (zero-pad: p02, p11…). Never push.

Honesty: report only commands actually run and their real output. If any DoD item is
UNVERIFIED (e.g. needs a device/live DB), say so at the gate — never claim it passed.
