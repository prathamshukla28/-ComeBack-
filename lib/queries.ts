import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from './supabase';
import {
  computeStreakStats,
  consecutiveRunEndingAt,
  localDay,
  startOfLocalDay,
  trailingDays,
  type StreakStats,
} from './streaks';

/*
 * Day convention: every calendar day in this module is the user's LOCAL day,
 * produced by `localDay()` (see lib/streaks.ts). Timestamps (`timestamptz`) are
 * compared as instants; `date` columns (`performed_on`, `measured_on`) are written
 * and filtered with local day strings. Nothing here derives a day from
 * `toISOString()`.
 */

/* ---------- Row types ----------
 * Hand-written mirrors of db/schema.sql (the project has no generated Supabase
 * types). Postgres `numeric` columns arrive from PostgREST as numbers or strings
 * depending on precision, so they are typed loosely and coerced with Number().
 */

type Numeric = number | string | null;

export type HabitKind = 'cigarette' | 'alcohol' | 'intimacy';

export interface HabitLogRow {
  id: string;
  owner_id: string;
  kind: HabitKind;
  amount: Numeric;
  meta: Record<string, unknown>;
  occurred_at: string;
  created_at: string;
}

export interface WorkoutRow {
  id: string;
  owner_id: string;
  performed_on: string;
  name: string | null;
  notes: string | null;
  created_at: string;
}

export interface WorkoutSetRow {
  id: string;
  workout_id: string;
  exercise_id: string | null;
  exercise_name: string;
  set_index: number;
  weight_kg: Numeric;
  reps: number | null;
  rir: number | null;
  created_at: string;
}

export interface BodyMetricRow {
  measured_on: string;
  weight_kg: Numeric;
  body_fat_pct: Numeric;
  created_at: string;
}

export interface ChatMessageRow {
  id: string;
  role: 'user' | 'model' | 'system';
  content: string;
  created_at: string;
}

export interface CoachMemoryRow {
  key: string;
  value: string;
}

export interface UserProfileRow {
  owner_id: string;
  display_name: string | null;
  dob: string | null;
  height_cm: Numeric;
  goals: string | null;
  bio: string | null;
  units: string | null;
  created_at: string;
  updated_at: string;
}

export type UserProfilePatch = Partial<
  Pick<UserProfileRow, 'display_name' | 'dob' | 'goals' | 'bio' | 'units'> & {
    height_cm: number | null;
  }
>;

interface QueryResult {
  data: unknown;
  error: PostgrestError | null;
}

/** Unwrap a list result: throw the PostgREST error, else the rows typed as `T`. */
function rowsOf<T>(res: QueryResult): T[] {
  if (res.error) throw res.error;
  return (res.data ?? []) as T[];
}

/** Unwrap a single-row result. */
function rowOf<T>(res: QueryResult): T {
  if (res.error) throw res.error;
  return res.data as T;
}

const num = (v: Numeric | undefined): number => Number(v ?? 0) || 0;

/* ---------- Habits (cigarette, alcohol, intimacy) ---------- */

export async function logHabit(
  kind: HabitKind,
  amount = 1,
  meta: Record<string, unknown> = {},
  id?: string,
): Promise<HabitLogRow> {
  const row: Record<string, unknown> = { kind, amount, meta };
  if (id) row.id = id;
  return rowOf<HabitLogRow>(await supabase.from('habit_logs').insert(row).select().single());
}

/**
 * Log a habit, but never lose the tap offline: a network failure persists the
 * log to the outbox (replayed later) instead of throwing. Genuine server errors
 * (RLS/auth) still throw so the caller can react.
 *
 * The id is minted before the first attempt and used as the row's primary key
 * on both the live insert and any replay, so a write that committed but whose
 * response was lost cannot land twice.
 */
export async function logHabitResilient(kind: HabitKind, amount = 1): Promise<{ queued: boolean }> {
  const occurred_at = new Date().toISOString();
  const { enqueueHabit, isNetworkError, newHabitId } = await import('./outbox');
  const id = newHabitId();
  try {
    await logHabit(kind, amount, {}, id);
    return { queued: false };
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    await enqueueHabit({ id, kind, amount, occurred_at });
    return { queued: true };
  }
}

export async function habitCountToday(kind: HabitKind): Promise<number> {
  const rows = rowsOf<Pick<HabitLogRow, 'amount'>>(
    await supabase
      .from('habit_logs')
      .select('amount')
      .eq('kind', kind)
      .gte('occurred_at', startOfLocalDay(new Date()).toISOString()),
  );
  return rows.reduce((s, r) => s + num(r.amount), 0);
}

/**
 * Local days (newest first) of the most recent `limit` logs of a habit. Fetched
 * newest-first so a heavy logger's *current* streak is always computed from their
 * latest data, never from a truncated oldest-first window.
 */
async function recentOccurrenceDays(kind: HabitKind, limit: number): Promise<string[]> {
  const rows = rowsOf<Pick<HabitLogRow, 'occurred_at'>>(
    await supabase
      .from('habit_logs')
      .select('occurred_at')
      .eq('kind', kind)
      .order('occurred_at', { ascending: false })
      .limit(limit),
  );
  return rows.map((r) => localDay(new Date(r.occurred_at)));
}

/** Returned by {@link cleanStreak} when a habit has never been logged. */
export const NEVER_LOGGED = 999;

/**
 * Clean days since the habit was last logged — the cheap single-row read behind
 * the dashboard. Same math as {@link cleanStreakStats} (`current`), so the two can
 * never disagree. Returns {@link NEVER_LOGGED} when there is no history.
 */
export async function cleanStreak(kind: HabitKind): Promise<number> {
  const days = await recentOccurrenceDays(kind, 1);
  if (!days.length) return NEVER_LOGGED;
  return computeStreakStats(days, localDay(new Date())).current;
}

/** How many recent logs feed the personal-best search in {@link cleanStreakStats}. */
const STREAK_HISTORY_LIMIT = 2000;

/**
 * Relapse-aware streak stats for a habit: current clean run, the personal best
 * worth chasing, and the length of any run a relapse broke today. Powers the
 * "you've done longer — rebuild" UX instead of a cold reset to zero.
 */
export async function cleanStreakStats(kind: HabitKind): Promise<StreakStats> {
  const days = await recentOccurrenceDays(kind, STREAK_HISTORY_LIMIT);
  return computeStreakStats(days, localDay(new Date()));
}

/** Consecutive local days, ending today, with at least one workout. */
export async function workoutStreak(): Promise<number> {
  const rows = rowsOf<Pick<WorkoutRow, 'performed_on'>>(
    await supabase
      .from('workouts')
      .select('performed_on')
      .order('performed_on', { ascending: false })
      .limit(366),
  );
  return consecutiveRunEndingAt(
    rows.map((r) => String(r.performed_on).slice(0, 10)),
    localDay(new Date()),
  );
}

/** Epley estimated one-rep max. */
export function estimateOneRepMax(weightKg: number, reps: number): number {
  return weightKg * (1 + reps / 30);
}

/**
 * Does (weightKg × reps) beat the best estimated 1RM on record for this exercise?
 *
 * Pass `excludeSetId` — the id {@link logSet} returned — when checking a set that
 * has already been saved, so it is never compared against itself. Exclusion is by
 * id on the server, not by assuming the newest row is "ours": a concurrent insert
 * or clock skew can reorder `created_at`.
 */
export async function isNewPR(
  exerciseName: string,
  weightKg: number,
  reps: number,
  excludeSetId?: string,
): Promise<boolean> {
  let q = supabase
    .from('workout_sets')
    .select('id, weight_kg, reps')
    .eq('exercise_name', exerciseName);
  if (excludeSetId) q = q.neq('id', excludeSetId);
  const prior = rowsOf<Pick<WorkoutSetRow, 'id' | 'weight_kg' | 'reps'>>(
    await q.order('created_at', { ascending: false }).limit(500),
  );
  if (!prior.length) return true;
  const bestOneRM = prior.reduce(
    (max, r) => Math.max(max, estimateOneRepMax(num(r.weight_kg), Number(r.reps ?? 0))),
    0,
  );
  return estimateOneRepMax(weightKg, reps) > bestOneRM;
}

/** Bucket timestamped amounts into the trailing `days` local days (oldest first). */
function bucketByLocalDay(
  rows: { occurred_at: string; amount: Numeric }[],
  days: number,
  now: Date,
): { date: string; total: number }[] {
  const map = new Map<string, number>(trailingDays(days, localDay(now)).map((d) => [d, 0]));
  for (const r of rows) {
    const key = localDay(new Date(r.occurred_at));
    if (map.has(key)) map.set(key, (map.get(key) ?? 0) + num(r.amount));
  }
  return Array.from(map, ([date, total]) => ({ date, total }));
}

/**
 * Daily totals for a habit over the trailing `days` local days (oldest first),
 * zero-filled. Used by the Trends screen to split into week-over-week windows.
 */
export async function habitDailyTotals(
  kind: HabitKind,
  days = 14,
): Promise<{ date: string; total: number }[]> {
  const now = new Date();
  const start = startOfLocalDay(now);
  start.setDate(start.getDate() - (days - 1));
  const rows = rowsOf<Pick<HabitLogRow, 'amount' | 'occurred_at'>>(
    await supabase
      .from('habit_logs')
      .select('amount, occurred_at')
      .eq('kind', kind)
      .gte('occurred_at', start.toISOString()),
  );
  return bucketByLocalDay(rows, days, now);
}

/** The last 7 local days of a habit (oldest first, zero-filled). */
export function habitLast7Days(kind: HabitKind): Promise<{ date: string; total: number }[]> {
  return habitDailyTotals(kind, 7);
}

/** Count of workout sessions per local day over the trailing `days` days (oldest first). */
export async function workoutDailyCounts(days = 14): Promise<{ date: string; total: number }[]> {
  const keys = trailingDays(days, localDay(new Date()));
  const rows = rowsOf<Pick<WorkoutRow, 'performed_on'>>(
    await supabase.from('workouts').select('performed_on').gte('performed_on', keys[0]),
  );
  const map = new Map<string, number>(keys.map((d) => [d, 0]));
  for (const r of rows) {
    const key = String(r.performed_on).slice(0, 10);
    if (map.has(key)) map.set(key, (map.get(key) ?? 0) + 1);
  }
  return Array.from(map, ([date, total]) => ({ date, total }));
}

export async function undoLastHabit(kind: HabitKind): Promise<boolean> {
  const rows = rowsOf<Pick<HabitLogRow, 'id'>>(
    await supabase
      .from('habit_logs')
      .select('id')
      .eq('kind', kind)
      .order('occurred_at', { ascending: false })
      .limit(1),
  );
  if (!rows.length) return false;
  const del = await supabase.from('habit_logs').delete().eq('id', rows[0].id);
  if (del.error) throw del.error;
  return true;
}

/* ---------- Workouts ---------- */

export interface Exercise {
  id: string;
  name: string;
  muscle_group: string;
}

export async function listExercises(): Promise<Exercise[]> {
  return rowsOf<Exercise>(
    await supabase.from('exercises').select('id, name, muscle_group').order('name'),
  );
}

/** Id of today's (local day) workout, creating it on first use. */
export async function ensureTodayWorkout(): Promise<string> {
  const today = localDay(new Date());
  const existing = rowsOf<Pick<WorkoutRow, 'id'>>(
    await supabase
      .from('workouts')
      .select('id')
      .eq('performed_on', today)
      .order('created_at', { ascending: true })
      .limit(1),
  );
  if (existing.length) return existing[0].id;
  const created = rowOf<Pick<WorkoutRow, 'id'>>(
    await supabase.from('workouts').insert({ performed_on: today }).select('id').single(),
  );
  return created.id;
}

const SET_COLUMNS =
  'id, workout_id, exercise_id, exercise_name, set_index, weight_kg, reps, rir, created_at';

/** How many times {@link logSet} re-reads the next index after losing a race. */
export const LOG_SET_MAX_ATTEMPTS = 3;

/** Postgres `unique_violation`. */
export function isUniqueViolation(e: unknown): boolean {
  return (e as { code?: unknown } | null)?.code === '23505';
}

/**
 * Append a set to a workout and return the saved row.
 *
 * `set_index` is "max + 1" for this workout/exercise. Two quick taps (or two
 * devices) can read the same max; the unique index on
 * (workout_id, exercise_name, set_index) in db/schema.sql turns the loser into a
 * `23505`, and we re-read and retry rather than writing a duplicate index.
 */
export async function logSet(args: {
  workoutId: string;
  exerciseName: string;
  exerciseId?: string;
  weightKg: number;
  reps: number;
  rir?: number;
}): Promise<WorkoutSetRow> {
  for (let attempt = 1; ; attempt++) {
    const last = rowsOf<Pick<WorkoutSetRow, 'set_index'>>(
      await supabase
        .from('workout_sets')
        .select('set_index')
        .eq('workout_id', args.workoutId)
        .eq('exercise_name', args.exerciseName)
        .order('set_index', { ascending: false })
        .limit(1),
    );
    const setIndex = (last[0]?.set_index ?? 0) + 1;
    const { data, error } = await supabase
      .from('workout_sets')
      .insert({
        workout_id: args.workoutId,
        exercise_id: args.exerciseId ?? null,
        exercise_name: args.exerciseName,
        set_index: setIndex,
        weight_kg: args.weightKg,
        reps: args.reps,
        rir: args.rir ?? null,
      })
      .select(SET_COLUMNS)
      .single();
    if (!error) return data as WorkoutSetRow;
    if (!isUniqueViolation(error) || attempt >= LOG_SET_MAX_ATTEMPTS) throw error;
  }
}

export async function todaySets(workoutId: string): Promise<WorkoutSetRow[]> {
  return rowsOf<WorkoutSetRow>(
    await supabase
      .from('workout_sets')
      .select(SET_COLUMNS)
      .eq('workout_id', workoutId)
      .order('created_at', { ascending: true }),
  );
}

export async function deleteSet(id: string): Promise<void> {
  const { error } = await supabase.from('workout_sets').delete().eq('id', id);
  if (error) throw error;
}

/* ---------- Chat ---------- */

export type ChatThread = 'guru' | 'coach';

export async function loadThread(thread: ChatThread, limit = 50): Promise<ChatMessageRow[]> {
  const rows = rowsOf<ChatMessageRow>(
    await supabase
      .from('chat_messages')
      .select('id, role, content, created_at')
      .eq('thread', thread)
      .order('created_at', { ascending: false })
      .limit(limit),
  );
  return rows.reverse();
}

export async function saveMessage(thread: ChatThread, role: 'user' | 'model', content: string) {
  const { error } = await supabase.from('chat_messages').insert({ thread, role, content });
  if (error) throw error;
}

export async function clearThread(thread: ChatThread) {
  const { error } = await supabase.from('chat_messages').delete().eq('thread', thread);
  if (error) throw error;
}

/* ---------- Coach memory + profile ---------- */

export async function loadCoachMemory(): Promise<CoachMemoryRow[]> {
  return rowsOf<CoachMemoryRow>(
    await supabase
      .from('coach_memory')
      .select('key, value')
      .order('updated_at', { ascending: false }),
  );
}

/**
 * Raw write. Callers that persist model output must validate it first — see
 * `parseMemoryFacts` in lib/coach-memory.ts.
 */
export async function upsertMemory(key: string, value: string) {
  const { error } = await supabase
    .from('coach_memory')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'owner_id,key' });
  if (error) throw error;
}

export async function loadProfile(): Promise<UserProfileRow | null> {
  return rowOf<UserProfileRow | null>(
    await supabase.from('user_profile').select('*').maybeSingle(),
  );
}

export async function upsertProfile(patch: UserProfilePatch): Promise<void> {
  const existing = rowOf<Pick<UserProfileRow, 'owner_id'> | null>(
    await supabase.from('user_profile').select('owner_id').maybeSingle(),
  );
  if (existing) {
    const { error } = await supabase
      .from('user_profile')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('owner_id', existing.owner_id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('user_profile').insert(patch);
    if (error) throw error;
  }
}

/* ---------- Aggregate context for AI ---------- */

const UNAVAILABLE = '(unavailable — could not load)';

/** A section's rows, or `null` when its query failed (logged, never thrown). */
function rowsOrNull<T>(label: string, res: QueryResult): T[] | null {
  if (res.error) {
    console.warn(`[ComeBack] last30dContext: ${label} query failed`, res.error);
    return null;
  }
  return (res.data ?? []) as T[];
}

/**
 * Plain-text digest of the last 30 days, fed to the AI as context.
 *
 * Each section degrades independently: a failed query renders as "unavailable"
 * rather than "none", so the model is never told "you didn't work out" because a
 * request failed, and one bad table can't take the whole chat down.
 */
export async function last30dContext(): Promise<string> {
  const since = startOfLocalDay(new Date());
  since.setDate(since.getDate() - 30);
  const sinceDay = localDay(since);
  const sinceIso = since.toISOString();

  const [workoutsRes, setsRes, habitsRes, bodyRes] = await Promise.all([
    supabase
      .from('workouts')
      .select('performed_on')
      .gte('performed_on', sinceDay)
      .order('performed_on', { ascending: true }),
    supabase
      .from('workout_sets')
      .select('exercise_name, weight_kg, reps, rir, created_at')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase.from('habit_logs').select('kind, amount').gte('occurred_at', sinceIso),
    supabase
      .from('body_metrics')
      .select('measured_on, weight_kg, body_fat_pct, created_at')
      .gte('measured_on', sinceDay)
      .order('measured_on', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1),
  ]);

  const workouts = rowsOrNull<Pick<WorkoutRow, 'performed_on'>>('workouts', workoutsRes);
  const sets = rowsOrNull<
    Pick<WorkoutSetRow, 'exercise_name' | 'weight_kg' | 'reps' | 'rir' | 'created_at'>
  >('workout_sets', setsRes);
  const habits = rowsOrNull<Pick<HabitLogRow, 'kind' | 'amount'>>('habit_logs', habitsRes);
  const body = rowsOrNull<BodyMetricRow>('body_metrics', bodyRes);

  const habitTotal = (kind: HabitKind) =>
    habits
      ? String(habits.filter((h) => h.kind === kind).reduce((s, h) => s + num(h.amount), 0))
      : UNAVAILABLE;
  const intCount = habits
    ? String(habits.filter((h) => h.kind === 'intimacy').length)
    : UNAVAILABLE;

  const workoutLine = workouts
    ? `Workouts (${workouts.length}): ${workouts.map((w) => w.performed_on).join(', ') || 'none'}`
    : `Workouts: ${UNAVAILABLE}`;
  const setLines = sets
    ? sets
        .slice(0, 40)
        .map(
          (s) =>
            `${s.exercise_name}: ${s.weight_kg}kg x ${s.reps}${s.rir != null ? ` (RIR ${s.rir})` : ''}`,
        )
        .join('\n') || 'none'
    : UNAVAILABLE;
  const latest = body?.[0];
  const bodyLine = !body
    ? UNAVAILABLE
    : latest
      ? `${latest.weight_kg}kg${latest.body_fat_pct ? `, ${latest.body_fat_pct}% bf` : ''} (${latest.measured_on})`
      : 'no data';

  return `--- Last 30 days ---
${workoutLine}
Recent sets:
${setLines}

Cigarettes total: ${habitTotal('cigarette')}
Alcohol units total: ${habitTotal('alcohol')}
Intimacy count: ${intCount}
Latest body: ${bodyLine}
---`;
}
