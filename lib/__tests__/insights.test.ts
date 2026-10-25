import { deltaLabel, weeklyDelta } from '../insights';

describe('weeklyDelta', () => {
  it('sums both windows and computes percent change', () => {
    const d = weeklyDelta([1, 2, 2], [10], true); // 5 vs 10
    expect(d.total).toBe(5);
    expect(d.previousTotal).toBe(10);
    expect(d.deltaPct).toBe(-50);
    expect(d.direction).toBe('down');
  });

  it('treats down as improving for a habit to reduce', () => {
    expect(weeklyDelta([2], [5], true).improving).toBe(true);
    expect(weeklyDelta([8], [5], true).improving).toBe(false);
  });

  it('treats up as improving for a habit to grow (workouts)', () => {
    expect(weeklyDelta([6], [4], false).improving).toBe(true);
    expect(weeklyDelta([2], [4], false).improving).toBe(false);
  });

  it('a flat week always counts as improving (held the line)', () => {
    const d = weeklyDelta([3], [3], true);
    expect(d.direction).toBe('flat');
    expect(d.improving).toBe(true);
  });

  it('returns null percent when there is no baseline', () => {
    expect(weeklyDelta([3], [], true).deltaPct).toBeNull();
    expect(weeklyDelta([0], [0], true).direction).toBe('flat');
  });

  it('coerces nullish entries to zero', () => {
    const d = weeklyDelta([1, undefined as never, 2], [null as never], false);
    expect(d.total).toBe(3);
    expect(d.previousTotal).toBe(0);
  });
});

describe('deltaLabel', () => {
  it('shows a percent when a baseline exists', () => {
    expect(deltaLabel(weeklyDelta([2], [5], true))).toBe('↓ 60%');
    expect(deltaLabel(weeklyDelta([8], [5], true))).toBe('↑ 60%');
  });

  it('falls back to absolute count without a baseline', () => {
    expect(deltaLabel(weeklyDelta([3], [0], false))).toBe('↑ 3');
  });

  it('says "no change" when flat', () => {
    expect(deltaLabel(weeklyDelta([3], [3], true))).toBe('no change');
  });
});
