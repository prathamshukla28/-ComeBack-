-- ComeBack — server-side Pro entitlements
-- Run this in: Supabase Dashboard → SQL Editor, AFTER db/schema.sql.
--
-- Why: the paywall in the app is a client-side check (RevenueCat SDK). That is
-- fine for features that run on the user's own Gemini key, but the RAG service
-- (rag/) spends the OPERATOR's Gemini key, so it must verify Pro on the server.
--
-- Design notes:
--   * user_entitlements is written ONLY by the RevenueCat webhook
--     (rag/app/webhooks.py → apply_entitlement_event) using the service_role key.
--   * Clients can READ their own row (RLS) and nothing else. There is no insert,
--     update, or delete policy and those privileges are revoked, so a user can
--     never self-grant Pro with the public anon key.
--   * has_entitlement() is SECURITY INVOKER: it runs under the caller's JWT, so RLS
--     scopes it to auth.uid(). The RAG service calls it with the user's token.
--   * expires_at null = non-expiring (lifetime purchase or a manual grant).
--   * last_event_ms guards against RevenueCat delivering webhooks out of order.
--
-- Manual grant (e.g. for a reviewer/demo account), from the SQL editor, which
-- runs as a privileged role:
--   insert into public.user_entitlements (owner_id, entitlement, source)
--   values ('<auth.users.id>', 'pro', 'manual')
--   on conflict (owner_id, entitlement) do update set expires_at = null;

------------------------------------------------------------
-- user_entitlements
------------------------------------------------------------
create table if not exists public.user_entitlements (
  owner_id      uuid not null references auth.users(id) on delete cascade,
  entitlement   text not null check (entitlement ~ '^[a-z0-9_]{1,40}$'),
  expires_at    timestamptz,
  source        text not null default 'revenuecat',
  last_event_ms bigint not null default 0,
  updated_at    timestamptz not null default now(),
  primary key (owner_id, entitlement)
);

alter table public.user_entitlements enable row level security;

drop policy if exists user_entitlements_select_own on public.user_entitlements;
create policy user_entitlements_select_own on public.user_entitlements
  for select to authenticated
  using (owner_id = auth.uid());

-- Belt and braces: even if a permissive policy were added by mistake later, the
-- client roles hold no write privilege on the table.
revoke insert, update, delete, truncate on public.user_entitlements from anon, authenticated;

------------------------------------------------------------
-- has_entitlement  (caller's own entitlement; RLS applies)
------------------------------------------------------------
create or replace function public.has_entitlement(p_entitlement text default 'pro')
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.user_entitlements e
    where e.owner_id = auth.uid()
      and e.entitlement = p_entitlement
      and (e.expires_at is null or e.expires_at > now())
  );
$$;

revoke all on function public.has_entitlement(text) from public, anon;
grant execute on function public.has_entitlement(text) to authenticated;

------------------------------------------------------------
-- apply_entitlement_event  (webhook only — service_role)
------------------------------------------------------------
-- SECURITY INVOKER: it relies on service_role bypassing RLS. Called by any other
-- role it would fail twice over (no EXECUTE grant, and no write policy/privilege).
create or replace function public.apply_entitlement_event(
  p_owner       uuid,
  p_entitlement text,
  p_expires_at  timestamptz,
  p_event_ms    bigint,
  p_revoke      boolean default false
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into public.user_entitlements as e
    (owner_id, entitlement, expires_at, source, last_event_ms, updated_at)
  values
    (p_owner, p_entitlement,
     case when p_revoke then now() else p_expires_at end,
     'revenuecat', p_event_ms, now())
  on conflict (owner_id, entitlement) do update
    set expires_at    = excluded.expires_at,
        source        = excluded.source,
        last_event_ms = excluded.last_event_ms,
        updated_at    = now()
    -- ignore a stale event that arrives after a newer one
    where e.last_event_ms <= excluded.last_event_ms;
end $$;

revoke all on function public.apply_entitlement_event(uuid, text, timestamptz, bigint, boolean)
  from public, anon, authenticated;
grant execute on function public.apply_entitlement_event(uuid, text, timestamptz, bigint, boolean)
  to service_role;
