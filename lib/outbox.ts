import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { AppState } from 'react-native';
import { supabase } from './supabase';
import type { HabitKind } from './queries';

/**
 * Durable offline outbox for habit logs (cigarette, alcohol and the private tab's
 * intimacy taps alike).
 *
 * The app is online-only against Supabase, so a tap on a flaky connection used
 * to silently throw away the log. Here, a write that fails for *network* reasons
 * is persisted to disk and replayed later — the tap is never lost. Real server
 * rejections (RLS, auth) are NOT queued; those are genuine errors the caller
 * should see.
 *
 * When it replays ({@link startOutboxReplay}, mounted once signed in by
 * app/_layout.tsx): on app start / sign-in, whenever the app returns to the
 * foreground, every {@link REPLAY_INTERVAL_MS} while it is in the foreground, and
 * right after any live habit write succeeds (proof the connection is back). There is
 * no OS network-change listener: that would need a native module
 * (@react-native-community/netinfo), so the foreground + periodic retry stands in.
 *
 * What is stored: only `{ id, kind, amount, occurred_at }`, in the app's private
 * AsyncStorage, and only until it syncs. A queued private-tab tap therefore sits on
 * the device the same way the synced row already appears in the app's data cache.
 *
 * Replay is idempotent: the client-generated id is also the row's primary key,
 * so an insert whose response was lost in transit (committed server-side, but
 * the device never heard back) replays into a unique-key violation — which is
 * treated as "already landed" — instead of logging the habit twice.
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

/** A fresh id for a habit log — used both as the queue key and the row's primary key. */
export function newHabitId(): string {
  try {
    return Crypto.randomUUID();
  } catch {
    // expo-crypto unavailable (should not happen on a built app): a Math.random v4
    // is still unique enough to key an idempotent insert.
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }
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

/** Postgres `unique_violation`: this row already landed on an earlier attempt. */
export function isDuplicateKey(e: unknown): boolean {
  return (e as { code?: unknown } | null)?.code === '23505';
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

/**
 * The row an op inserts. Ops queued by builds before ids were UUIDs cannot be
 * used as a primary key; those fall back to a server-generated id (the old,
 * non-idempotent behaviour) rather than being rejected and dropped.
 */
export function toRow(op: PendingHabit): Record<string, unknown> {
  const row: Record<string, unknown> = {
    kind: op.kind,
    amount: op.amount,
    occurred_at: op.occurred_at,
  };
  if (isUuid(op.id)) row.id = op.id;
  return row;
}

/**
 * The newest queued op of `kind` that is not older than `notOlderThan` (an ISO
 * timestamp), or undefined. Undo uses it to take back a tap that never reached the
 * server instead of deleting an older, already-synced row.
 */
export function latestPending(
  queue: PendingHabit[],
  kind: HabitKind,
  notOlderThan?: string | null,
): PendingHabit | undefined {
  const floor = notOlderThan ? Date.parse(notOlderThan) : -Infinity;
  let best: PendingHabit | undefined;
  for (const op of queue) {
    if (op.kind !== kind) continue;
    const at = Date.parse(op.occurred_at);
    if (!(at >= floor)) continue;
    if (!best || at >= Date.parse(best.occurred_at)) best = op;
  }
  return best;
}

/* ---------- persistence ---------- */

async function read(): Promise<PendingHabit[]> {
  return parseQueue(await AsyncStorage.getItem(KEY));
}

async function write(queue: PendingHabit[]): Promise<void> {
  if (queue.length === 0) await AsyncStorage.removeItem(KEY);
  else await AsyncStorage.setItem(KEY, JSON.stringify(queue));
}

/**
 * Every read-modify-write of the stored queue runs through this chain, one at a
 * time. Without it, a tap enqueued while a replay is mid-flight is overwritten when
 * the replay saves its (older) view of the queue — the tap would be lost.
 */
let queueChain: Promise<unknown> = Promise.resolve();
function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const run = queueChain.then(fn, fn);
  queueChain = run.catch(() => undefined);
  return run;
}

export function enqueueHabit(op: PendingHabit): Promise<void> {
  return serialized(async () => write(addOp(await read(), op)));
}

export async function pendingCount(): Promise<number> {
  return (await read()).length;
}

/**
 * Remove and return the newest queued op of `kind` not older than `notOlderThan`
 * (see {@link latestPending}), or undefined when there is none.
 */
export function takeLatestPending(
  kind: HabitKind,
  notOlderThan?: string | null,
): Promise<PendingHabit | undefined> {
  return serialized(async () => {
    const queue = await read();
    const op = latestPending(queue, kind, notOlderThan);
    if (op) await write(removeOp(queue, op.id));
    return op;
  });
}

let inFlight: Promise<number> | null = null;
let paused = 0;

/**
 * Run `fn` with replays held off: waits for an in-flight replay to settle and
 * starts none until `fn` finishes. Undo uses it so a queued tap cannot be sent to
 * the server between "is it still queued?" and "remove it from the queue".
 */
export async function withReplayPaused<T>(fn: () => Promise<T>): Promise<T> {
  paused++;
  try {
    if (inFlight) await inFlight.catch(() => 0);
    return await fn();
  } finally {
    paused--;
  }
}

/**
 * Replay queued logs oldest-first. Stops at the first network failure (still
 * offline) and leaves the rest queued; drops ops the server rejects outright so
 * a poison write can't wedge the queue forever. Returns how many synced.
 *
 * Single-flight: a call made while a replay is running joins it instead of
 * inserting the same ops twice. Ops enqueued during the replay are kept. While an
 * undo holds replays off ({@link withReplayPaused}) it syncs nothing and returns 0;
 * the next trigger picks the queue up.
 */
export function flushOutbox(): Promise<number> {
  if (paused > 0 && !inFlight) return Promise.resolve(0);
  inFlight ??= replay().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function replay(): Promise<number> {
  const queue = await read();
  if (!queue.length) return 0;
  const done = new Set<string>();
  let synced = 0;
  for (const op of queue) {
    try {
      const { error } = await supabase.from('habit_logs').insert(toRow(op));
      if (error && !isDuplicateKey(error)) throw error;
      done.add(op.id);
      synced++;
    } catch (e) {
      if (isNetworkError(e)) break; // still offline — keep this and the rest
      done.add(op.id); // server rejected it — drop, don't wedge
    }
  }
  // Re-read: remove only what this replay settled, keeping anything queued meanwhile.
  await serialized(async () => write((await read()).filter((op) => !done.has(op.id))));
  return synced;
}

/* ---------- replay triggers ---------- */

/** How often a foregrounded app retries a non-empty queue. */
export const REPLAY_INTERVAL_MS = 30_000;

let onReplayed: ((synced: number) => void) | null = null;

/**
 * Flush now and tell the active {@link startOutboxReplay} subscriber how many logs
 * synced. Never throws (it runs fire-and-forget).
 */
export async function replayOutbox(): Promise<number> {
  try {
    const n = await flushOutbox();
    if (n > 0) onReplayed?.(n);
    return n;
  } catch (e) {
    console.warn('[ComeBack] outbox flush failed', e);
    return 0;
  }
}

/**
 * Start replaying the outbox: immediately (app start / sign-in), when the app
 * returns to the foreground, and every `intervalMs` while it is in the foreground.
 * `onSynced(n)` runs after any replay that synced something (e.g. to refetch the
 * habit queries). Returns a function that stops all of it.
 */
export function startOutboxReplay(
  onSynced: (synced: number) => void,
  intervalMs: number = REPLAY_INTERVAL_MS,
): () => void {
  onReplayed = onSynced;
  void replayOutbox();
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active') void replayOutbox();
  });
  const timer = setInterval(() => {
    if (AppState.currentState === 'active') void replayOutbox();
  }, intervalMs);
  return () => {
    sub.remove();
    clearInterval(timer);
    if (onReplayed === onSynced) onReplayed = null;
  };
}
