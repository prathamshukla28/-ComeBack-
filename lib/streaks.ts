/**
 * Relapse-aware streak math.
 *
 * ComeBack's thesis is recovery *after* a lapse — so breaking a streak must not
 * cold-reset the user to zero. These helpers compute not just the current clean
 * run but the record worth chasing and the length of the run a relapse just
 * broke, so the UI and AI coach can respond with "you've done longer, rebuild"
 * instead of a silent reset.
 *
 * Everything here is a pure function over `YYYY-MM-DD` day strings so it is
 * timezone-free and trivially unit-testable; callers convert timestamps to
 * local day strings before calling in.
 */

export interface StreakStats {
  /** Clean days since the most recent occurrence (0 if it happened today). */
  current: number;
  /** Longest clean run ever observed — completed runs or the ongoing one. */
  longest: number;
  /** Longest *completed* clean run: the personal record to beat (0 if none). */
  previousBest: number;
  /** The most recent occurrence is today AND at least one occurrence precedes it. */
  relapsedToday: boolean;
  /** Length of the clean run that a today-relapse just broke (0 if n < 2). */
  brokenStreak: number;
  /** Whether any occurrence has ever been logged for this habit. */
  everTracked: boolean;
}

const EMPTY: StreakStats = {
  current: 0,
  longest: 0,
  previousBest: 0,
  relapsedToday: false,
  brokenStreak: 0,
  everTracked: false,
};

/** Convert a `YYYY-MM-DD` string to an integer day index (UTC epoch days). */
function toEpochDay(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** Local calendar day (`YYYY-MM-DD`) for a Date — matches how the app perceives "today". */
export function localDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * @param occurrenceDays unsorted list of `YYYY-MM-DD` days the habit occurred on
 *   (duplicates allowed — multiple logs on one day collapse to that day)
 * @param today the current local day as `YYYY-MM-DD`
 */
export function computeStreakStats(occurrenceDays: string[], today: string): StreakStats {
  const unique = Array.from(new Set(occurrenceDays.filter(Boolean)))
    .map(toEpochDay)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);

  if (unique.length === 0) return { ...EMPTY };

  const todayEpoch = toEpochDay(today);
  const last = unique[unique.length - 1];

  // Completed clean runs are the gaps strictly between consecutive occurrences.
  const completedGaps: number[] = [];
  for (let i = 1; i < unique.length; i++) {
    completedGaps.push(unique[i] - unique[i - 1] - 1);
  }

  // Ongoing run = clean days from the last occurrence up to today (never negative;
  // a future-dated last log clamps to 0 rather than reporting a negative streak).
  const current = Math.max(0, todayEpoch - last);

  const previousBest = completedGaps.length ? Math.max(...completedGaps) : 0;
  const longest = Math.max(previousBest, current);
  const relapsedToday = last === todayEpoch && unique.length >= 2;
  const brokenStreak = relapsedToday
    ? unique[unique.length - 1] - unique[unique.length - 2] - 1
    : 0;

  return {
    current,
    longest,
    previousBest,
    relapsedToday,
    brokenStreak,
    everTracked: true,
  };
}
