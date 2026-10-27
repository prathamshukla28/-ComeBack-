# CLAUDE.md — ComeBack Build Constitution

This file governs how Claude Code builds **ComeBack**. It overrides default behavior.
When any instruction here conflicts with a convenience shortcut, **this file wins**.

---

## 1. Project summary

ComeBack is a privacy-first habit + workout tracker with an AI coach. A lapse is
treated as a comeback, not a failure. Runs on **iOS, Android, and Web** via Expo.

- **Client**: Expo SDK 54 / React Native 0.81 / React 19 / TypeScript 5.9 (strict),
  expo-router (file-based), Zustand + TanStack Query, Reanimated v4.

- **Backend-as-a-service**: Supabase (Postgres, Auth, Row-Level Security).
- **AI**: Google Gemini (`lib/gemini.ts`), with an optional retrieval service in
  `rag/` (FastAPI + pgvector) for grounded answers.

- **Billing**: RevenueCat, single `pro` entitlement.
- **Core promise**: a user's data never leaks to another user; RLS is a database
  invariant, not a coding convention (see `docs/RAG.md`).

---

## 2. Sources of truth (priority order)

When two sources disagree, the **higher** one wins and the lower is updated to match:

1. **Spec** — `docs/` (SETUP, RAG, MONETIZATION, SECURITY) and the ADRs under
   `docs/adr/` once `/architecture` has run.

2. **ADRs** — accepted architecture decisions.
3. **Tests** — encode intended behavior; a failing test beats an assumption.
4. **Code** — the current implementation.
5. **This file** — process, not product.

If the spec is silent, **do not guess** — see §6.

---

## 3. Tech stack (authoritative)

| Layer        | Choice                                                      |
| ------------ | ----------------------------------------------------------- |
| Runtime      | Expo SDK 54, React Native 0.81, React 19, Node ≥ 22         |
| Language     | TypeScript 5.9 strict; Python 3.11 for `rag/`               |
| Routing      | expo-router (file-based)                                    |
| State / data | Zustand, TanStack Query                                     |
| Data store   | Supabase Postgres + RLS; pgvector for RAG                   |
| AI           | Gemini `gemini-2.0-flash` + `text-embedding-004` (768 dims) |
| Billing      | RevenueCat (`pro` entitlement)                              |
| Quality      | ESLint (`--max-warnings=0`), Prettier, Jest, pytest, CodeQL |
| CI/CD        | GitHub Actions; release-please; EAS (opt-in)                |

**Expo is version-pinned to SDK 54.** `docs/AGENTS.md` mentions v57 — that is a
SPEC-GAP, not a license to upgrade (see §6 and the gap log). Any SDK bump is a
human gate (§8).

---

## 4. Team (role personas → agents)

ComeBack has one human maintainer; the roles below are **agent personas** invoked
per phase, not real people. Definitions live in `.claude/agents/`.

| Role              | Agent file             | Model  | Mandate                                        |
| ----------------- | ---------------------- | ------ | ---------------------------------------------- |
| Architect         | `architect.md`         | opus   | ADRs, data model, API contracts, scaffold, CI  |
| QA Engineer       | `qa-engineer.md`       | sonnet | Tests **first**, fixtures, test strategy       |
| Frontend          | `frontend.md`          | sonnet | Expo/RN screens, components, client state      |
| Backend           | `backend.md`           | sonnet | Supabase access, `rag/` FastAPI service        |
| Data              | `data.md`              | sonnet | SQL schema, RLS policies, migrations, pgvector |
| DevOps            | `devops.md`            | sonnet | CI, EAS, env wiring, release-please            |
| Security Reviewer | `security-reviewer.md` | opus   | RLS/secrets/authz review (read-only)           |
| Code Reviewer     | `code-reviewer.md`     | opus   | Correctness/simplicity review (read-only)      |
| UX Reviewer       | `ux-reviewer.md`       | opus   | a11y, flows, copy, theming (read-only)         |
| Verifier          | `verifier.md`          | opus   | Independent re-run of the DoD (read-only)      |

---

## 5. Phase protocol (every phase follows this, in order)

```text
plan → tests first → build → code + security review → fix → independent verify → human gate → commit
```

1. **Plan** — architect/lead states scope, the DoD for the phase, and which agents run.
2. **Tests first** — qa-engineer writes failing tests from the spec before build.
3. **Build** — frontend/backend/data/devops implement until the phase tests pass.
4. **Review (parallel)** — code-reviewer, security-reviewer, ux-reviewer run
   independently and in parallel. Reviewers are read-only.

5. **Fix** — authors address findings; during fix loops run **only affected tests** (§10).
6. **Independent verify** — verifier re-runs the full DoD from a clean state and
   reports pass/fail with the exact commands and output.

7. **Human gate** — present the phase summary + all collected SPEC-GAPs; wait for the
   human to approve before committing (§8).

8. **Commit** — on approval only (§7).

Reviewers and the verifier **never** fix code — they report. Authors fix.

---

## 6. Anti-hallucination rule (non-negotiable)

**If it is not in the spec, do not invent it.** When a decision is required and the
spec/ADRs/tests do not cover it:

1. Append an entry to `docs/SPEC-GAPS.md` using the template below.
2. Choose the **most conservative, reversible default** and mark the code with
   `// SPEC-GAP: <id>`.

3. Surface every SPEC-GAP at the phase human gate (§10 — collect, don't interrupt).

```md
### SPEC-GAP-<NNN> — <short title>

- Phase: p<NN>
- Question: <what the spec does not answer>
- Conservative default taken: <what you did instead>
- Blast radius if wrong: <low|med|high>
- Decision: <blank until the human answers>
```

Never fabricate APIs, file paths, env vars, library versions, or test results.
Prefer "unknown — logged as SPEC-GAP" over a confident guess.

---

## 7. Git rules

- Stage with **`git add -A`**. Commit with **`git commit -m "<summary>"`** — a single
  imperative summary line (Conventional Commits style is encouraged by the repo hooks).

- **No co-author lines, trailers, signatures, or "Generated with" footers.** Ever.
  (`includeCoAuthoredBy` is off in settings; do not re-add it in the message body.)

- After a phase passes independent verify **and** the human gate, tag it:
  **`git tag pNN-verified`** (e.g. `p02-verified`).

- **Never** run: `git push`, `git remote …`, `git rebase`, `git reset --hard`,
  `git commit --amend`, `git filter-branch`, or any history rewrite. Pushing is the
  human's job, done manually.

- Never commit secrets. `.env` is off-limits; only `.env.example` is readable/editable.

---

## 8. Human gates (stop and ask — never self-approve)

Pause and require explicit human approval before:

- Committing or tagging a phase (§5 step 7).
- Changing `.claude/settings.json`, hooks, permissions, or CI that grants new access.
- Adding or enabling any **paid / external service** (Sentry, new SaaS, a new API key,
  RevenueCat live keys) or installing a **native module** that forces a prebuild.

- Any **production** action (EAS build/submit, store deploy, DB migration against a
  real project).

- **Deleting data** or files, dropping tables, destructive SQL, or `rm -rf`.
- Bumping the Expo SDK or any major dependency.

---

## 9. Definition of Done (per phase)

A phase is Done only when **all** hold, with evidence:

- [ ] Phase spec/DoD written and agreed in the plan step.
- [ ] Tests written first; they now pass. New code has meaningful tests.
- [ ] `npm run typecheck` clean.
- [ ] `npm run lint` clean at `--max-warnings=0`.
- [ ] `npm test` green (full suite, once — §10); `rag/` `pytest` green if touched.
- [ ] `npm run format:check` and `markdownlint` clean.
- [ ] Code, security, and UX reviews completed; all findings fixed or logged.
- [ ] Independent verifier re-ran the DoD from clean and reports PASS with output.
- [ ] All SPEC-GAPs for the phase recorded in `docs/SPEC-GAPS.md`.
- [ ] No secrets committed; no banned git ops used.

"Done" is never claimed without the actual command output (see
`verification-before-completion`). If a step was skipped, say so.

---

## 10. Speed rules

- **Fix loops run only affected tests.** Use `jest <path>` / `pytest <file>::<test>`.
  Run the **full suite once per phase**, at the verify step.

- **Run independent agents in parallel.** The three reviewers (code, security, UX)
  have no dependency on each other — launch them together, not in series.

- **Collect SPEC-GAPs; don't interrupt.** Log them as you go and present the whole
  list at the human gate, rather than stopping mid-build for each one.

- Prefer targeted search/read over re-reading whole trees. Reuse the running
  `claude-code-guide`/Explore results instead of re-deriving them.

- Keep reviewers read-only so their runs can't invalidate each other's state.

---

## 11. Repo-specific guardrails

- `--max-warnings=0` is a hard gate — never weaken an ESLint rule to pass; fix the code.
- RLS is the isolation boundary (`docs/RAG.md`). Never introduce a service-role key on
  a user-data request path; forward the user JWT.

- `EXPO_PUBLIC_*` values are bundled into the client — **no secrets there**. User-supplied
  secrets (Gemini key, PIN) live in `expo-secure-store` (`lib/secureStore.ts`, `lib/pin.ts`).

- Mobile-only features (biometric lock, SecureStore, haptics) must degrade gracefully
  on web, never crash it.

- The RAG service is **optional**; the app must build and run with it absent.
