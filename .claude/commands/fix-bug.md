---
description: Fix a bug test-first — reproduce with a failing test, then make it pass, review, and verify.
argument-hint: '<description of the bug, or a failing test / error>'
---

Fix this bug **test-first**. Do not touch implementation until a test reproduces it.

Bug: $ARGUMENTS

## Steps

1. **Reproduce** — delegate to `qa-engineer` to write a **failing** test that captures
   the bug (Jest for client, pytest for `rag/`). Run only that test; confirm it fails for
   the right reason and paste the real failure. If you cannot reproduce it, stop and report
   that — do not "fix" by guessing.

2. **Diagnose** — identify the root cause (prefer `differential-review` on recent changes
   if it's a regression). State the cause in one or two sentences.

3. **Fix** — delegate to the owning builder (`frontend`/`backend`/`data`/`devops`) to make
   the test pass with the smallest correct change. Run only the affected tests in the loop.

4. **Review** — `code-reviewer` (and `security-reviewer` if the bug touches auth/RLS/
   secrets), read-only, in parallel. Fix findings.

5. **Verify** — run the full affected test file(s) plus `typecheck` and `lint`. For a
   regression, confirm the new test would have caught it.

## Output

Root cause, the reproduction test (path), the fix (files + one-line rationale), and the
real command output proving green. Open a SPEC-GAP if the correct behavior was undefined.

Commit only if the human asks: `git add -A` then `git commit -m "fix: <summary>"` — no
co-author/trailer. Never push.
