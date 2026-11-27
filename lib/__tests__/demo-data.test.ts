import { createHash } from 'crypto';

import {
  cleanStreakStats,
  clearThread,
  ensureTodayWorkout,
  findTodayWorkout,
  habitCountToday,
  habitLast7Days,
  isNewPR,
  last30dContext,
  listExercises,
  loadCoachMemory,
  loadProfile,
  loadThread,
  logHabit,
  logSet,
  todaySets,
  undoLastHabit,
  upsertMemory,
  upsertProfile,
  workoutStreak,
} from '../queries';
import { supabase } from '../supabase';
import { createDemoSupabase, createMemoryStore, DEMO_PIN_HASH, DemoDb } from '../demo-data';
import { localDay, shiftDay } from '../streaks';

// (Hoisted by Jest.) Run the REAL data-access layer on top of the demo client, as the app does in
// demo-data mode.
jest.mock('../supabase', () => ({
  supabase: require('../demo-data').createDemoSupabase(),
}));

describe('demo data through lib/queries.ts', () => {
  it('signs in a local demo user without any network', async () => {
    const { data } = await supabase.auth.getSession();
    expect(data.session?.user.email).toBe('demo@example.invalid');
  });

  it('seeds a clean cigarette run below the record', async () => {
    const s = await cleanStreakStats('cigarette');
    expect(s).toMatchObject({ current: 9, previousBest: 14, relapsedToday: false });
    expect(await habitCountToday('cigarette')).toBe(0);
  });

  it('seeds an alcohol relapse today that broke a 6-day run (record 10)', async () => {
    const s = await cleanStreakStats('alcohol');
    expect(s).toMatchObject({ relapsedToday: true, brokenStreak: 6, previousBest: 10 });
    expect(await habitCountToday('alcohol')).toBe(2);
    const week = await habitLast7Days('alcohol');
    expect(week).toHaveLength(7);
    expect(week[6].total).toBe(2);
  });

  it('seeds a 12-day workout streak and today’s sets', async () => {
    expect(await workoutStreak()).toBe(12);
    const id = await ensureTodayWorkout();
    expect(id).toBe('demo-w-0');
    const sets = await todaySets(id);
    expect(sets.map((s) => s.exercise_name)).toEqual(
      expect.arrayContaining(['Bench Press', 'Barbell Squat']),
    );
    expect(await listExercises()).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'Bench Press' })]),
    );
  });

  it('treats 85 kg × 5 on bench as a PR, and appends it as set 3', async () => {
    expect(await isNewPR('Bench Press', 80, 6)).toBe(false);
    const saved = await logSet({
      workoutId: 'demo-w-0',
      exerciseName: 'Bench Press',
      weightKg: 85,
      reps: 5,
    });
    expect(saved.set_index).toBe(3);
    expect(await isNewPR('Bench Press', 85, 5, saved.id)).toBe(true);
  });

  it('serves chat threads oldest-first and can clear them', async () => {
    const guru = await loadThread('guru');
    expect(guru.map((m) => m.role)).toEqual(['user', 'model']);
    await clearThread('guru');
    expect(await loadThread('guru')).toEqual([]);
    expect(await loadThread('coach')).toHaveLength(2);
  });

  it('supports profile, memory upserts, habit writes and undo', async () => {
    expect((await loadProfile())?.display_name).toBe('Alex');
    await upsertProfile({ display_name: 'Sam' });
    expect((await loadProfile())?.display_name).toBe('Sam');

    await upsertMemory('goal', 'Bench 105 kg');
    const mem = await loadCoachMemory();
    expect(mem.filter((m) => m.key === 'goal')).toEqual([{ key: 'goal', value: 'Bench 105 kg' }]);

    await logHabit('intimacy');
    expect(await habitCountToday('intimacy')).toBe(1);
    expect(await undoLastHabit('intimacy')).toBe(true);
    expect(await habitCountToday('intimacy')).toBe(0);

    expect(await last30dContext()).toContain('Bench Press: 85kg x 5');
  });
});

describe('workout streak counts only days with a logged set', () => {
  // Run the REAL queries on a fresh demo client so the inner-embed semantics apply.
  const today = localDay(new Date());
  const yesterday = shiftDay(today, -1);
  const twoDaysAgo = shiftDay(today, -2);

  function seed(workouts: { id: string; performed_on: string }[], setOn: string[]) {
    const client = createDemoSupabase(
      new DemoDb({
        workouts,
        workout_sets: setOn.map((workout_id, i) => ({
          workout_id,
          exercise_name: 'Bench Press',
          set_index: i + 1,
          weight_kg: 60,
          reps: 5,
        })),
      }),
    );
    (supabase as unknown as { from: unknown }).from = client.from.bind(client);
  }

  const real = supabase.from.bind(supabase);
  afterEach(() => {
    (supabase as unknown as { from: unknown }).from = real;
  });

  it('an empty workout row today (the app was only opened) does not count', async () => {
    seed(
      [
        { id: 'w0', performed_on: today },
        { id: 'w1', performed_on: yesterday },
      ],
      ['w1'],
    );
    expect(await workoutStreak()).toBe(0);
  });

  it('an empty row in the middle breaks the run', async () => {
    seed(
      [
        { id: 'w0', performed_on: today },
        { id: 'w1', performed_on: yesterday },
        { id: 'w2', performed_on: twoDaysAgo },
      ],
      ['w0', 'w2'],
    );
    expect(await workoutStreak()).toBe(1);
  });

  it('opening the dashboard (findTodayWorkout) creates no workout row', async () => {
    seed([], []);
    expect(await findTodayWorkout()).toBeNull();
    expect((await supabase.from('workouts').select('id')).data).toEqual([]);
  });

  it('logging the first set creates the row, and the day then counts', async () => {
    seed([], []);
    const id = await ensureTodayWorkout();
    await logSet({ workoutId: id, exerciseName: 'Squat', weightKg: 100, reps: 5 });
    expect(await workoutStreak()).toBe(1);
  });
});

describe('demo client mechanics', () => {
  it('supports one-to-many embeds, with !inner dropping parents that have no children', async () => {
    const db = new DemoDb({
      workouts: [{ id: 'a' }, { id: 'b' }],
      workout_sets: [{ id: 's1', workout_id: 'a', reps: 5 }],
    });
    const inner = await db.from('workouts').select('id, workout_sets!inner(id, reps)');
    expect(inner.data).toEqual([{ id: 'a', workout_sets: [{ id: 's1', reps: 5 }] }]);
    const outer = await db.from('workouts').select('id, workout_sets(id)');
    expect(outer.data).toEqual([
      { id: 'a', workout_sets: [{ id: 's1' }] },
      { id: 'b', workout_sets: [] },
    ]);
  });

  it('reports single() errors like PostgREST and returns null for an empty maybeSingle()', async () => {
    const db = new DemoDb({ t: [{ a: 1 }, { a: 2 }] });
    expect((await db.from('t').select('a').single()).error).toBeTruthy();
    expect(await db.from('t').select().eq('a', 3).maybeSingle()).toEqual({
      data: null,
      error: null,
    });
    const upd = await db.from('t').update({ a: 5 }).eq('a', 2).select('a');
    expect(upd.data).toEqual([{ a: 5 }]);
    expect((await db.from('t').delete().gte('a', 5)).data).toBeNull();
    expect((await db.from('t').select('a')).data).toEqual([{ a: 1 }]);
  });

  it('notifies auth listeners on sign-out and sign-in', async () => {
    const client = createDemoSupabase(new DemoDb());
    const seen: (string | undefined)[] = [];
    const { data } = client.auth.onAuthStateChange((_e, s) => seen.push(s?.user.id));
    await client.auth.signOut();
    await client.auth.signInWithPassword({ email: 'x@y.z', password: 'pw' });
    data.subscription.unsubscribe();
    await client.auth.signOut();
    expect(seen).toEqual([undefined, expect.any(String)]);
  });

  it('ships a PIN hash for the documented demo PIN 1234 in lib/pin.ts format', async () => {
    const [salt, digest] = DEMO_PIN_HASH.split(':');
    expect(createHash('sha256').update(`${salt}:1234`).digest('hex')).toBe(digest);

    const store = createMemoryStore({ k: 'v' });
    expect(await store.getItemAsync('k')).toBe('v');
    await store.setItemAsync('k', 'w');
    expect(await store.getItemAsync('k')).toBe('w');
    await store.deleteItemAsync('k');
    expect(await store.getItemAsync('k')).toBeNull();
  });
});
