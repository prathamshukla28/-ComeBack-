import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import type { HabitKind } from './queries';

/**
 * Durable offline outbox for habit logs.
 *
 * The app is online-only against Supabase, so a tap on a flaky connection used
 * to silently throw away the log. Here, a write that fails for *network* reasons
 * is persisted to disk and replayed later (on app start and after the next
 * successful write) — the tap is never lost. Real server rejections (RLS, auth)
 * are NOT queued; those are genuine errors the caller should see.
 *
 * The queue transforms are pure functions so ordering/dedup is unit-testable
 * without a device, AsyncStorage, or a network.
 */

const KEY = 'comeback.outbox.habits.v1';

export interface PendingHabit {
  id: string;
  kind: HabitKind;
  amount: number;
  occurred_at: string;
}

/** A fetch/connectivity failure (queue it) vs. a server rejection (surface it). */
export function isNetworkError(e: unknown): boolean {
  const msg = (e instanceof Error ? e.message : String(e ?? '')).toLowerCase();
  return (
    msg.includes('network request failed') ||
    msg.includes('failed to fetch') ||
    msg.includes('network error') ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('offline') ||
    msg.includes('econnrefused') ||
    msg.includes('enetunreach')
  );
}

/* ---------- pure queue transforms ---------- */

export function addOp(queue: PendingHabit[], op: PendingHabit): PendingHabit[] {
  if (queue.some((q) => q.id === op.id)) return queue;
  return [...queue, op];
}

export function removeOp(queue: PendingHabit[], id: string): PendingHabit[] {
  return queue.filter((q) => q.id !== id);
}

export function parseQueue(raw: string | null): PendingHabit[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter(
      (o): o is PendingHabit =>
        o && typeof o.id === 'string' && typeof o.kind === 'string' && typeof o.amount === 'number',
    );
  } catch {
    return [];
  }
}

/* ---------- persistence ---------- */

async function read(): Promise<PendingHabit[]> {
  return parseQueue(await AsyncStorage.getItem(KEY));
}

async function write(queue: PendingHabit[]): Promise<void> {
  if (queue.length === 0) await AsyncStorage.removeItem(KEY);
  else await AsyncStorage.setItem(KEY, JSON.stringify(queue));
}

export async function enqueueHabit(op: PendingHabit): Promise<void> {
  await write(addOp(await read(), op));
}

export async function pendingCount(): Promise<number> {
  return (await read()).length;
}

/**
 * Replay queued logs oldest-first. Stops at the first network failure (still
 * offline) and leaves the rest queued; drops ops the server rejects outright so
 * a poison write can't wedge the queue forever. Returns how many synced.
 */
export async function flushOutbox(): Promise<number> {
  let queue = await read();
  let synced = 0;
  for (const op of queue) {
    try {
      const { error } = await supabase
        .from('habit_logs')
        .insert({ kind: op.kind, amount: op.amount, occurred_at: op.occurred_at });
      if (error) throw error;
      queue = removeOp(queue, op.id);
      synced++;
    } catch (e) {
      if (isNetworkError(e)) break; // still offline — keep this and the rest
      queue = removeOp(queue, op.id); // server rejected it — drop, don't wedge
    }
  }
  await write(queue);
  return synced;
}
