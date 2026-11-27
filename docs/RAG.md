# RAG architecture & data-isolation model

ComeBack's AI coach is **retrieval-augmented**: a Python service ([`rag/`](../rag))
grounds Gemini's answers in a curated exercise knowledge base plus the user's own
history, stored as vectors in Supabase's pgvector. This doc explains the design and,
especially, **how user data stays isolated** — the part worth being able to defend.

## Pipeline

```text
          ┌─────────────────────────── FastAPI (rag/) ───────────────────────────┐
question  │  1. embed(question)  ── Gemini text-embedding-004 (RETRIEVAL_QUERY)   │
  + JWT ─▶│  2a. match_exercise_kb     (shared, curated)                          │── answer
          │  2b. match_user_memories   (THIS user only — RLS)                     │   + sources
          │  3. grounded prompt ── Gemini gemini-2.0-flash                        │
          └───────────────────────────────────────────────────────────────────────┘
                               │                         │
                     Gemini Generative API        Supabase / PostgREST
                                                  (called AS the user)
```

Two vector stores (`db/rag.sql`):

| Table           | Scope           | RLS                                 | Written by                                        |
| --------------- | --------------- | ----------------------------------- | ------------------------------------------------- |
| `exercise_kb`   | shared, curated | `select` for all; no client writes  | offline ingest (service-role)                     |
| `user_memories` | per user        | `owner_id = auth.uid()` for all ops | `ingest/user_history.py`, as the user (see below) |

Retrieval goes through `SECURITY INVOKER` SQL functions (`match_exercise_kb`,
`match_user_memories`), so they execute with the **caller's** privileges and RLS
applies inside them.

## The isolation guarantee

**Claim:** one user's coach can never retrieve another user's history, even if the
RAG service has a bug.

**How it's enforced — three layers:**

1. **Row-level security in Postgres.** `user_memories` has
   `using (owner_id = auth.uid())`. The database filters rows by the authenticated
   user regardless of what the query asks for.
2. **The user's JWT is forwarded on every user-data call.** The app sends the user's
   Supabase access token; the service passes it straight to PostgREST
   (`Authorization: Bearer <user-jwt>`). So `auth.uid()` inside the RPC _is_ the end
   user. The service does **not** hold a privileged key on the request path — there's
   no capability to read across users to misuse.
3. **Every token is verified before anything is spent.** `require_user` runs ahead of
   every Gemini call. With `SUPABASE_JWT_SECRET` set it is a local HS256 signature
   check; without it the service asks Supabase Auth (`GET /auth/v1/user`), which also
   covers projects on asymmetric signing keys. A bad token is a `401` that costs
   nothing; an unreachable verifier is a `503`, never an assumed pass. PostgREST
   verifies the signature again at the DB boundary.
4. **Per-user throttle.** After verification, a sliding window
   (`RAG_RATE_LIMIT_PER_MINUTE`, default 30) caps how fast one session can run up the
   Gemini bill; over the limit is `429` with `Retry-After`. Unverified requests are
   never counted against a real user.

**Why not the usual "service-role key + `where user_id = ?`" pattern?** That makes
isolation depend on every query remembering the filter — one missed `where` leaks
everything. Here the filter is a database invariant, not a coding convention. The
service-role key exists only for `ingest/exercise_kb.py`, which writes shared curated
data and reads no user rows.

**Tests that pin it:** `tests/test_api.py::test_coach_forwards_user_jwt_to_supabase`
asserts the outbound memory-lookup request carries the user's bearer token, not the
anon/service key; `tests/test_auth_gate.py` asserts a junk token never reaches Gemini;
`tests/test_ratelimit.py` asserts a `429` spends nothing.

## Retrieval-quality choices

- **Task-typed embeddings.** Stored chunks are embedded as `RETRIEVAL_DOCUMENT`,
  queries as `RETRIEVAL_QUERY` — Gemini aligns them into a shared space and this
  measurably beats embedding both the same way.
- **Cosine distance** (`<=>`), searched **exactly** — no approximate-NN index at this
  scale. `similarity = 1 - distance` is thresholded (`RAG_MIN_SIMILARITY`) so weak
  matches don't pad the prompt with noise. Why exact:
  - `exercise_kb` is ~15 curated rows. The original `ivfflat` index used
    `lists = 100` (pgvector's rule of thumb is about rows / 1000, so that suits ~100k
    rows); on 15 rows most lists are empty and, at the default `ivfflat.probes = 1`,
    a query searches one list and can return fewer than _k_ matches or miss the best
    one. A sequential scan of a few hundred rows is exact and faster.
  - `user_memories` is only ever read through RLS. An ANN index ranks across every
    user's rows and applies `owner_id = auth.uid()` afterwards, so a user could get
    fewer than _k_ of their own memories. Without it, Postgres finds the caller's few
    dozen rows through `user_memories_owner_kind_idx` and ranks them exactly.
  - Existing projects drop the old indexes with
    [`db/migrations/001_rag_exact_vector_search.sql`](../db/migrations/001_rag_exact_vector_search.sql)
    (idempotent; fresh installs don't need it).
- **Weekly summarisation, not raw rows.** `ingest/user_history.py` rolls workouts and
  habits into one short, dense memory per ISO week with a stable `dedupe_key`, so
  re-ingesting a rolling window upserts instead of piling up near-duplicates.
- **Grounded prompt, labelled sources.** Context is injected as `[KB#]` / `[H#]`
  blocks before the question so the model can cite what it used; `/rag/retrieve`
  returns the exact context for transparency/debugging.

## Operational notes

- `text-embedding-004` → **768 dims**, hard-coded in `db/rag.sql`, `app/config.py`,
  and validated per embedding. Changing the model means a migration + re-ingest.
- Free-tier Gemini is rate-limited (~15 req/min); each `/rag/coach` call makes one
  embed + one generate request.
- Vector search is exact (see above). If the KB grows past ~10k rows, add an HNSW
  index on `exercise_kb` (the statement is in the comments of `db/rag.sql`); HNSW
  needs no training step and keeps recall high. Don't put an ANN index on
  `user_memories` while it is read per user through RLS.
- Every `/rag/*` route is a Pro feature checked server-side (`rag/app/entitlements.py`,
  `db/entitlements.sql`); the entitlement lookup also runs under the user's JWT.
- The per-user rate limit is in-process (per worker); see `rag/README.md` →
  "Rate limiting" before running multiple workers or replicas.
- In the app, RAG grounding is used by the **Fitness Guru** tab. The **Life Coach**
  tab uses the direct Gemini path with its own long-term memory (`coach_memory`,
  validated and quoted as data — see `lib/coach-memory.ts`).

## How user history gets in

`user_memories` is filled by **`ingest/user_history.py`**, run with the user's own
access token (`USER_ACCESS_TOKEN=… python -m ingest.user_history`; see
[`rag/README.md`](../rag/README.md)). It reads the last 90 days through PostgREST
under that token, rolls them into one memory per ISO week (top set per exercise by
estimated 1RM, weekly habit totals, latest body metrics) and upserts each under a
stable `dedupe_key`.

The app does **not** write memories itself, by design — an earlier, never-called
`addMemory` client helper was removed:

- **Weekly roll-ups, not per-event rows**, are the retrieval-quality choice above.
  Writing a memory after each workout or tap would produce exactly the
  near-duplicate, low-information chunks that design avoids, or require duplicating
  the summariser in TypeScript.
- **Cost and gating.** Every memory write is a Gemini embedding on the operator's
  key behind the Pro gate; a write per logged event multiplies that for no recall
  gain.
- **One privacy choke point.** The summariser is the single place that decides what
  becomes model context, and it never reads the private habit (below).

`POST /rag/memories` stays as the API for ad-hoc notes (e.g. "tweaked my knee"),
under the same JWT + rate limit + Pro checks; the shipped app does not call it.

## What the model never sees, and safety

- **The private habit.** Intimacy logs live behind the app's PIN / biometric lock,
  so they are excluded from everything sent to Gemini: the Coach and Guru context
  (`last30dContext` in `lib/queries.ts` filters them in the query) and the RAG
  user history (`ingest/user_history.py` filters them in its query and again in the
  summariser). There is no opt-in; tests in `lib/__tests__` and
  `rag/tests/test_user_history.py` pin it.
- **Safety rules on every prompt.** Both RAG system prompts carry the same
  `SAFETY_PREAMBLE` as the app's direct-Gemini prompts (`app/safety.py` mirrors
  `lib/safety.ts`; `rag/tests/test_safety.py` fails if they drift).
- **Self-harm short-circuit.** `/rag/coach` runs the same crisis patterns as the app
  and answers a matching message with vetted crisis resources — no retrieval, no
  Gemini call — because the service can be called without the app's client-side
  gate.

## Extending it

- Chunk real sources (programs, a coaching book) into `exercise_kb` instead of the
  seed set in `ingest/data/exercise_kb.json`.
- Add a reranker (e.g. a cross-encoder) between retrieval and generation.
- Embed individual chat turns as `kind = 'chat'` memories for longer-horizon recall
  (this would be the first app-side writer of memories; keep the private-habit rule).
