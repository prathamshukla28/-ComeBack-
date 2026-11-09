/**
 * A tiny stand-in for the supabase-js query builder, for unit tests.
 *
 * Every `supabase.from(table)` chain is recorded (method name + args, in order) and
 * resolves to the next response queued for that table, or `{ data: [], error: null }`
 * when the queue is empty. Usage in a test file:
 *
 *   jest.mock('../supabase', () => require('../../test-utils/supabase-mock').supabaseModule);
 *   import { db } from '../../test-utils/supabase-mock';
 *   db.queue('habit_logs', { data: [{ amount: 2 }] });
 */

export interface MockResponse {
  data?: unknown;
  error?: unknown;
}

export interface RecordedCall {
  table: string;
  ops: [method: string, args: unknown[]][];
}

const TERMINAL = new Set(['single', 'maybeSingle']);

class MockDb {
  calls: RecordedCall[] = [];
  private queues = new Map<string, MockResponse[]>();

  /** Queue responses for `table`, consumed in order as its chains resolve. */
  queue(table: string, ...responses: MockResponse[]): void {
    const q = this.queues.get(table) ?? [];
    q.push(...responses);
    this.queues.set(table, q);
  }

  reset(): void {
    this.calls = [];
    this.queues.clear();
  }

  /** Recorded chains for one table, in call order. */
  callsTo(table: string): RecordedCall[] {
    return this.calls.filter((c) => c.table === table);
  }

  private next(table: string): { data: unknown; error: unknown } {
    const r = this.queues.get(table)?.shift() ?? {};
    return { data: 'data' in r ? r.data : [], error: r.error ?? null };
  }

  from(table: string): unknown {
    const rec: RecordedCall = { table, ops: [] };
    this.calls.push(rec);
    let settled: Promise<{ data: unknown; error: unknown }> | null = null;
    const resolve = () => (settled ??= Promise.resolve(this.next(table)));
    const builder: unknown = new Proxy(
      {},
      {
        get: (_target, prop) => {
          if (prop === 'then') {
            return (ok: (v: unknown) => unknown, fail: (e: unknown) => unknown) =>
              resolve().then(ok, fail);
          }
          return (...args: unknown[]) => {
            rec.ops.push([String(prop), args]);
            return TERMINAL.has(String(prop)) ? resolve() : builder;
          };
        },
      },
    );
    return builder;
  }
}

export const db = new MockDb();

export const supabaseModule = {
  supabase: {
    from: (table: string) => db.from(table),
    auth: {
      getSession: jest.fn(async () => ({ data: { session: { access_token: 'user-jwt' } } })),
    },
  },
};

/** Args of the first recorded call to `method` in a chain, or undefined. */
export function argsOf(call: RecordedCall | undefined, method: string): unknown[] | undefined {
  return call?.ops.find(([m]) => m === method)?.[1];
}

/** All recorded calls to `method` in a chain. */
export function allArgsOf(call: RecordedCall | undefined, method: string): unknown[][] {
  return (call?.ops ?? []).filter(([m]) => m === method).map(([, a]) => a);
}
