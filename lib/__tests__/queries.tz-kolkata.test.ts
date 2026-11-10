/**
 * @jest-environment ./test-utils/timezone-env.js
 * @jest-environment-options {"timezone": "Asia/Kolkata"}
 */
/*
 * Day-bucketing and streak edge cases near local midnight, with the worker's real
 * time zone pinned (see test-utils/timezone-env.js). Every assertion here fails
 * under the old UTC-day (`toISOString().slice(0, 10)`) implementation.
 */
import { allArgsOf, argsOf, db } from '../../test-utils/supabase-mock';
import {
  cleanStreak,
  cleanStreakStats,
  ensureTodayWorkout,
  habitCountToday,
  habitLast7Days,
  last30dContext,
  workoutStreak,
} from '../queries';
import { localDay } from '../streaks';

jest.mock('../supabase', () => require('../../test-utils/supabase-mock').supabaseModule);

declare const __PINNED_TZ__: string;

function freezeAt(isoNow: string) {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  jest.setSystemTime(new Date(isoNow));
}

beforeEach(() => db.reset());
afterEach(() => jest.useRealTimers());

describe('timezone: Asia/Kolkata (UTC+05:30), 00:30 local — UTC is still "yesterday"', () => {
  // 2026-11-10T19:00Z  ==  2026-11-11 00:30 IST
  const NOW = '2026-11-10T19:00:00.000Z';
  beforeEach(() => freezeAt(NOW));

  it('the zone is really in effect', () => {
    expect(__PINNED_TZ__).toBe('Asia/Kolkata');
    expect(new Date().getTimezoneOffset()).toBe(-330);
    expect(localDay(new Date())).toBe('2026-11-11');
  });

  it('ensureTodayWorkout looks up and creates the LOCAL day, not the UTC day', async () => {
    db.queue('workouts', { data: [] }, { data: { id: 'w-new' } });
    await expect(ensureTodayWorkout()).resolves.toBe('w-new');
    const [lookup, insert] = db.callsTo('workouts');
    expect(argsOf(lookup, 'eq')).toEqual(['performed_on', '2026-11-11']);
    expect(argsOf(insert, 'insert')).toEqual([{ performed_on: '2026-11-11' }]);
  });

  it('ensureTodayWorkout reuses an existing workout for today', async () => {
    db.queue('workouts', { data: [{ id: 'w-1' }] });
    await expect(ensureTodayWorkout()).resolves.toBe('w-1');
    expect(db.callsTo('workouts')).toHaveLength(1);
  });

  it('workoutStreak counts today when today (local) has a workout', async () => {
    db.queue('workouts', {
      data: [
        { performed_on: '2026-11-11' },
        { performed_on: '2026-11-10' },
        { performed_on: '2026-11-09' },
      ],
    });
    // The old local-midnight-then-toISOString bug started counting at 2026-11-10.
    await expect(workoutStreak()).resolves.toBe(3);
  });

  it('workoutStreak is 0 when only yesterday (local) has a workout', async () => {
    db.queue('workouts', { data: [{ performed_on: '2026-11-10' }] });
    await expect(workoutStreak()).resolves.toBe(0);
  });

  it('habitLast7Days buckets a log at 00:15 local into TODAY', async () => {
    db.queue('habit_logs', {
      data: [
        { occurred_at: '2026-11-10T18:45:00.000Z', amount: 2 }, // 00:15 IST on the 11th
        { occurred_at: '2026-11-10T18:00:00.000Z', amount: 1 }, // 23:30 IST on the 10th
      ],
    });
    const week = await habitLast7Days('cigarette');
    expect(week.map((d) => d.date)).toEqual([
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
      '2026-11-08',
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
    ]);
    expect(week.at(-1)).toEqual({ date: '2026-11-11', total: 2 });
    expect(week.at(-2)).toEqual({ date: '2026-11-10', total: 1 });
    // window starts at local midnight six days ago
    expect(argsOf(db.callsTo('habit_logs')[0], 'gte')).toEqual([
      'occurred_at',
      '2026-11-04T18:30:00.000Z',
    ]);
  });

  it('habitCountToday filters from local midnight', async () => {
    db.queue('habit_logs', { data: [{ amount: '1.5' }, { amount: 2 }] });
    await expect(habitCountToday('alcohol')).resolves.toBe(3.5);
    expect(argsOf(db.callsTo('habit_logs')[0], 'gte')).toEqual([
      'occurred_at',
      '2026-11-10T18:30:00.000Z',
    ]);
  });

  it('cleanStreak: a log at 23:30 local yesterday is 1 clean day, not 0', async () => {
    db.queue('habit_logs', { data: [{ occurred_at: '2026-11-10T18:00:00.000Z' }] });
    await expect(cleanStreak('cigarette')).resolves.toBe(1);
  });

  it('cleanStreak and cleanStreakStats agree on the current run', async () => {
    const rows = [{ occurred_at: '2026-11-10T18:45:00.000Z' }]; // today local
    db.queue('habit_logs', { data: rows }, { data: rows });
    const quick = await cleanStreak('cigarette');
    const stats = await cleanStreakStats('cigarette');
    expect(quick).toBe(0);
    expect(stats.current).toBe(quick);
  });
});

describe('last30dContext in Asia/Kolkata', () => {
  beforeEach(() => freezeAt('2026-11-10T19:00:00.000Z'));

  it('summarises each section and asks Postgres for the truly latest body metric', async () => {
    db.queue('workouts', {
      data: [{ performed_on: '2026-11-01' }, { performed_on: '2026-11-03' }],
    });
    db.queue('workout_sets', {
      data: [{ exercise_name: 'Squat', weight_kg: 100, reps: 5, rir: 2 }],
    });
    db.queue('habit_logs', {
      data: [
        { kind: 'cigarette', amount: 2 },
        { kind: 'cigarette', amount: '1' },
        { kind: 'alcohol', amount: 3 },
        { kind: 'intimacy', amount: 1 },
      ],
    });
    db.queue('body_metrics', {
      data: [{ measured_on: '2026-11-09', weight_kg: 81.5, body_fat_pct: 15 }],
    });

    const ctx = await last30dContext();

    expect(ctx).toContain('Workouts (2): 2026-11-01, 2026-11-03');
    expect(ctx).toContain('Squat: 100kg x 5 (RIR 2)');
    expect(ctx).toContain('Cigarettes total: 3');
    expect(ctx).toContain('Alcohol units total: 3');
    expect(ctx).toContain('Intimacy count: 1');
    expect(ctx).toContain('Latest body: 81.5kg, 15% bf (2026-11-09)');

    const body = db.callsTo('body_metrics')[0];
    expect(allArgsOf(body, 'order')).toEqual([
      ['measured_on', { ascending: false }],
      ['created_at', { ascending: false }],
    ]);
    expect(argsOf(body, 'limit')).toEqual([1]);
    // date columns are filtered by LOCAL day, 30 days back
    expect(argsOf(db.callsTo('workouts')[0], 'gte')).toEqual(['performed_on', '2026-10-12']);
  });
});
