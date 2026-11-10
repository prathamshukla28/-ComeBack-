/**
 * RLS integration test — runs against a REAL Postgres + Supabase Auth.
 *
 * The unit suite (lib/__tests__/schema-policies.test.ts) checks the *shape* of the
 * policies; this checks their *behaviour* with two real users. It is skipped unless
 * these are set, so `npm test` and CI stay hermetic:
 *
 *   SUPABASE_TEST_URL               e.g. http://127.0.0.1:54321  (from `supabase start`)
 *   SUPABASE_TEST_ANON_KEY
 *   SUPABASE_TEST_SERVICE_ROLE_KEY  (used ONLY to create/delete the two test users
 *                                    and to play the RevenueCat webhook)
 *
 * Never point this at a production project: it creates and deletes auth users.
 * Setup and the exact commands are in docs/SETUP.md → "RLS integration test".
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_TEST_URL;
const ANON = process.env.SUPABASE_TEST_ANON_KEY;
const SERVICE = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const enabled = Boolean(URL && ANON && SERVICE);

const opts = { auth: { persistSession: false, autoRefreshToken: false } };

const run = enabled ? describe : describe.skip;

run('RLS against a live Supabase stack', () => {
  const stamp = Date.now();
  const password = `Test-${stamp}-pw!`;
  let admin: SupabaseClient;
  let anon: SupabaseClient;
  let alice: SupabaseClient;
  let bob: SupabaseClient;
  let aliceId = '';
  let bobId = '';

  async function signedIn(email: string): Promise<{ client: SupabaseClient; id: string }> {
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw created.error;
    const client = createClient(URL!, ANON!, opts);
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return { client, id: created.data.user.id };
  }

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE!, opts);
    anon = createClient(URL!, ANON!, opts);
    ({ client: alice, id: aliceId } = await signedIn(`rls-alice-${stamp}@example.test`));
    ({ client: bob, id: bobId } = await signedIn(`rls-bob-${stamp}@example.test`));
  }, 30_000);

  afterAll(async () => {
    for (const id of [aliceId, bobId]) if (id) await admin.auth.admin.deleteUser(id);
  });

  it('a user cannot read, change, or delete another user’s rows', async () => {
    const ins = await alice
      .from('habit_logs')
      .insert({ kind: 'cigarette', amount: 1 })
      .select('id')
      .single();
    expect(ins.error).toBeNull();
    const rowId = ins.data!.id;

    const read = await bob.from('habit_logs').select('id').eq('id', rowId);
    expect(read.data).toEqual([]);

    const upd = await bob.from('habit_logs').update({ amount: 99 }).eq('id', rowId).select('id');
    expect(upd.data ?? []).toEqual([]);

    const del = await bob.from('habit_logs').delete().eq('id', rowId).select('id');
    expect(del.data ?? []).toEqual([]);

    const still = await alice.from('habit_logs').select('amount').eq('id', rowId).single();
    expect(Number(still.data!.amount)).toBe(1);
  });

  it('a user cannot write a row owned by someone else', async () => {
    const res = await bob
      .from('habit_logs')
      .insert({ kind: 'alcohol', amount: 1, owner_id: aliceId });
    expect(res.error).not.toBeNull();
  });

  it('the anon key cannot modify the shared exercise presets', async () => {
    const res = await anon
      .from('exercises')
      .update({ muscle_group: 'hacked' })
      .eq('name', 'Bench Press')
      .select('id');
    expect(res.data ?? []).toEqual([]);
  });

  it('a user cannot self-grant Pro, by table write or by the webhook RPC', async () => {
    const direct = await alice
      .from('user_entitlements')
      .insert({ owner_id: aliceId, entitlement: 'pro' });
    expect(direct.error).not.toBeNull();

    const viaRpc = await alice.rpc('apply_entitlement_event', {
      p_owner: aliceId,
      p_entitlement: 'pro',
      p_expires_at: null,
      p_event_ms: Date.now(),
      p_revoke: false,
    });
    expect(viaRpc.error).not.toBeNull();

    const check = await alice.rpc('has_entitlement', { p_entitlement: 'pro' });
    expect(check.data).toBe(false);
  });

  it('a webhook grant is visible only to its owner, and stale events are ignored', async () => {
    const now = Date.now();
    const grant = await admin.rpc('apply_entitlement_event', {
      p_owner: aliceId,
      p_entitlement: 'pro',
      p_expires_at: new Date(now + 86_400_000).toISOString(),
      p_event_ms: now,
      p_revoke: false,
    });
    expect(grant.error).toBeNull();

    expect((await alice.rpc('has_entitlement', { p_entitlement: 'pro' })).data).toBe(true);
    expect((await bob.rpc('has_entitlement', { p_entitlement: 'pro' })).data).toBe(false);
    expect((await bob.from('user_entitlements').select('owner_id')).data).toEqual([]);

    // An older EXPIRATION delivered late must not revoke the newer grant.
    await admin.rpc('apply_entitlement_event', {
      p_owner: aliceId,
      p_entitlement: 'pro',
      p_expires_at: null,
      p_event_ms: now - 60_000,
      p_revoke: true,
    });
    expect((await alice.rpc('has_entitlement', { p_entitlement: 'pro' })).data).toBe(true);
  });

  it('two inserts with the same set number are rejected (set_index integrity)', async () => {
    const w = await alice
      .from('workouts')
      .insert({ performed_on: '2026-01-01' })
      .select('id')
      .single();
    const row = { workout_id: w.data!.id, exercise_name: 'Bench Press', set_index: 1, reps: 5 };
    expect((await alice.from('workout_sets').insert(row)).error).toBeNull();
    expect((await alice.from('workout_sets').insert(row)).error?.code).toBe('23505');
  });
});

if (!enabled) {
  // Keep one visible, always-passing test so the skip is explicit in the output.
  it('RLS integration test skipped — set SUPABASE_TEST_* to run it', () => {
    expect(enabled).toBe(false);
  });
}
