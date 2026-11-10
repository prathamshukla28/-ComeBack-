# ComeBack — RAG service

A small **FastAPI** service that gives the ComeBack AI coach _retrieval-augmented_
answers. Instead of dumping the user's last 30 days into every prompt, it:

1. **embeds** the question with Gemini `text-embedding-004` (768-dim),
2. **retrieves** the most relevant chunks from two pgvector stores —
   - a **curated exercise knowledge base** (shared, read-only), and
   - the **user's own history** (workout / habit / body summaries),
3. **grounds** a Gemini `gemini-2.0-flash` answer in exactly those chunks and
   returns the answer plus its sources.

## Why this design

- **pgvector in Supabase** — embeddings live in the same Postgres the app already
  trusts, so user-history vectors inherit the exact **row-level-security** model
  (`owner_id = auth.uid()`) as the rest of the schema. No second datastore to secure.
- **The user's JWT is forwarded on every user-data call.** The service talks to
  Postgres _as the end user_ via PostgREST, so RLS — not application code — decides
  what rows are visible. A bug in this service can't leak another user's memories,
  and a forged token is rejected at the database boundary. See
  [`../docs/RAG.md`](../docs/RAG.md) for the full threat model.
- **The service-role key never touches a user request path.** It's used only by the
  offline curated-KB ingest (no user data) and the authenticated RevenueCat webhook
  (billing state, never on behalf of a caller).
- **Pro is enforced here, not just in the app.** The routes spend the operator's
  Gemini key, so each checks the caller's `pro` entitlement server-side.

```text
app (RN)  --Bearer user-JWT-->  FastAPI  --embed/generate-->  Gemini
                                   |
                                   +--PostgREST (as the user, RLS on)--> Postgres + pgvector
```

## Setup

```bash
cd rag
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # fill in Supabase + Gemini values
```

Apply these once (Supabase → SQL Editor), **after** `db/schema.sql`:

```text
db/rag.sql            # pgvector stores + retrieval RPCs
db/entitlements.sql   # server-side Pro entitlements (required: every /rag/* route checks it)
```

Seed the curated knowledge base (uses the service-role key, one time / on update):

```bash
python -m ingest.exercise_kb
```

Build a user's retrievable history from their logged data (runs as that user —
needs their Supabase access token, nothing privileged):

```bash
USER_ACCESS_TOKEN="<supabase access token>" python -m ingest.user_history
```

## Run

```bash
uvicorn app.main:app --reload --port 8000
# open http://localhost:8000/docs for the interactive API
```

Point the app at it by setting `EXPO_PUBLIC_RAG_URL=http://localhost:8000` in the
project `.env`. The Fitness Guru tab then routes **Pro** users' questions through the
service; leave it unset and the app uses the direct Gemini path as before.

Every `/rag/*` route spends this service's Gemini key, so each one requires, in order:
a verified token → a free rate-limit slot → the `pro` entitlement in
`user_entitlements` (looked up under the caller's own JWT, so RLS scopes it). A
non-Pro caller gets `403` without any Gemini call. To try the service locally before
RevenueCat is wired up, grant your test user Pro from the SQL editor (snippet at the
top of `db/entitlements.sql`).

## API

| Method | Path                   | Auth                  | Purpose                                             |
| ------ | ---------------------- | --------------------- | --------------------------------------------------- |
| GET    | `/health`              | none                  | Liveness.                                           |
| POST   | `/rag/coach`           | user JWT + Pro        | Retrieve → grounded answer `{ answer, sources }`.   |
| POST   | `/rag/retrieve`        | user JWT + Pro        | Retrieved context + prompt preview (no generation). |
| POST   | `/rag/memories`        | user JWT + Pro        | Embed + upsert one user memory.                     |
| POST   | `/webhooks/revenuecat` | shared webhook secret | Billing events → `user_entitlements` (see below).   |

### RevenueCat webhook

`/webhooks/revenuecat` is disabled (404) until `REVENUECAT_WEBHOOK_SECRET` is set.
RevenueCat sends that value in the `Authorization` header; it is compared in
constant time. Purchases/renewals set `expires_at` from the event, `EXPIRATION`
revokes, cancellations keep access until expiry, anonymous RevenueCat ids are
ignored, and stale (out-of-order) events are discarded in SQL. This is the only
request path that uses `SUPABASE_SERVICE_ROLE_KEY`, and it never acts on behalf of a
calling user. Setup steps: [`docs/MONETIZATION.md`](../docs/MONETIZATION.md#webhook-setup).

## Rate limiting — scope and scaling

`app/ratelimit.py` keeps a sliding window per user **in process memory**. That is
exact for one worker, but:

- with N uvicorn/gunicorn workers each worker counts separately, so the effective
  ceiling is `RAG_RATE_LIMIT_PER_MINUTE × N`;
- with several replicas it is per replica, and counts reset on every restart.

Run a single worker per replica (the default `uvicorn app.main:app`), or install a
shared backend at startup: anything with a `check(key, now=None) -> (allowed,
retry_after)` method satisfies the `Limiter` protocol and can be plugged in with
`ratelimit.set_limiter(...)` — e.g. a Redis sorted-set window — without touching the
routes. Gemini's own per-key quota remains the final backstop.

```bash
curl -s localhost:8000/rag/coach \
  -H "Authorization: Bearer $USER_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"how deep should I squat?","thread":"guru"}' | jq
```

## Tests

```bash
pytest                 # all network (Gemini + Supabase Auth + PostgREST) mocked via respx
```

The suite covers the auth/isolation gate, the pgvector literal formatting, prompt
assembly, the similarity-threshold filter, and — crucially — asserts that the
**user's JWT** (not the anon/service key) is what reaches Postgres on a memory lookup,
that an unverified token never reaches Gemini, that the per-user throttle returns
`429` without spending, that a non-Pro caller gets `403` before any Gemini call, and
the webhook's authentication and RevenueCat event mapping. CI runs it on every push (`.github/workflows/ci.yml`, `rag` job).

## Layout

```text
rag/
├── app/
│   ├── main.py          # FastAPI routes
│   ├── config.py        # env-driven settings
│   ├── security.py      # JWT verification (local HS256 or Supabase Auth) before any spend
│   ├── ratelimit.py     # per-user sliding-window throttle (429 + Retry-After), pluggable
│   ├── entitlements.py  # server-side Pro check (403) before any spend
│   ├── webhooks.py      # RevenueCat webhook → user_entitlements
│   ├── gemini.py        # embeddings + generation (httpx)
│   ├── supabase.py      # PostgREST RPC client that forwards the user JWT
│   ├── retrieval.py     # embed → fan out to both stores → threshold filter
│   ├── prompts.py       # system prompts + grounded-context assembly
│   └── schemas.py       # request/response models
├── ingest/
│   ├── exercise_kb.py   # seed the curated KB (service-role)
│   ├── user_history.py  # summarise a user's data → memories (user JWT)
│   └── data/exercise_kb.json
└── tests/
```
