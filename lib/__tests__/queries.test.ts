import { cleanStreak, habitCountToday, isNewPR } from '../queries';

type Row = Record<string, unknown>;
type Result = { data: Row[] | Row | null; error: null | { message: string } };

const state: {
  rows: Row[];
  single: boolean;
  error: null | { message: string };
} = { rows: [], single: false, error: null };

type Chain = {
  insert: jest.Mock;
  select: jest.Mock;
  eq: jest.Mock;
  gte: jest.Mock;
  order: jest.Mock;
  limit: jest.Mock;
  single: jest.Mock;
  then: (onFulfilled: (v: Result) => unknown) => Promise<unknown>;
};

const chain = (): Chain => {
  const c: Chain = {
    insert: jest.fn(() => c),
    select: jest.fn(() => c),
    eq: jest.fn(() => c),
    gte: jest.fn(() => c),
    order: jest.fn(() => c),
    limit: jest.fn(() => c),
    single: jest.fn(async (): Promise<Result> => ({
      data: state.rows[0] ?? null,
      error: state.error,
    })),
    then: (onFulfilled) =>
      Promise.resolve<Result>({
        data: state.single ? (state.rows[0] ?? null) : state.rows,
        error: state.error,
      }).then(onFulfilled),
  };
  return c;
};

jest.mock('../supabase', () => ({
  supabase: { from: jest.fn(() => chain()) },
}));

const isoOf = (d: Date) => d.toISOString();
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};

beforeEach(() => {
  state.rows = [];
  state.single = false;
  state.error = null;
});

describe('habitCountToday', () => {
  it('sums the amount column across returned rows', async () => {
    state.rows = [{ amount: 1 }, { amount: 2 }, { amount: 3 }];
    await expect(habitCountToday('cigarette')).resolves.toBe(6);
  });

  it('returns 0 when no rows exist for today', async () => {
    state.rows = [];
    await expect(habitCountToday('alcohol')).resolves.toBe(0);
  });

  it('treats missing amount as 0 (falsy coercion in reducer)', async () => {
    state.rows = [{ amount: 0 }, { amount: null }, { amount: 4 }];
    await expect(habitCountToday('cigarette')).resolves.toBe(4);
  });
});

describe('cleanStreak', () => {
  it('returns 999 sentinel when there is no prior log', async () => {
    state.rows = [];
    await expect(cleanStreak('cigarette')).resolves.toBe(999);
  });

  it('returns 0 when the last occurrence was today', async () => {
    state.rows = [{ occurred_at: isoOf(new Date()) }];
    await expect(cleanStreak('cigarette')).resolves.toBe(0);
  });

  it('returns floor day-diff when the last occurrence was N days ago', async () => {
    state.rows = [{ occurred_at: isoOf(daysAgo(5)) }];
    await expect(cleanStreak('cigarette')).resolves.toBe(5);
  });
});

describe('isNewPR', () => {
  it('is true when there is no prior history', async () => {
    state.rows = [{ weight_kg: 100, reps: 5 }];
    await expect(isNewPR('bench', 100, 5)).resolves.toBe(true);
  });

  it('is true when current estimated 1RM beats best prior', async () => {
    state.rows = [
      { weight_kg: 100, reps: 5 }, // current
      { weight_kg: 90, reps: 5 },
      { weight_kg: 80, reps: 8 },
    ];
    await expect(isNewPR('bench', 100, 5)).resolves.toBe(true);
  });

  it('is false when prior 1RM is higher', async () => {
    state.rows = [
      { weight_kg: 90, reps: 5 }, // current
      { weight_kg: 120, reps: 5 }, // prior stronger
    ];
    await expect(isNewPR('bench', 90, 5)).resolves.toBe(false);
  });

  it('propagates supabase errors', async () => {
    state.error = { message: 'boom' };
    await expect(isNewPR('bench', 100, 5)).rejects.toEqual({ message: 'boom' });
  });
});
