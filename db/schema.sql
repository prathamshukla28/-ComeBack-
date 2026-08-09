-- ComeBack — Supabase schema (single user, RLS-ready for multi-user later)
-- Run this in: Supabase Dashboard → SQL Editor → New query → paste → Run
--
-- Design notes:
--   * `owner_id` on every row = auth.uid(). RLS policies enforce "you only see your rows."
--   * Single-user for now, but the schema is already multi-user-safe.
--   * All timestamps stored UTC (timestamptz).
--   * `habit_logs.kind` is an enum-like text column: 'cigarette' | 'alcohol' | 'intimacy'.
--   * Chat threads: 'guru' (fitness) | 'coach' (life).

------------------------------------------------------------
-- Extensions
------------------------------------------------------------
create extension if not exists "pgcrypto";

------------------------------------------------------------
-- Helper: auto-set owner_id to the calling user
------------------------------------------------------------
create or replace function public.set_owner_id()
returns trigger language plpgsql as $$
begin
  if new.owner_id is null then
    new.owner_id := auth.uid();
  end if;
  return new;
end $$;

------------------------------------------------------------
-- user_profile  (one row per user)
------------------------------------------------------------
create table if not exists public.user_profile (
  owner_id     uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  dob          date,
  height_cm    numeric(5,1),
  goals        text,
  bio          text,          -- fed to Life Coach as long-term context
  units        text default 'metric',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

------------------------------------------------------------
-- exercises  (preset library, shared across users)
------------------------------------------------------------
create table if not exists public.exercises (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  muscle_group  text not null,           -- 'chest' | 'back' | 'legs' | ...
  is_custom     boolean not null default false,
  owner_id      uuid references auth.users(id) on delete cascade
);

------------------------------------------------------------
-- workouts + workout_sets
------------------------------------------------------------
create table if not exists public.workouts (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  performed_on date not null default current_date,
  name        text,
  notes       text,
  created_at  timestamptz not null default now()
);
create index if not exists workouts_owner_date_idx on public.workouts (owner_id, performed_on desc);

create table if not exists public.workout_sets (
  id           uuid primary key default gen_random_uuid(),
  workout_id   uuid not null references public.workouts(id) on delete cascade,
  owner_id     uuid not null references auth.users(id) on delete cascade,
  exercise_id  uuid references public.exercises(id),
  exercise_name text not null,  -- denormalized for fast history
  set_index    int not null,
  weight_kg    numeric(6,2),
  reps         int,
  rir          int,             -- reps in reserve
  created_at   timestamptz not null default now()
);
create index if not exists workout_sets_owner_exercise_idx on public.workout_sets (owner_id, exercise_name, created_at desc);

------------------------------------------------------------
-- body_metrics
------------------------------------------------------------
create table if not exists public.body_metrics (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  measured_on date not null default current_date,
  weight_kg   numeric(5,2),
  body_fat_pct numeric(4,1),
  notes       text,
  created_at  timestamptz not null default now()
);
create index if not exists body_metrics_owner_date_idx on public.body_metrics (owner_id, measured_on desc);

------------------------------------------------------------
-- habit_logs  (cigarettes, alcohol, intimacy — unified)
------------------------------------------------------------
create table if not exists public.habit_logs (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('cigarette','alcohol','intimacy')),
  amount     numeric(6,2) not null default 1,  -- cigs = count, alcohol = units, intimacy = count
  meta       jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists habit_logs_owner_kind_time_idx on public.habit_logs (owner_id, kind, occurred_at desc);

------------------------------------------------------------
-- chat_messages  (guru + coach threads)
------------------------------------------------------------
create table if not exists public.chat_messages (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  thread     text not null check (thread in ('guru','coach')),
  role       text not null check (role in ('user','model','system')),
  content    text not null,
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_thread_idx on public.chat_messages (owner_id, thread, created_at asc);

------------------------------------------------------------
-- coach_memory  (long-term facts about the user, updated by AI)
------------------------------------------------------------
create table if not exists public.coach_memory (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  key        text not null,
  value      text not null,
  updated_at timestamptz not null default now(),
  unique (owner_id, key)
);

------------------------------------------------------------
-- Attach owner_id trigger to all owned tables
------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'workouts','workout_sets','body_metrics',
    'habit_logs','chat_messages','coach_memory','user_profile','exercises'
  ] loop
    execute format(
      'drop trigger if exists set_owner_id_trg on public.%I;
       create trigger set_owner_id_trg before insert on public.%I
       for each row execute function public.set_owner_id();', t, t);
  end loop;
end $$;

------------------------------------------------------------
-- Row Level Security
------------------------------------------------------------
alter table public.user_profile   enable row level security;
alter table public.workouts       enable row level security;
alter table public.workout_sets   enable row level security;
alter table public.body_metrics   enable row level security;
alter table public.habit_logs     enable row level security;
alter table public.chat_messages  enable row level security;
alter table public.coach_memory   enable row level security;
alter table public.exercises      enable row level security;

-- Owner-only policies (drop-if-exists so this script is idempotent)
-- Postgres RLS: SELECT/DELETE accept only USING; INSERT accepts only WITH CHECK;
-- UPDATE accepts both. We use FOR ALL with both to cover every case in one policy.
do $$
declare t text;
begin
  foreach t in array array[
    'user_profile','workouts','workout_sets','body_metrics',
    'habit_logs','chat_messages','coach_memory'
  ] loop
    execute format('drop policy if exists %I on public.%I;', t||'_own_all', t);
    execute format(
      'create policy %I on public.%I for all
       using (owner_id = auth.uid())
       with check (owner_id = auth.uid());',
      t||'_own_all', t);
  end loop;
end $$;

-- Exercises: everyone can read presets; users manage their own custom ones
drop policy if exists exercises_select_all on public.exercises;
create policy exercises_select_all on public.exercises
  for select using (true);

drop policy if exists exercises_write_own on public.exercises;
create policy exercises_write_own on public.exercises
  for all using (is_custom = false or owner_id = auth.uid())
  with check (is_custom = false or owner_id = auth.uid());

------------------------------------------------------------
-- Seed: common exercises
------------------------------------------------------------
insert into public.exercises (name, muscle_group, is_custom) values
  ('Bench Press','chest',false),
  ('Incline Dumbbell Press','chest',false),
  ('Push-up','chest',false),
  ('Pull-up','back',false),
  ('Barbell Row','back',false),
  ('Lat Pulldown','back',false),
  ('Deadlift','back',false),
  ('Overhead Press','shoulders',false),
  ('Lateral Raise','shoulders',false),
  ('Barbell Squat','legs',false),
  ('Romanian Deadlift','legs',false),
  ('Leg Press','legs',false),
  ('Leg Curl','legs',false),
  ('Calf Raise','legs',false),
  ('Barbell Curl','arms',false),
  ('Hammer Curl','arms',false),
  ('Tricep Pushdown','arms',false),
  ('Skull Crusher','arms',false),
  ('Plank','core',false),
  ('Hanging Leg Raise','core',false)
on conflict (name) do nothing;
