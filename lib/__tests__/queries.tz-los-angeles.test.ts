/**
 * @jest-environment ./test-utils/timezone-env.js
 * @jest-environment-options {"timezone": "America/Los_Angeles"}
 */
/*
 * Day-bucketing and streak edge cases near local midnight, with the worker's real
 * time zone pinned (see test-utils/timezone-env.js). Every assertion here fails
 * under the old UTC-day (`toISOString().slice(0, 10)`) implementation.
 */
import { argsOf, db } from '../../test-utils/supabase-mock';
import {
  ensureTodayWorkout,
  habitDailyTotals,
  workoutDailyCounts,
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

describe('timezone: America/Los_Angeles (UTC−08:00), 23:30 local — UTC is already "tomorrow"', () => {
  // 2026-11-11T07:30Z  ==  2026-11-10 23:30 PST
  const NOW = '2026-11-11T07:30:00.000Z';
  beforeEach(() => freezeAt(NOW));

  it('the zone is really in effect', () => {
    expect(__PINNED_TZ__).toBe('America/Los_Angeles');
    expect(new Date().getTimezoneOffset()).toBe(480);
    expect(localDay(new Date())).toBe('2026-11-10');
  });

  it('ensureTodayWorkout writes the local day', async () => {
    db.queue('workouts', { data: [] }, { data: { id: 'w' } });
    await ensureTodayWorkout();
    expect(argsOf(db.callsTo('workouts')[1], 'insert')).toEqual([{ performed_on: '2026-11-10' }]);
  });

  it('habitDailyTotals keeps a 23:00-local log on today, not on the UTC tomorrow', async () => {
    db.queue('habit_logs', { data: [{ occurred_at: '2026-11-11T07:00:00.000Z', amount: 3 }] });
    const days = await habitDailyTotals('alcohol', 3);
    expect(days).toEqual([
      { date: '2026-11-08', total: 0 },
      { date: '2026-11-09', total: 0 },
      { date: '2026-11-10', total: 3 },
    ]);
  });

  it('a 14-day window across the DST change (Nov 1) has 14 distinct contiguous days', async () => {
    db.queue('habit_logs', { data: [] });
    const days = (await habitDailyTotals('cigarette', 14)).map((d) => d.date);
    expect(days).toHaveLength(14);
    expect(new Set(days).size).toBe(14);
    expect(days[0]).toBe('2026-10-28');
    expect(days).toContain('2026-11-01');
    expect(days.at(-1)).toBe('2026-11-10');
  });

  it('workoutStreak counts back from the local day', async () => {
    db.queue('workouts', {
      data: [{ performed_on: '2026-11-10' }, { performed_on: '2026-11-09' }],
    });
    await expect(workoutStreak()).resolves.toBe(2);
  });

  it('workoutDailyCounts filters and buckets by local day', async () => {
    db.queue('workouts', {
      data: [
        { performed_on: '2026-11-10' },
        { performed_on: '2026-11-10' },
        { performed_on: '2026-11-04' },
      ],
    });
    const days = await workoutDailyCounts(7);
    expect(argsOf(db.callsTo('workouts')[0], 'gte')).toEqual(['performed_on', '2026-11-04']);
    expect(days[0]).toEqual({ date: '2026-11-04', total: 1 });
    expect(days.at(-1)).toEqual({ date: '2026-11-10', total: 2 });
  });
});
