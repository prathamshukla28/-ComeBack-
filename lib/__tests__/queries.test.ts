import AsyncStorage from '@react-native-async-storage/async-storage';
import { argsOf, db } from '../../test-utils/supabase-mock';
import { enqueueHabit, pendingCount } from '../outbox';
import {
  cleanStreak,
  cleanStreakStats,
  ensureTodayWorkout,
  estimateOneRepMax,
  findTodayWorkout,
  habitCountToday,
  isNewPR,
  isUniqueViolation,
  last30dContext,
  loadCoachMemory,
  loadProfile,
  loadThread,
  LOG_SET_MAX_ATTEMPTS,
  logHabit,
  logHabitResilient,
  logSet,
  NEVER_LOGGED,
  PRIVATE_HABIT,
  undoLastHabit,
  upsertProfile,
  workoutDailyCounts,
  workoutStreak,
} from '../queries';

jest.mock('../supabase', () => require('../../test-utils/supabase-mock').supabaseModule);
jest.mock('expo-crypto', () => ({ randomUUID: () => require('crypto').randomUUID() }));

beforeEach(async () => {
  db.reset();
  await AsyncStorage.clear();
});

/* ------------------------------------------------------------------ */
/* Habits                                                              */
/* ------------------------------------------------------------------ */

describe('habits', () => {
  it('habitCountToday returns 0 with no rows and treats null amounts as 0', async () => {
    db.queue('habit_logs', { data: [] }, { data: [{ amount: null }, { amount: 4 }] });
    await expect(habitCountToday('cigarette')).resolves.toBe(0);
    await expect(habitCountToday('cigarette')).resolves.toBe(4);
  });

  it('cleanStreak returns the NEVER_LOGGED sentinel with no history', async () => {
    db.queue('habit_logs', { data: [] });
    await expect(cleanStreak('cigarette')).resolves.toBe(NEVER_LOGGED);
  });

  it('cleanStreakStats reads the NEWEST logs so heavy loggers get a correct current run', async () => {
    db.queue('habit_logs', { data: [] });
    await cleanStreakStats('alcohol');
    const call = db.callsTo('habit_logs')[0];
    expect(argsOf(call, 'order')).toEqual(['occurred_at', { ascending: false }]);
    expect(argsOf(call, 'limit')).toEqual([2000]);
  });

  it('propagates query errors', async () => {
    db.queue('habit_logs', { error: { message: 'rls' } });
    await expect(cleanStreak('cigarette')).rejects.toEqual({ message: 'rls' });
  });

  it('logHabit inserts and returns the row; passes a client id through', async () => {
    db.queue('habit_logs', { data: { id: 'h1', kind: 'cigarette' } });
    await expect(logHabit('cigarette', 2, { note: 'x' }, 'h1')).resolves.toMatchObject({
      id: 'h1',
    });
    expect(argsOf(db.callsTo('habit_logs')[0], 'insert')).toEqual([
      { kind: 'cigarette', amount: 2, meta: { note: 'x' }, id: 'h1' },
    ]);
  });

  it('undoLastHabit deletes the newest log, or returns false when empty', async () => {
    db.queue('habit_logs', { data: [{ id: 'h9' }] }, { data: null });
    await expect(undoLastHabit('alcohol')).resolves.toBe(true);
    expect(argsOf(db.callsTo('habit_logs')[1], 'eq')).toEqual(['id', 'h9']);

    db.reset();
    db.queue('habit_logs', { data: [] });
    await expect(undoLastHabit('alcohol')).resolves.toBe(false);
  });

  it('undoLastHabit surfaces a delete error', async () => {
    db.queue('habit_logs', { data: [{ id: 'h9' }] }, { error: { message: 'denied' } });
    await expect(undoLastHabit('alcohol')).rejects.toEqual({ message: 'denied' });
  });

  it('undoLastHabit takes back a newer tap still queued offline, not the older synced row', async () => {
    await enqueueHabit({
      id: '7d5f3b2e-1a4c-4e8f-9b6d-2c1a0e9f8d7b',
      kind: 'intimacy',
      amount: 1,
      occurred_at: '2026-10-25T12:00:00.000Z',
    });
    db.queue('habit_logs', { data: [{ id: 'h-old', occurred_at: '2026-10-25T09:00:00.000Z' }] });
    await expect(undoLastHabit('intimacy')).resolves.toBe(true);
    expect(await pendingCount()).toBe(0);
    // the synced row is untouched: only the lookup ran, no delete
    expect(db.callsTo('habit_logs')).toHaveLength(1);
  });

  it('undoLastHabit deletes the server row when it is newer than anything queued', async () => {
    await enqueueHabit({
      id: '7d5f3b2e-1a4c-4e8f-9b6d-2c1a0e9f8d7b',
      kind: 'alcohol',
      amount: 1,
      occurred_at: '2026-10-25T08:00:00.000Z',
    });
    db.queue(
      'habit_logs',
      { data: [{ id: 'h-new', occurred_at: '2026-10-25T09:00:00.000Z' }] },
      { data: null },
    );
    await expect(undoLastHabit('alcohol')).resolves.toBe(true);
    expect(argsOf(db.callsTo('habit_logs')[1], 'eq')).toEqual(['id', 'h-new']);
    expect(await pendingCount()).toBe(1);
  });
});

describe('logHabitResilient', () => {
  it('queues a network failure with the same id it tried live (idempotent replay)', async () => {
    db.queue('habit_logs', { error: new Error('Network request failed') });
    await expect(logHabitResilient('intimacy')).resolves.toEqual({ queued: true });
    const sentId = (argsOf(db.callsTo('habit_logs')[0], 'insert')?.[0] as { id: string }).id;
    const stored = JSON.parse((await AsyncStorage.getItem('comeback.outbox.habits.v1')) ?? '[]');
    expect(stored).toEqual([expect.objectContaining({ id: sentId, kind: 'intimacy', amount: 1 })]);
  });

  it('throws a genuine server rejection instead of queueing it', async () => {
    db.queue('habit_logs', { error: { message: 'new row violates row-level security policy' } });
    await expect(logHabitResilient('alcohol')).rejects.toEqual({
      message: 'new row violates row-level security policy',
    });
    expect(await pendingCount()).toBe(0);
  });

  it('a live write that succeeds replays anything queued earlier (the connection is back)', async () => {
    await enqueueHabit({
      id: '7d5f3b2e-1a4c-4e8f-9b6d-2c1a0e9f8d7b',
      kind: 'cigarette',
      amount: 1,
      occurred_at: '2026-10-25T08:00:00.000Z',
    });
    db.queue('habit_logs', { data: { id: 'live' } }, { error: null });
    await expect(logHabitResilient('cigarette')).resolves.toEqual({ queued: false });
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    expect(await pendingCount()).toBe(0);
    expect(argsOf(db.callsTo('habit_logs')[1], 'insert')?.[0]).toMatchObject({
      id: '7d5f3b2e-1a4c-4e8f-9b6d-2c1a0e9f8d7b',
    });
  });
});

/* ------------------------------------------------------------------ */
/* Sets: logSet race handling + PR detection                           */
/* ------------------------------------------------------------------ */

const SET_ARGS = { workoutId: 'w1', exerciseName: 'Bench Press', weightKg: 100, reps: 5 };

describe('logSet', () => {
  it('writes max+1 and returns the saved row', async () => {
    db.queue('workout_sets', { data: [{ set_index: 3 }] }, { data: { id: 's4', set_index: 4 } });
    await expect(logSet(SET_ARGS)).resolves.toEqual({ id: 's4', set_index: 4 });
    const insert = argsOf(db.callsTo('workout_sets')[1], 'insert')?.[0] as Record<string, unknown>;
    expect(insert).toMatchObject({ set_index: 4, exercise_id: null, rir: null });
  });

  it('starts at 1 for the first set', async () => {
    db.queue('workout_sets', { data: [] }, { data: { id: 's1' } });
    await logSet({ ...SET_ARGS, exerciseId: 'e1', rir: 2 });
    const insert = argsOf(db.callsTo('workout_sets')[1], 'insert')?.[0] as Record<string, unknown>;
    expect(insert).toMatchObject({ set_index: 1, exercise_id: 'e1', rir: 2 });
  });

  it('re-reads and retries when it loses the set_index race (23505)', async () => {
    db.queue(
      'workout_sets',
      { data: [{ set_index: 2 }] },
      { error: { code: '23505', message: 'duplicate key' } },
      { data: [{ set_index: 3 }] },
      { data: { id: 's4', set_index: 4 } },
    );
    await expect(logSet(SET_ARGS)).resolves.toMatchObject({ id: 's4' });
    const inserts = db
      .callsTo('workout_sets')
      .map((c) => argsOf(c, 'insert')?.[0] as { set_index: number } | undefined)
      .filter(Boolean);
    expect(inserts.map((i) => i!.set_index)).toEqual([3, 4]);
  });

  it(`gives up after ${LOG_SET_MAX_ATTEMPTS} conflicting attempts`, async () => {
    const conflict = { error: { code: '23505' } };
    for (let i = 0; i < LOG_SET_MAX_ATTEMPTS; i++) db.queue('workout_sets', { data: [] }, conflict);
    await expect(logSet(SET_ARGS)).rejects.toEqual({ code: '23505' });
    expect(db.callsTo('workout_sets')).toHaveLength(LOG_SET_MAX_ATTEMPTS * 2);
  });

  it('does not retry other insert errors', async () => {
    db.queue('workout_sets', { data: [] }, { error: { code: '42501', message: 'rls' } });
    await expect(logSet(SET_ARGS)).rejects.toMatchObject({ code: '42501' });
    expect(db.callsTo('workout_sets')).toHaveLength(2);
  });

  it('surfaces a failed index read instead of guessing index 1', async () => {
    db.queue('workout_sets', { error: { message: 'timeout' } });
    await expect(logSet(SET_ARGS)).rejects.toEqual({ message: 'timeout' });
    expect(db.callsTo('workout_sets')).toHaveLength(1);
  });

  it('isUniqueViolation recognises only 23505', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
    expect(isUniqueViolation({ code: '23503' })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(new Error('x'))).toBe(false);
  });
});

describe('isNewPR', () => {
  it('excludes the just-saved set by id on the server', async () => {
    db.queue('workout_sets', { data: [{ id: 'a', weight_kg: 90, reps: 5 }] });
    await expect(isNewPR('Bench Press', 100, 5, 'just-saved')).resolves.toBe(true);
    expect(argsOf(db.callsTo('workout_sets')[0], 'neq')).toEqual(['id', 'just-saved']);
  });

  it('is order-independent: a stronger prior set anywhere in the list wins', async () => {
    db.queue('workout_sets', {
      data: [
        { id: 'a', weight_kg: 80, reps: 5 },
        { id: 'b', weight_kg: '120.00', reps: 5 },
        { id: 'c', weight_kg: 60, reps: 10 },
      ],
    });
    await expect(isNewPR('Bench Press', 110, 5, 'x')).resolves.toBe(false);
  });

  it('is true for the first ever set of an exercise', async () => {
    db.queue('workout_sets', { data: [] });
    await expect(isNewPR('Squat', 60, 5, 'x')).resolves.toBe(true);
  });

  it('without an id, it is a hypothetical check against every saved set (ties are not PRs)', async () => {
    db.queue('workout_sets', { data: [{ id: 'a', weight_kg: 100, reps: 5 }] });
    await expect(isNewPR('Bench Press', 100, 5)).resolves.toBe(false);
    expect(argsOf(db.callsTo('workout_sets')[0], 'neq')).toBeUndefined();
  });

  it('propagates errors', async () => {
    db.queue('workout_sets', { error: { message: 'boom' } });
    await expect(isNewPR('bench', 100, 5, 'x')).rejects.toEqual({ message: 'boom' });
  });

  it('estimateOneRepMax is Epley', () => {
    expect(estimateOneRepMax(100, 0)).toBe(100);
    expect(estimateOneRepMax(100, 30)).toBe(200);
  });
});

/* ------------------------------------------------------------------ */
/* AI context                                                          */
/* ------------------------------------------------------------------ */

describe('last30dContext', () => {
  it('marks a failed section as unavailable instead of claiming "none"', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    db.queue('workouts', { error: { message: 'down' } });
    db.queue('habit_logs', { error: { message: 'down' } });
    db.queue('body_metrics', { error: { message: 'down' } });

    const ctx = await last30dContext();

    expect(ctx).toContain('Workouts: (unavailable');
    expect(ctx).toContain('Cigarettes total: (unavailable');
    expect(ctx).toContain('Latest body: (unavailable');
    expect(ctx).toContain('Recent sets:\nnone'); // the healthy section still renders
    expect(ctx).not.toContain('Workouts (0)');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('says "no data" when there are genuinely no rows', async () => {
    const ctx = await last30dContext();
    expect(ctx).toContain('Workouts (0): none');
    expect(ctx).toContain('Latest body: no data');
  });

  it('never fetches or mentions the private (intimacy) habit', async () => {
    db.queue('habit_logs', {
      data: [
        { kind: 'cigarette', amount: 1 },
        { kind: 'intimacy', amount: 4 },
      ],
    });
    const ctx = await last30dContext();
    // Filtered at the query, so the rows are never even downloaded for the prompt…
    expect(PRIVATE_HABIT).toBe('intimacy');
    expect(argsOf(db.callsTo('habit_logs')[0], 'neq')).toEqual(['kind', 'intimacy']);
    // …and dropped again client-side if a row slips through.
    expect(ctx).not.toMatch(/intimacy/i);
    expect(ctx).toContain('Cigarettes total: 1');
  });

  it('lists only workouts that have at least one logged set', async () => {
    await last30dContext();
    expect(argsOf(db.callsTo('workouts')[0], 'select')?.[0]).toMatch(/workout_sets!inner\(/);
  });
});

/* ------------------------------------------------------------------ */
/* Workouts: an empty workout row is not a training day                */
/* ------------------------------------------------------------------ */

describe('workout days', () => {
  it('workoutStreak asks only for workouts with at least one set (inner embed)', async () => {
    await workoutStreak();
    expect(argsOf(db.callsTo('workouts')[0], 'select')?.[0]).toMatch(/workout_sets!inner\(/);
  });

  it('workoutDailyCounts counts only workouts with at least one set', async () => {
    await workoutDailyCounts(7);
    expect(argsOf(db.callsTo('workouts')[0], 'select')?.[0]).toMatch(/workout_sets!inner\(/);
  });

  it('findTodayWorkout is read-only: no row today means null, never an insert', async () => {
    db.queue('workouts', { data: [] });
    await expect(findTodayWorkout()).resolves.toBeNull();
    const calls = db.callsTo('workouts');
    expect(calls).toHaveLength(1);
    expect(argsOf(calls[0], 'insert')).toBeUndefined();
  });

  it('ensureTodayWorkout still creates the row when a set is being logged', async () => {
    db.queue('workouts', { data: [] }, { data: { id: 'w-new' } });
    await expect(ensureTodayWorkout()).resolves.toBe('w-new');
    expect(argsOf(db.callsTo('workouts')[1], 'insert')).toBeDefined();
  });
});

/* ------------------------------------------------------------------ */
/* Chat, memory, profile                                               */
/* ------------------------------------------------------------------ */

describe('chat + profile', () => {
  it('loadThread returns messages oldest-first', async () => {
    db.queue('chat_messages', { data: [{ id: '2' }, { id: '1' }] });
    await expect(loadThread('coach')).resolves.toEqual([{ id: '1' }, { id: '2' }]);
  });

  it('loadCoachMemory returns rows', async () => {
    db.queue('coach_memory', { data: [{ key: 'k', value: 'v' }] });
    await expect(loadCoachMemory()).resolves.toEqual([{ key: 'k', value: 'v' }]);
  });

  it('loadProfile returns null when none exists', async () => {
    db.queue('user_profile', { data: null });
    await expect(loadProfile()).resolves.toBeNull();
  });

  it('upsertProfile updates an existing row by owner', async () => {
    db.queue('user_profile', { data: { owner_id: 'u1' } }, { data: null });
    await upsertProfile({ goals: 'run 5k' });
    const update = db.callsTo('user_profile')[1];
    expect(argsOf(update, 'update')?.[0]).toMatchObject({ goals: 'run 5k' });
    expect(argsOf(update, 'eq')).toEqual(['owner_id', 'u1']);
  });

  it('upsertProfile inserts when there is no row yet', async () => {
    db.queue('user_profile', { data: null }, { data: null });
    await upsertProfile({ display_name: 'P' });
    expect(argsOf(db.callsTo('user_profile')[1], 'insert')).toEqual([{ display_name: 'P' }]);
  });

  it('upsertProfile does not blindly insert when the existence check fails', async () => {
    db.queue('user_profile', { error: { message: 'network' } });
    await expect(upsertProfile({ bio: 'x' })).rejects.toEqual({ message: 'network' });
    expect(db.callsTo('user_profile')).toHaveLength(1);
  });
});
