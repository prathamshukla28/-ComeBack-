import { computeStreakStats, localDay } from '../streaks';

const addDays = (base: string, n: number): string => {
  const [y, m, d] = base.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
};

const TODAY = '2026-10-25';

describe('computeStreakStats', () => {
  it('reports no data when there are no occurrences', () => {
    expect(computeStreakStats([], TODAY)).toEqual({
      current: 0,
      longest: 0,
      previousBest: 0,
      relapsedToday: false,
      brokenStreak: 0,
      everTracked: false,
    });
  });

  it('counts the ongoing clean run as days since the last occurrence', () => {
    const s = computeStreakStats([addDays(TODAY, -5)], TODAY);
    expect(s.current).toBe(5);
    expect(s.relapsedToday).toBe(false);
    expect(s.everTracked).toBe(true);
  });

  it('current is 0 the day of a relapse', () => {
    const s = computeStreakStats([addDays(TODAY, -30), TODAY], TODAY);
    expect(s.current).toBe(0);
    expect(s.relapsedToday).toBe(true);
  });

  it('exposes the broken run length when a relapse happens today', () => {
    // last clean before today ran from day -29 .. yesterday = 29 clean days
    const s = computeStreakStats([addDays(TODAY, -30), TODAY], TODAY);
    expect(s.brokenStreak).toBe(29);
  });

  it('does not flag a relapse when today is the only occurrence', () => {
    const s = computeStreakStats([TODAY], TODAY);
    expect(s.relapsedToday).toBe(false);
    expect(s.brokenStreak).toBe(0);
  });

  it('tracks the previous best as the longest completed run', () => {
    // runs between occurrences: (-100..-61)=39, (-60..-11)=49, then ongoing 10
    const occ = [addDays(TODAY, -101), addDays(TODAY, -61), addDays(TODAY, -11)];
    const s = computeStreakStats(occ, TODAY);
    expect(s.previousBest).toBe(49);
    expect(s.current).toBe(11);
    expect(s.longest).toBe(49);
  });

  it('longest reflects the current run when it beats every completed run', () => {
    const occ = [addDays(TODAY, -5), addDays(TODAY, -3)]; // completed gap = 1, ongoing = 3
    const s = computeStreakStats(occ, TODAY);
    expect(s.previousBest).toBe(1);
    expect(s.current).toBe(3);
    expect(s.longest).toBe(3);
  });

  it('collapses multiple occurrences on the same day', () => {
    const y = addDays(TODAY, -4);
    const s = computeStreakStats([y, y, y], TODAY);
    expect(s.current).toBe(4);
    expect(s.everTracked).toBe(true);
  });

  it('clamps a future-dated last occurrence to a non-negative current streak', () => {
    const s = computeStreakStats([addDays(TODAY, 3)], TODAY);
    expect(s.current).toBe(0);
  });
});

describe('localDay', () => {
  it('formats a date as zero-padded YYYY-MM-DD in local time', () => {
    expect(localDay(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(localDay(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
});
