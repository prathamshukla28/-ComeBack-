-- ComeBack — RAG / pgvector schema
-- Run this in: Supabase Dashboard → SQL Editor, AFTER db/schema.sql.
--
-- Design notes:
--   * Embeddings are produced by Gemini `text-embedding-004` → 768 dimensions.
--   * Two stores:
--       - exercise_kb   : curated, SHARED knowledge. Public read, no owner.
--       - user_memories : per-user vectors (workout/habit summaries, notes).
--                         Owner-only RLS — identical isolation model to schema.sql.
--   * Retrieval goes through SECURITY INVOKER functions so the caller's JWT
--     (and therefore RLS) is always in force. The Python service NEVER uses the
--     service_role key for user data; it forwards the end user's access token.
--   * Cosine distance (`<=>`) with normalized-friendly ordering; we expose a
--     `similarity` = 1 - distance for convenience.

------------------------------------------------------------
-- Extension
------------------------------------------------------------
create extension if not exists "vector";

------------------------------------------------------------
-- exercise_kb  (curated, shared, read-only to clients)
------------------------------------------------------------
create table if not exists public.exercise_kb (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null,                 -- stable id for a source chunk
  title         text not null,                 -- e.g. "Barbell Squat — setup"
  section       text,                          -- e.g. 'form' | 'programming' | 'safety'
  muscle_group  text,                          -- optional filter: 'legs' | 'back' | ...
  content       text not null,                 -- the chunk fed to the model
  source        text,                          -- provenance (book/url/author)
  embedding     vector(768) not null,
  created_at    timestamptz not null default now(),
  unique (slug)
);

-- Approximate-NN index. ivfflat needs ANALYZE + a populated table to be useful;
-- lists≈sqrt(rows). For a small curated KB this is plenty; swap to hnsw if you grow it.
create index if not exists exercise_kb_embedding_idx
  on public.exercise_kb using ivfflat (embedding vector_cosine_ops) with (lists = 100);
create index if not exists exercise_kb_muscle_idx on public.exercise_kb (muscle_group);

------------------------------------------------------------
-- user_memories  (per-user retrievable context)
------------------------------------------------------------
create table if not exists public.user_memories (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  kind        text not null check (kind in ('workout_summary','habit_summary','body_summary','note','chat')),
  content     text not null,
  metadata    jsonb not null default '{}'::jsonb,
  embedding   vector(768) not null,
  -- dedupe key so re-ingesting a rolling window UPSERTs instead of piling up
  dedupe_key  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (owner_id, dedupe_key)
);

create index if not exists user_memories_embedding_idx
  on public.user_memories using ivfflat (embedding vector_cosine_ops) with (lists = 100);
create index if not exists user_memories_owner_kind_idx
  on public.user_memories (owner_id, kind, created_at desc);

-- Reuse the owner_id auto-set trigger + owner-only RLS from schema.sql's pattern.
drop trigger if exists set_owner_id_trg on public.user_memories;
create trigger set_owner_id_trg before insert on public.user_memories
  for each row execute function public.set_owner_id();

alter table public.user_memories enable row level security;
alter table public.exercise_kb   enable row level security;

drop policy if exists user_memories_own_all on public.user_memories;
create policy user_memories_own_all on public.user_memories for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Curated KB: anyone authenticated may read; only privileged roles (service_role,
-- used by the offline ingest script) may write. No client-side writes.
drop policy if exists exercise_kb_select_all on public.exercise_kb;
create policy exercise_kb_select_all on public.exercise_kb
  for select using (true);

------------------------------------------------------------
-- Retrieval RPCs  (SECURITY INVOKER → caller's RLS applies)
------------------------------------------------------------

-- Curated knowledge. Shared, so no owner filter — just optional muscle_group.
create or replace function public.match_exercise_kb(
  query_embedding vector(768),
  match_count int default 5,
  filter_muscle text default null
)
returns table (
  id uuid,
  slug text,
  title text,
  section text,
  muscle_group text,
  content text,
  source text,
  similarity float
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    e.id, e.slug, e.title, e.section, e.muscle_group, e.content, e.source,
    1 - (e.embedding <=> query_embedding) as similarity
  from public.exercise_kb e
  where filter_muscle is null or e.muscle_group = filter_muscle
  order by e.embedding <=> query_embedding
  limit greatest(1, least(match_count, 20));
$$;

-- User history. SECURITY INVOKER means RLS restricts rows to auth.uid() — a user
-- can only ever match their OWN memories, enforced by Postgres, not by app code.
create or replace function public.match_user_memories(
  query_embedding vector(768),
  match_count int default 5,
  filter_kind text default null
)
returns table (
  id uuid,
  kind text,
  content text,
  metadata jsonb,
  created_at timestamptz,
  similarity float
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    m.id, m.kind, m.content, m.metadata, m.created_at,
    1 - (m.embedding <=> query_embedding) as similarity
  from public.user_memories m
  where filter_kind is null or m.kind = filter_kind
  order by m.embedding <=> query_embedding
  limit greatest(1, least(match_count, 20));
$$;

-- Upsert a user memory under the caller's identity (RLS enforces owner = caller).
-- owner_id is left null → set_owner_id trigger fills it from auth.uid().
create or replace function public.upsert_user_memory(
  p_kind text,
  p_content text,
  p_embedding vector(768),
  p_metadata jsonb default '{}'::jsonb,
  p_dedupe_key text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.user_memories (kind, content, embedding, metadata, dedupe_key)
  values (p_kind, p_content, p_embedding, p_metadata, p_dedupe_key)
  on conflict (owner_id, dedupe_key) do update
    set content = excluded.content,
        embedding = excluded.embedding,
        metadata = excluded.metadata,
        updated_at = now()
  returning id into v_id;
  return v_id;
end $$;

------------------------------------------------------------
-- Grants: expose RPCs to normal authenticated clients.
------------------------------------------------------------
grant execute on function public.match_exercise_kb(vector, int, text) to anon, authenticated;
grant execute on function public.match_user_memories(vector, int, text) to authenticated;
grant execute on function public.upsert_user_memory(text, text, vector, jsonb, text) to authenticated;
