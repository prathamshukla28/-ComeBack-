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

| Table           | Scope           | RLS                                 | Written by                    |
| --------------- | --------------- | ----------------------------------- | ----------------------------- |
| `exercise_kb`   | shared, curated | `select` for all; no client writes  | offline ingest (service-role) |
| `user_memories` | per user        | `owner_id = auth.uid()` for all ops | the user, via `/rag/memories` |

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
3. **Optional local JWT verification** (`SUPABASE_JWT_SECRET`) rejects forged/expired
   tokens before a DB round-trip. Even without it, PostgREST verifies the signature at
   the DB boundary, so a forged token fails there.

**Why not the usual "service-role key + `where user_id = ?`" pattern?** That makes
isolation depend on every query remembering the filter — one missed `where` leaks
everything. Here the filter is a database invariant, not a coding convention. The
service-role key exists only for `ingest/exercise_kb.py`, which writes shared curated
data and reads no user rows.

**Test that pins it:** `tests/test_api.py::test_coach_forwards_user_jwt_to_supabase`
asserts the outbound memory-lookup request carries the user's bearer token, not the
anon/service key.

## Retrieval-quality choices

- **Task-typed embeddings.** Stored chunks are embedded as `RETRIEVAL_DOCUMENT`,
  queries as `RETRIEVAL_QUERY` — Gemini aligns them into a shared space and this
  measurably beats embedding both the same way.
- **Cosine distance** (`<=>`) with an `ivfflat` index per store; `similarity = 1 -
distance` is thresholded (`RAG_MIN_SIMILARITY`) so weak matches don't pad the prompt
  with noise.
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
- `ivfflat` lists are tuned for a small KB; switch to `hnsw` if the KB grows large.

## Extending it

- Chunk real sources (programs, a coaching book) into `exercise_kb` instead of the
  seed set in `ingest/data/exercise_kb.json`.
- Add a reranker (e.g. a cross-encoder) between retrieval and generation.
- Embed individual chat turns as `kind = 'chat'` memories for longer-horizon recall.
