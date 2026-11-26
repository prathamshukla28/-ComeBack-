-- ComeBack — migration 001: exact vector search for the RAG stores
-- Run this in: Supabase Dashboard → SQL Editor, AFTER db/rag.sql, on a project that
-- ran an older db/rag.sql (one that created the two ivfflat indexes below). A fresh
-- install doesn't need it: db/rag.sql no longer creates them. Idempotent: safe to
-- re-run. It drops two indexes only; no table or row is touched.
--
-- Why:
--   * exercise_kb holds ~15 curated chunks. pgvector suggests lists ≈ rows / 1000
--     (so lists = 100 suits ~100k rows). On 15 rows most of the 100 lists are empty
--     and, at the default ivfflat.probes = 1, a query searches one list, so it can
--     return fewer than k matches or miss the best one. An exact scan of this few
--     rows is 100% recall and faster.
--   * user_memories is read only through RLS (owner_id = auth.uid()). An ANN index
--     ranks across every user's rows and the owner filter runs afterwards, so the
--     caller could get fewer than k of their own memories. Without it, Postgres uses
--     user_memories_owner_kind_idx to find the caller's few dozen rows and ranks
--     them exactly.
--   * When the KB grows past ~10k rows, add HNSW instead of re-adding ivfflat:
--       create index if not exists exercise_kb_embedding_hnsw_idx
--         on public.exercise_kb using hnsw (embedding vector_cosine_ops);

drop index if exists public.exercise_kb_embedding_idx;
drop index if exists public.user_memories_embedding_idx;

-- Fresh planner statistics for the exact-scan plans.
analyze public.exercise_kb;
analyze public.user_memories;
