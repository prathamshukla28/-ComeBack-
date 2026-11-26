import { AppState, type AppStateStatus } from 'react-native';
import {
  addOp,
  enqueueHabit,
  flushOutbox,
  isDuplicateKey,
  isNetworkError,
  isUuid,
  latestPending,
  newHabitId,
  parseQueue,
  pendingCount,
  removeOp,
  replayOutbox,
  REPLAY_INTERVAL_MS,
  startOutboxReplay,
  takeLatestPending,
  toRow,
  withReplayPaused,
  type PendingHabit,
} from '../outbox';

/* In-memory AsyncStorage (mock-prefixed names so jest.mock may capture them) */
const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => void mockStore.set(k, v)),
    removeItem: jest.fn(async (k: string) => void mockStore.delete(k)),
  },
}));

jest.mock('expo-crypto', () => ({
  randomUUID: () => require('crypto').randomUUID(),
}));

/* Configurable supabase insert */
const mockInsert = jest.fn();
jest.mock('../supabase', () => ({
  supabase: { from: () => ({ insert: (...a: unknown[]) => mockInsert(...a) }) },
}));

/** Legacy-shaped op: ids from builds before they were UUIDs. */
const op = (id: string): PendingHabit => ({
  id,
  kind: 'cigarette',
  amount: 1,
  occurred_at: `2026-10-25T10:0${id}:00.000Z`,
});

const UUID = '7d5f3b2e-1a4c-4e8f-9b6d-2c1a0e9f8d7b';
const uuidOp = (id = UUID): PendingHabit => ({
  id,
  kind: 'alcohol',
  amount: 2,
  occurred_at: '2026-10-25T11:00:00.000Z',
});

beforeEach(() => {
  mockStore.clear();
  mockInsert.mockReset();
});

describe('pure queue transforms', () => {
  it('addOp appends and is idempotent on id', () => {
    const q = addOp([], op('1'));
    expect(q).toHaveLength(1);
    expect(addOp(q, op('1'))).toHaveLength(1); // dedup
    expect(addOp(q, op('2'))).toHaveLength(2);
  });

  it('removeOp drops by id', () => {
    expect(removeOp([op('1'), op('2')], '1')).toEqual([op('2')]);
  });

  it('parseQueue tolerates junk and non-arrays', () => {
    expect(parseQueue(null)).toEqual([]);
    expect(parseQueue('not json')).toEqual([]);
    expect(parseQueue('{"a":1}')).toEqual([]);
    expect(parseQueue(JSON.stringify([op('1'), { bogus: true }]))).toEqual([op('1')]);
  });
});

describe('ids', () => {
  it('newHabitId mints a v4 UUID, distinct per call', () => {
    const a = newHabitId();
    const b = newHabitId();
    expect(isUuid(a)).toBe(true);
    expect(isUuid(b)).toBe(true);
    expect(a).not.toBe(b);
  });

  it('isUuid rejects the legacy timestamp+random shape', () => {
    expect(isUuid('2026-10-25T10:01:00.000Z-k3j4h5g6')).toBe(false);
    expect(isUuid(UUID)).toBe(true);
  });

  it('toRow carries a UUID id as the primary key, but not a legacy id', () => {
    expect(toRow(uuidOp())).toEqual({
      id: UUID,
      kind: 'alcohol',
      amount: 2,
      occurred_at: '2026-10-25T11:00:00.000Z',
    });
    expect(toRow(op('1'))).not.toHaveProperty('id');
  });
});

describe('isNetworkError', () => {
  it('classifies connectivity failures as retryable', () => {
    expect(isNetworkError(new Error('Network request failed'))).toBe(true);
    expect(isNetworkError(new Error('TypeError: Failed to fetch'))).toBe(true);
    expect(isNetworkError(new Error('request timed out'))).toBe(true);
  });

  it('does not classify server rejections as retryable', () => {
    expect(isNetworkError(new Error('new row violates row-level security policy'))).toBe(false);
    expect(isNetworkError(new Error('JWT expired'))).toBe(false);
  });
});

describe('isDuplicateKey', () => {
  it('recognises the Postgres unique_violation code and nothing else', () => {
    expect(isDuplicateKey({ code: '23505', message: 'duplicate key value' })).toBe(true);
    expect(isDuplicateKey({ code: '42501', message: 'rls' })).toBe(false);
    expect(isDuplicateKey(new Error('duplicate key value'))).toBe(false);
    expect(isDuplicateKey(null)).toBe(false);
  });
});

describe('persistence + flush', () => {
  it('enqueue persists and pendingCount reflects it', async () => {
    await enqueueHabit(op('1'));
    await enqueueHabit(op('2'));
    expect(await pendingCount()).toBe(2);
  });

  it('flush syncs everything when the network is up', async () => {
    await enqueueHabit(op('1'));
    await enqueueHabit(op('2'));
    mockInsert.mockResolvedValue({ error: null });
    expect(await flushOutbox()).toBe(2);
    expect(await pendingCount()).toBe(0);
  });

  it('flush stops at the first network failure and keeps the rest', async () => {
    await enqueueHabit(op('1'));
    await enqueueHabit(op('2'));
    mockInsert
      .mockResolvedValueOnce({ error: null })
      .mockRejectedValueOnce(new Error('Network request failed'));
    expect(await flushOutbox()).toBe(1);
    expect(await pendingCount()).toBe(1); // op 2 preserved for later
  });

  it('flush drops a server-rejected op so it cannot wedge the queue', async () => {
    await enqueueHabit(op('1'));
    mockInsert.mockResolvedValue({ error: { message: 'row-level security' } });
    expect(await flushOutbox()).toBe(0);
    expect(await pendingCount()).toBe(0); // dropped, not retried forever
  });

  it('flush sends the client id as the row id so a replay is idempotent', async () => {
    await enqueueHabit(uuidOp());
    mockInsert.mockResolvedValue({ error: null });
    await flushOutbox();
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ id: UUID }));
  });

  it('a replay that hits the unique key counts as synced, not as a rejection', async () => {
    // The first attempt committed but its response was lost; the row is on the
    // server already. Replaying must clear the queue without logging it twice.
    await enqueueHabit(uuidOp());
    mockInsert.mockResolvedValue({
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    });
    expect(await flushOutbox()).toBe(1);
    expect(await pendingCount()).toBe(0);
  });

  it('legacy ops without a UUID id still replay (server-generated id)', async () => {
    await enqueueHabit(op('1'));
    mockInsert.mockResolvedValue({ error: null });
    expect(await flushOutbox()).toBe(1);
    const sent = mockInsert.mock.calls[0][0] as Record<string, unknown>;
    expect(sent).not.toHaveProperty('id');
    expect(sent.kind).toBe('cigarette');
  });
});

/** A promise plus its resolver, to hold an insert "in flight". */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

/** Let pending promise callbacks (AsyncStorage, inserts) run. */
const settle = () => new Promise((r) => setImmediate(r));

describe('replay concurrency', () => {
  it('a tap queued while a replay is in flight is kept, not overwritten', async () => {
    await enqueueHabit(op('1'));
    const insert = deferred<{ error: null }>();
    mockInsert.mockReturnValueOnce(insert.promise);
    const flushing = flushOutbox();
    await settle(); // op 1's insert is now in flight

    await enqueueHabit(op('2'));
    insert.resolve({ error: null });

    expect(await flushing).toBe(1);
    expect(await pendingCount()).toBe(1); // op 2 survived the replay's save
  });

  it('is single-flight: overlapping replays insert each op once', async () => {
    await enqueueHabit(uuidOp());
    mockInsert.mockResolvedValue({ error: null });
    const [a, b] = await Promise.all([flushOutbox(), flushOutbox()]);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(a).toBe(1);
    expect(b).toBe(1); // the second call joined the first
  });

  it('an empty queue replays without touching the network', async () => {
    expect(await flushOutbox()).toBe(0);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('withReplayPaused waits for an in-flight replay and starts none meanwhile', async () => {
    await enqueueHabit(op('1'));
    const insert = deferred<{ error: null }>();
    mockInsert.mockReturnValueOnce(insert.promise);
    const flushing = flushOutbox();
    await settle();

    let ranAfterReplay = false;
    const paused = withReplayPaused(async () => {
      ranAfterReplay = (await pendingCount()) === 0;
      await enqueueHabit(op('2'));
      expect(await flushOutbox()).toBe(0); // held off
      return 'done';
    });
    insert.resolve({ error: null });
    await flushing;
    expect(await paused).toBe('done');
    expect(ranAfterReplay).toBe(true);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(await pendingCount()).toBe(1);
  });
});

describe('undo of a queued tap', () => {
  const at = (iso: string, kind: PendingHabit['kind'] = 'intimacy', id = iso): PendingHabit => ({
    id,
    kind,
    amount: 1,
    occurred_at: iso,
  });

  it('latestPending picks the newest op of the kind, not older than the server row', () => {
    const q = [
      at('2026-10-25T10:00:00.000Z'),
      at('2026-10-25T12:00:00.000Z', 'cigarette'),
      at('2026-10-25T11:00:00.000Z'),
    ];
    expect(latestPending(q, 'intimacy')?.occurred_at).toBe('2026-10-25T11:00:00.000Z');
    expect(latestPending(q, 'intimacy', '2026-10-25T11:30:00.000Z')).toBeUndefined();
    expect(latestPending(q, 'alcohol')).toBeUndefined();
  });

  it('takeLatestPending removes exactly that op from storage', async () => {
    await enqueueHabit(at('2026-10-25T10:00:00.000Z'));
    await enqueueHabit(at('2026-10-25T11:00:00.000Z'));
    const taken = await takeLatestPending('intimacy');
    expect(taken?.occurred_at).toBe('2026-10-25T11:00:00.000Z');
    expect(await pendingCount()).toBe(1);
    expect(await takeLatestPending('alcohol')).toBeUndefined();
  });
});

describe('reconnect triggers', () => {
  let listeners: ((s: AppStateStatus) => void)[];
  let remove: jest.Mock;
  const setAppState = (s: AppStateStatus) => {
    Object.defineProperty(AppState, 'currentState', { value: s, configurable: true });
    listeners.forEach((l) => l(s));
  };

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    listeners = [];
    remove = jest.fn();
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_t, fn) => {
      listeners.push(fn as (s: AppStateStatus) => void);
      return { remove } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
    Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
    mockInsert.mockResolvedValue({ error: null });
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('replays immediately (app start / sign-in) and reports what synced', async () => {
    await enqueueHabit(op('1'));
    const onSynced = jest.fn();
    const stop = startOutboxReplay(onSynced);
    await settle();
    await settle();
    expect(onSynced).toHaveBeenCalledWith(1);
    expect(await pendingCount()).toBe(0);
    stop();
  });

  it('replays when the app returns to the foreground', async () => {
    const onSynced = jest.fn();
    const stop = startOutboxReplay(onSynced);
    await settle();
    await enqueueHabit(op('1')); // queued offline while backgrounded
    setAppState('background');
    await settle();
    expect(mockInsert).not.toHaveBeenCalled();
    setAppState('active');
    await settle();
    await settle();
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(onSynced).toHaveBeenCalledWith(1);
    stop();
  });

  it('retries periodically while foregrounded, but not in the background', async () => {
    const stop = startOutboxReplay(jest.fn());
    await settle();
    await enqueueHabit(op('1'));

    Object.defineProperty(AppState, 'currentState', { value: 'background', configurable: true });
    jest.advanceTimersByTime(REPLAY_INTERVAL_MS);
    await settle();
    expect(mockInsert).not.toHaveBeenCalled();

    Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
    jest.advanceTimersByTime(REPLAY_INTERVAL_MS);
    await settle();
    await settle();
    expect(mockInsert).toHaveBeenCalledTimes(1);
    stop();
  });

  it('stop() removes the AppState listener and the timer', async () => {
    const stop = startOutboxReplay(jest.fn());
    await settle();
    stop();
    expect(remove).toHaveBeenCalled();
    await enqueueHabit(op('1'));
    jest.advanceTimersByTime(REPLAY_INTERVAL_MS * 3);
    await settle();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('replayOutbox never throws and tells the active subscriber', async () => {
    const onSynced = jest.fn();
    const stop = startOutboxReplay(onSynced);
    await settle();
    await enqueueHabit(op('1'));
    expect(await replayOutbox()).toBe(1);
    expect(onSynced).toHaveBeenCalledWith(1);
    stop();

    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const AsyncStorage = jest.requireMock('@react-native-async-storage/async-storage').default;
    AsyncStorage.getItem.mockRejectedValueOnce(new Error('disk'));
    await expect(replayOutbox()).resolves.toBe(0);
    expect(warn).toHaveBeenCalled();
  });
});
