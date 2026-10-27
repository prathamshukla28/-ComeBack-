import {
  addOp,
  enqueueHabit,
  flushOutbox,
  isDuplicateKey,
  isNetworkError,
  isUuid,
  newHabitId,
  parseQueue,
  pendingCount,
  removeOp,
  toRow,
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
