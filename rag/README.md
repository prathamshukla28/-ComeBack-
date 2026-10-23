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
- **The service-role key never touches the request path.** It's used only by the
  offline curated-KB ingest, which handles no user data.

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

Apply the vector schema once (Supabase → SQL Editor), **after** `db/schema.sql`:

```text
db/rag.sql
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
project `.env`. The Fitness Guru tab then routes questions through the service; leave
it unset and the app uses the direct Gemini path as before.

## API

| Method | Path            | Auth            | Purpose                                             |
| ------ | --------------- | --------------- | --------------------------------------------------- |
| GET    | `/health`       | none            | Liveness.                                           |
| POST   | `/rag/coach`    | Bearer user JWT | Retrieve → grounded answer `{ answer, sources }`.   |
| POST   | `/rag/retrieve` | Bearer user JWT | Retrieved context + prompt preview (no generation). |
| POST   | `/rag/memories` | Bearer user JWT | Embed + upsert one user memory.                     |

```bash
curl -s localhost:8000/rag/coach \
  -H "Authorization: Bearer $USER_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"how deep should I squat?","thread":"guru"}' | jq
```

## Tests

```bash
pytest                 # 11 tests, all network (Gemini + Supabase) mocked via respx
```

The suite covers the auth/isolation gate, the pgvector literal formatting, prompt
assembly, the similarity-threshold filter, and — crucially — asserts that the
**user's JWT** (not the anon/service key) is what reaches Postgres on a memory lookup.

## Layout

```text
rag/
├── app/
│   ├── main.py          # FastAPI routes
│   ├── config.py        # env-driven settings
│   ├── security.py      # JWT extraction / optional local verification
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
