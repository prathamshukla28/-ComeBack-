/**
 * Week-over-week trend math for the Trends screen.
 *
 * Pure functions over plain numbers so the "is this going the right way?"
 * logic is unit-tested without touching the database. The screen supplies two
 * 7-day windows; direction is interpreted per metric (fewer cigarettes is good,
 * more workouts is good) via `goodWhenDown`.
 */

export type Direction = 'up' | 'down' | 'flat';

export interface WeeklyDelta {
  total: number;
  previousTotal: number;
  /** Percent change vs last week; null when last week was 0 (no baseline). */
  deltaPct: number | null;
  direction: Direction;
  /** True when the change moves toward the user's goal. */
  improving: boolean;
}

const sum = (xs: number[]): number => xs.reduce((a, b) => a + (Number(b) || 0), 0);

export function weeklyDelta(
  current: number[],
  previous: number[],
  goodWhenDown: boolean,
): WeeklyDelta {
  const total = sum(current);
  const previousTotal = sum(previous);
  const diff = total - previousTotal;
  const direction: Direction = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
  const deltaPct = previousTotal === 0 ? null : Math.round((diff / previousTotal) * 100);
  const improving =
    direction === 'flat' ? true : goodWhenDown ? direction === 'down' : direction === 'up';
  return { total, previousTotal, deltaPct, direction, improving };
}

/** Human-readable arrow + magnitude, e.g. "↓ 40%", "↑ 2", "no change". */
export function deltaLabel(d: WeeklyDelta): string {
  if (d.direction === 'flat') return 'no change';
  const arrow = d.direction === 'up' ? '↑' : '↓';
  if (d.deltaPct === null) {
    const diff = Math.abs(d.total - d.previousTotal);
    return `${arrow} ${diff}`;
  }
  return `${arrow} ${Math.abs(d.deltaPct)}%`;
}
