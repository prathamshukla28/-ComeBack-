import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { SecureStoreOptions } from 'expo-secure-store';
import { localDay, shiftDay, startOfLocalDay } from './streaks';

/**
 * In-memory stand-in for the Supabase client, used ONLY by the dev-only demo-data
 * mode (`EXPO_PUBLIC_DEMO_DATA=1`, guarded by `demoDataEnabled()` in ./demo).
 *
 * It implements just the slice of the PostgREST query builder that lib/queries.ts
 * and lib/outbox.ts use (select / insert / upsert / update / delete, eq / neq / gte,
 * order, limit, single / maybeSingle) over plain arrays, and a local demo session
 * for lib/auth.tsx. The real screens and the real data-access code run unchanged
 * on top of it; nothing is sent over the network and nothing persists across a
 * reload. Every row below is SAMPLE DATA, seeded relative to "today".
 */

type Row = Record<string, unknown>;

interface DemoError {
  message: string;
  code?: string;
}

interface DemoResult {
  data: unknown;
  error: DemoError | null;
}

type Filter = { col: string; op: 'eq' | 'neq' | 'gte'; val: unknown };

const DEMO_USER_ID = '00000000-0000-4000-8000-00000000de30';

/** Salted SHA-256 of the demo PIN "1234", in lib/pin.ts's `salt:digest` format. */
export const DEMO_PIN_HASH =
  'd3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3:fde5fc0e6d5c1206b2d5424484741d3555db04c25eaa437ab5c1f2cf457d6b96';

function compare(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a ?? '').localeCompare(String(b ?? ''));
}

function project(row: Row, columns: string): Row {
  const cols = columns.split(',').map((c) => c.trim());
  if (cols.includes('*')) return { ...row };
  return Object.fromEntries(cols.map((c) => [c, row[c]]));
}

export class DemoDb {
  private tables = new Map<string, Row[]>();
  private seq = 0;

  constructor(seed: Record<string, Row[]> = {}) {
    for (const [table, rows] of Object.entries(seed)) {
      this.tables.set(
        table,
        rows.map((r) => this.withDefaults(table, r)),
      );
    }
  }

  rows(table: string): Row[] {
    let t = this.tables.get(table);
    if (!t) {
      t = [];
      this.tables.set(table, t);
    }
    return t;
  }

  /** Column defaults from db/schema.sql that the app relies on. */
  withDefaults(table: string, row: Row): Row {
    const now = new Date().toISOString();
    return {
      id: `demo-${++this.seq}`,
      owner_id: DEMO_USER_ID,
      created_at: now,
      ...(table === 'habit_logs' ? { occurred_at: now, amount: 1, meta: {} } : {}),
      ...row,
    };
  }

  from(table: string): DemoQuery {
    return new DemoQuery(this, table);
  }
}

export class DemoQuery implements PromiseLike<DemoResult> {
  private action: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select';
  private columns = '*';
  private returning = false;
  private payload: Row[] = [];
  private patch: Row = {};
  private conflictKeys: string[] = ['id'];
  private filters: Filter[] = [];
  private orders: { col: string; ascending: boolean }[] = [];
  private max: number | undefined;

  constructor(
    private db: DemoDb,
    private table: string,
  ) {}

  select(columns = '*'): this {
    if (this.action !== 'select') this.returning = true;
    this.columns = columns;
    return this;
  }
  insert(rows: Row | Row[]): this {
    this.action = 'insert';
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  upsert(rows: Row | Row[], opts: { onConflict?: string } = {}): this {
    this.action = 'upsert';
    this.payload = Array.isArray(rows) ? rows : [rows];
    // Every demo row has the same owner, so owner_id never disambiguates.
    this.conflictKeys = (opts.onConflict ?? 'id')
      .split(',')
      .map((k) => k.trim())
      .filter((k) => k && k !== 'owner_id');
    return this;
  }
  update(patch: Row): this {
    this.action = 'update';
    this.patch = patch;
    return this;
  }
  delete(): this {
    this.action = 'delete';
    return this;
  }
  eq(col: string, val: unknown): this {
    this.filters.push({ col, op: 'eq', val });
    return this;
  }
  neq(col: string, val: unknown): this {
    this.filters.push({ col, op: 'neq', val });
    return this;
  }
  gte(col: string, val: unknown): this {
    this.filters.push({ col, op: 'gte', val });
    return this;
  }
  order(col: string, opts: { ascending?: boolean } = {}): this {
    this.orders.push({ col, ascending: opts.ascending ?? true });
    return this;
  }
  limit(n: number): this {
    this.max = n;
    return this;
  }
  single(): Promise<DemoResult> {
    return Promise.resolve(this.one(false));
  }
  maybeSingle(): Promise<DemoResult> {
    return Promise.resolve(this.one(true));
  }
  then<A = DemoResult, B = never>(
    onFulfilled?: ((value: DemoResult) => A | PromiseLike<A>) | null,
    onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve(this.run()).then(onFulfilled, onRejected);
  }

  private matches(row: Row): boolean {
    return this.filters.every(({ col, op, val }) => {
      if (op === 'eq') return row[col] === val;
      if (op === 'neq') return row[col] !== val;
      return compare(row[col], val) >= 0;
    });
  }

  private one(allowNone: boolean): DemoResult {
    const { data, error } = this.run();
    if (error) return { data: null, error };
    const rows = data as Row[];
    if (rows.length === 1) return { data: rows[0], error: null };
    if (rows.length === 0 && allowNone) return { data: null, error: null };
    return { data: null, error: { message: `expected 1 row, got ${rows.length}` } };
  }

  private run(): DemoResult {
    const table = this.db.rows(this.table);
    const out = (rows: Row[]): DemoResult => ({
      data:
        this.returning || this.action === 'select'
          ? rows.map((r) => project(r, this.columns))
          : null,
      error: null,
    });

    if (this.action === 'insert') {
      const added = this.payload.map((r) => this.db.withDefaults(this.table, r));
      table.push(...added);
      return out(added);
    }
    if (this.action === 'upsert') {
      const written = this.payload.map((r) => {
        const hit = table.find((t) => this.conflictKeys.every((k) => t[k] === r[k]));
        if (hit) return Object.assign(hit, r);
        const added = this.db.withDefaults(this.table, r);
        table.push(added);
        return added;
      });
      return out(written);
    }
    if (this.action === 'update') {
      const hits = table.filter((r) => this.matches(r));
      hits.forEach((r) => Object.assign(r, this.patch));
      return out(hits);
    }
    if (this.action === 'delete') {
      const gone = table.filter((r) => this.matches(r));
      for (const r of gone) table.splice(table.indexOf(r), 1);
      return out(gone);
    }

    let rows = table.filter((r) => this.matches(r));
    if (this.orders.length) {
      rows = [...rows].sort((a, b) => {
        for (const { col, ascending } of this.orders) {
          const d = compare(a[col], b[col]);
          if (d !== 0) return ascending ? d : -d;
        }
        return 0;
      });
    }
    if (this.max !== undefined) rows = rows.slice(0, this.max);
    return out(rows);
  }
}

/* ---------- Sample data (deterministic, relative to `now`) ---------- */

const EXERCISES: [name: string, muscle: string][] = [
  ['Bench Press', 'chest'],
  ['Incline Dumbbell Press', 'chest'],
  ['Pull-up', 'back'],
  ['Barbell Row', 'back'],
  ['Deadlift', 'back'],
  ['Overhead Press', 'shoulders'],
  ['Barbell Squat', 'legs'],
  ['Romanian Deadlift', 'legs'],
  ['Barbell Curl', 'arms'],
  ['Plank', 'core'],
];

/** Local wall-clock time `hour`:00 on the local day `daysAgo` before `now`. */
function at(now: Date, daysAgo: number, hour: number): string {
  const d = startOfLocalDay(now);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour);
  return d.toISOString();
}

/**
 * Sample rows for one demo user. Shapes the streak screens on purpose:
 * cigarettes clean for 9 days (record 14), alcohol relapsed today after a 6-day
 * run (record 10), a 12-day workout streak, and a Bench Press history that an
 * 85 kg × 5 set beats (estimated 1RM 96 → 99).
 */
export function demoSeed(now: Date = new Date()): Record<string, Row[]> {
  const today = localDay(now);
  // Today's logs land a few minutes in the past, never in the future.
  const earlierToday = (minutes: number) =>
    new Date(
      Math.max(startOfLocalDay(now).getTime(), now.getTime() - minutes * 60_000),
    ).toISOString();

  const exercises = EXERCISES.map(([name, muscle_group], i) => ({
    id: `demo-ex-${i + 1}`,
    name,
    muscle_group,
  }));
  const exId = (name: string) => exercises.find((e) => e.name === name)?.id ?? null;

  const habit = (kind: string, occurred_at: string, amount = 1) => ({
    kind,
    amount,
    meta: {},
    occurred_at,
    created_at: occurred_at,
  });
  const habit_logs = [
    habit('cigarette', at(now, 30, 20), 3),
    habit('cigarette', at(now, 29, 20), 2),
    habit('cigarette', at(now, 14, 21)),
    habit('cigarette', at(now, 9, 22)),
    habit('alcohol', at(now, 18, 21), 3),
    habit('alcohol', at(now, 7, 21), 2),
    habit('alcohol', earlierToday(40), 2),
    habit('intimacy', at(now, 1, 23)),
    habit('intimacy', at(now, 3, 23)),
    habit('intimacy', at(now, 5, 23)),
  ];

  // A workout every day for the last 12 days, a rest day, then one more.
  const workoutDays = [...Array.from({ length: 12 }, (_, i) => i), 13];
  const workouts = workoutDays.map((daysAgo) => ({
    id: `demo-w-${daysAgo}`,
    performed_on: shiftDay(today, -daysAgo),
    name: null,
    notes: null,
    created_at: daysAgo === 0 ? earlierToday(55) : at(now, daysAgo, 7),
  }));

  const workout_sets: Row[] = [];
  const set = (
    daysAgo: number,
    exercise_name: string,
    set_index: number,
    weight_kg: number,
    reps: number,
    rir: number | null = null,
  ) =>
    workout_sets.push({
      workout_id: `demo-w-${daysAgo}`,
      exercise_id: exId(exercise_name),
      exercise_name,
      set_index,
      weight_kg,
      reps,
      rir,
      created_at:
        daysAgo === 0
          ? earlierToday(50 - set_index * 4 - exercise_name.length)
          : at(now, daysAgo, 8),
    });
  set(10, 'Bench Press', 1, 77.5, 5, 2);
  set(7, 'Bench Press', 1, 80, 5, 2);
  set(3, 'Bench Press', 1, 80, 6, 1);
  set(9, 'Barbell Squat', 1, 100, 5, 2);
  set(5, 'Deadlift', 1, 140, 3, 2);
  set(4, 'Overhead Press', 1, 50, 6, 2);
  set(2, 'Barbell Row', 1, 70, 8, 2);
  set(0, 'Bench Press', 1, 60, 8, 4);
  set(0, 'Bench Press', 2, 75, 5, 2);
  set(0, 'Barbell Squat', 1, 100, 5, 2);
  set(0, 'Barbell Squat', 2, 100, 5, 1);

  const chat = (thread: string, role: string, content: string, minutesAgo: number) => ({
    thread,
    role,
    content,
    created_at: new Date(now.getTime() - minutesAgo * 60_000).toISOString(),
  });
  const chat_messages = [
    chat(
      'guru',
      'user',
      'Bench has been stuck around 80 kg for two weeks. What should I change?',
      30,
    ),
    chat(
      'guru',
      'model',
      'Your log says 80×5 last week and 80×6 three days ago — that is not a stall, that is a rep PR. Keep 80 kg until you own 3×6 at RIR 1–2, then add 2.5 kg. Pause the first rep of every set to own the bottom.',
      29,
    ),
    chat(
      'coach',
      'user',
      'Had two drinks tonight after a rough day. Feels like I wasted the week.',
      12,
    ),
    chat(
      'coach',
      'model',
      'Six dry days is not wasted — it is the second-longest run you have logged. One evening does not erase it. What made today rough, and what could tomorrow evening look like instead?',
      11,
    ),
  ];

  return {
    user_profile: [
      {
        display_name: 'Alex',
        dob: null,
        height_cm: 178,
        goals: 'Bench 100 kg. Stay smoke-free.',
        bio: null,
        units: 'metric',
        updated_at: at(now, 20, 9),
      },
    ],
    exercises,
    habit_logs,
    workouts,
    workout_sets,
    chat_messages,
    coach_memory: [
      { key: 'goal', value: 'Bench 100 kg by spring', updated_at: at(now, 6, 9) },
      { key: 'trigger', value: 'Drinks more after stressful workdays', updated_at: at(now, 2, 9) },
    ],
    body_metrics: [{ measured_on: shiftDay(today, -2), weight_kg: 81.4, body_fat_pct: 17.5 }],
  };
}

/* ---------- Auth + client ---------- */

function demoSession(): Session {
  return {
    access_token: 'demo-access-token',
    refresh_token: 'demo-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id: DEMO_USER_ID,
      email: 'demo@example.invalid',
      aud: 'authenticated',
      app_metadata: {},
      user_metadata: {},
      created_at: new Date(0).toISOString(),
    },
  };
}

type AuthListener = (event: string, session: Session | null) => void;

/** A Supabase-shaped client over a seeded {@link DemoDb}, signed in as the demo user. */
export function createDemoSupabase(db: DemoDb = new DemoDb(demoSeed())): SupabaseClient {
  let session: Session | null = demoSession();
  const listeners = new Set<AuthListener>();
  const emit = (event: string) => listeners.forEach((l) => l(event, session));
  const signIn = async () => {
    session = demoSession();
    emit('SIGNED_IN');
    return { data: { session, user: session.user }, error: null };
  };

  const client = {
    from: (table: string) => db.from(table),
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      onAuthStateChange: (cb: AuthListener) => {
        listeners.add(cb);
        return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } };
      },
      signInWithPassword: signIn,
      signUp: signIn,
      signOut: async () => {
        session = null;
        emit('SIGNED_OUT');
        return { error: null };
      },
    },
  };
  // Only the members above are ever called by this app (see the module comment).
  return client as unknown as SupabaseClient;
}

/* ---------- Keychain stand-in (web has no SecureStore) ---------- */

export interface KeyValueStore {
  getItemAsync(key: string, options?: SecureStoreOptions): Promise<string | null>;
  setItemAsync(key: string, value: string, options?: SecureStoreOptions): Promise<void>;
  deleteItemAsync(key: string, options?: SecureStoreOptions): Promise<void>;
}

/** In-memory key/value store with the expo-secure-store call shape. */
export function createMemoryStore(initial: Record<string, string> = {}): KeyValueStore {
  const m = new Map(Object.entries(initial));
  return {
    getItemAsync: async (key) => m.get(key) ?? null,
    setItemAsync: async (key, value) => {
      m.set(key, value);
    },
    deleteItemAsync: async (key) => {
      m.delete(key);
    },
  };
}
