# SPEC-GAPS

The running log of decisions the spec did not make. Per `CLAUDE.md` §6: when the spec is
silent, log the gap here, take the most conservative reversible default, mark the code
`// SPEC-GAP: <id>`, and surface it at the phase human gate. The human fills **Decision**.

## Template

```md
### SPEC-GAP-NNN — <short title>

- Phase: p<NN>
- Question: <what the spec does not answer>
- Conservative default taken: <what you did instead>
- Blast radius if wrong: <low|med|high>
- Decision: <blank until the human answers>
```

## Open (seeded at kit creation — from the doc review)

### SPEC-GAP-001 — Expo SDK version

- Phase: p00
- Question: `docs/AGENTS.md` says read Expo v57 docs; `package.json`/README are SDK 54.
- Conservative default taken: SDK 54 (code > stray doc); no upgrade without a human gate.
- Blast radius if wrong: high
- Decision:

### SPEC-GAP-002 — App version source of truth

- Phase: p00
- Question: `app.json` 1.0.0 vs `package.json` 1.0.1 vs release-please manifest disagree.
- Conservative default taken: release-please owns the version; never hand-bump.
- Blast radius if wrong: low
- Decision:

### SPEC-GAP-003 — RAG service hosting in production

- Phase: p00
- Question: how the app reaches `rag/` in prod (`EXPO_PUBLIC_RAG_URL`); no infra named.
- Conservative default taken: RAG optional/off unless URL set; assume self-hosted.
- Blast radius if wrong: med
- Decision:

### SPEC-GAP-004 — Guru tab grounding

- Phase: p00
- Question: MONETIZATION says Guru = direct Gemini, RAG "optional" — which by default?
- Conservative default taken: Guru direct-Gemini unless `EXPO_PUBLIC_RAG_URL` is present.
- Blast radius if wrong: low
- Decision:

### SPEC-GAP-005 — In-app signup / password reset

- Phase: p00
- Question: SETUP only creates users in the Supabase dashboard; no self-serve flow.
- Conservative default taken: email+password sign-in only for MVP; signup deferred.
- Blast radius if wrong: med
- Decision:

### SPEC-GAP-006 — Crash reporting / analytics

- Phase: p00
- Question: no observability tool specified (e.g. Sentry).
- Conservative default taken: structured logging only; any SaaS is a human-gated add.
- Blast radius if wrong: low
- Decision:

### SPEC-GAP-007 — Data export format (Phase 5)

- Phase: p00
- Question: export format undefined.
- Conservative default taken: JSON of the user's own rows; CSV deferred.
- Blast radius if wrong: low
- Decision:

### SPEC-GAP-008 — Offline scope

- Phase: p00
- Question: how much works offline beyond the habit outbox.
- Conservative default taken: outbox for habit logs only; other writes online-only.
- Blast radius if wrong: med
- Decision:

### SPEC-GAP-009 — Coverage threshold

- Phase: p00
- Question: no coverage gate pinned (codecov present, threshold unclear).
- Conservative default taken: coverage informational; maintain/raise, never lower;
  `--max-warnings=0` stays hard.

- Blast radius if wrong: low
- Decision:

### SPEC-GAP-010 — Accessibility / i18n scope

- Phase: p00
- Question: a11y depth and localization undefined.
- Conservative default taken: a11y roles+labels on interactive controls; English-only.
- Blast radius if wrong: med
- Decision:

### SPEC-GAP-011 — Notifications

- Phase: p00
- Question: local vs server push.
- Conservative default taken: local reminders only via `expo-notifications`; no server push.
- Blast radius if wrong: low
- Decision:

### SPEC-GAP-012 — Web feature parity

- Phase: p00
- Question: SecureStore/biometric/haptics unsupported on web.
- Conservative default taken: Intimacy lock, PIN, and secret storage are mobile-only;
  web degrades gracefully and never crashes.

- Blast radius if wrong: med
- Decision:

### SPEC-GAP-013 — AI rate limiting / abuse

- Phase: p00
- Question: free Gemini ~15 req/min; no gateway specified.
- Conservative default taken: rely on provider limits + client-side throttle messaging.
- Blast radius if wrong: med
- Decision:

### SPEC-GAP-014 — "Team" is a solo maintainer

- Phase: p00
- Question: the team table implies multiple people.
- Conservative default taken: team table + agents are role personas, not real people.
- Blast radius if wrong: low
- Decision:

### SPEC-GAP-015 — RAG runtime version

- Phase: p00
- Question: Node 22 pinned; Python version for `rag/` unpinned.
- Conservative default taken: Python 3.11 unless `rag/requirements.txt` dictates otherwise.
- Blast radius if wrong: low
- Decision:

## Logged during the security hardening pass (2026-10-27)

### SPEC-GAP-016 — RAG per-user rate limit

- Phase: p00
- Question: SPEC-GAP-013 notes the Gemini free tier (~15 req/min) but names no per-user
  ceiling for the RAG service, which spends the service's key on every request.
- Conservative default taken: in-process sliding window, **30 requests / minute / user**
  (`RAG_RATE_LIMIT_PER_MINUTE`; `0` disables), applied after token verification so an
  anonymous flood is never counted against a real user; `429` with `Retry-After`. Per
  uvicorn worker — a shared store (Redis) is the upgrade if the service scales out.
- Blast radius if wrong: low
- Decision:

### SPEC-GAP-017 — Session-at-rest encryption primitive

- Phase: p00
- Question: `CLAUDE.md` §11 puts user secrets in SecureStore but is silent on the Supabase
  session blob, which exceeds SecureStore's 2 KB value limit and so sat in plaintext
  AsyncStorage (refresh token included).
- Conservative default taken: AES-256-CTR via `aes-js` (pure JS; no native module, no
  prebuild) with the 32-byte key in SecureStore (`lib/sessionStorage.ts`). Existing
  plaintext sessions are upgraded in place on first read. Web stays plain localStorage.
- Blast radius if wrong: med
- Decision:

### SPEC-GAP-018 — Who may write the shared exercise presets

- Phase: p00
- Question: `db/schema.sql` shipped one `FOR ALL` policy on `exercises` whose `USING`
  clause was true for every preset row, so any caller — including `anon` — could rewrite
  or delete the shared library. The spec never says who may edit presets.
- Conservative default taken: presets are read-only for every client role (writable only
  via the service role / SQL editor); clients may insert, update, or delete only rows
  that are **both** `is_custom = true` **and** their own. Re-running the script drops the
  old policy. Pinned by `lib/__tests__/schema-policies.test.ts`.
- Blast radius if wrong: low
- Decision:
