import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

/**
 * Intimacy-tab PIN: hashed at rest and rate-limited on verify.
 *
 * SecureStore already encrypts values with the OS keychain, but a PIN is
 * sensitive enough to never store or compare in plaintext — so we keep a salted
 * SHA-256 digest and compare digests. Brute-force is throttled with escalating
 * lockouts, because a 4-digit PIN is otherwise guessable in seconds.
 *
 * The lockout *math* lives in `computeLockout`, a pure function, so the policy
 * is unit-testable without touching native crypto or the keychain.
 */

const K_PIN = 'comeback.intimacy.pinHash';
const K_LOCK = 'comeback.intimacy.pinLock';
/** Plaintext PIN key written by builds before hashing existed. Migrated on first verify. */
const K_PIN_LEGACY = 'comeback.intimacy.pin';

const opts: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

/** Free guesses before lockouts kick in. */
export const FREE_ATTEMPTS = 5;
/** Base lockout once the free attempts are spent; doubles each further failure. */
export const BASE_LOCK_MS = 30_000;

export interface LockState {
  attempts: number;
  lockedUntil: number;
}

export interface LockDecision {
  /** New persisted lock state to store. */
  next: LockState;
  /** Epoch ms the user is locked until; 0 means not locked. */
  lockedUntil: number;
  /** Guesses remaining before the next lockout (0 once locked). */
  attemptsLeft: number;
}

/**
 * Pure lockout policy. Given the prior failure count and the current time,
 * decide the new state after one more wrong guess. The lockout doubles for each
 * failure beyond `FREE_ATTEMPTS` (30s → 60s → 120s …), capped at ~1 hour.
 */
export function computeLockout(prevAttempts: number, now: number): LockDecision {
  const attempts = prevAttempts + 1;
  if (attempts < FREE_ATTEMPTS) {
    return {
      next: { attempts, lockedUntil: 0 },
      lockedUntil: 0,
      attemptsLeft: FREE_ATTEMPTS - attempts,
    };
  }
  const overage = attempts - FREE_ATTEMPTS; // 0 on the first lockout
  const wait = Math.min(BASE_LOCK_MS * 2 ** overage, 60 * 60_000);
  const lockedUntil = now + wait;
  return { next: { attempts, lockedUntil }, lockedUntil, attemptsLeft: 0 };
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hashPin(pin: string, saltHex: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${saltHex}:${pin}`);
}

async function getLock(): Promise<LockState> {
  const raw = await SecureStore.getItemAsync(K_LOCK, opts);
  if (!raw) return { attempts: 0, lockedUntil: 0 };
  try {
    const parsed = JSON.parse(raw);
    return {
      attempts: Number(parsed.attempts) || 0,
      lockedUntil: Number(parsed.lockedUntil) || 0,
    };
  } catch {
    return { attempts: 0, lockedUntil: 0 };
  }
}

async function setLock(state: LockState): Promise<void> {
  await SecureStore.setItemAsync(K_LOCK, JSON.stringify(state), opts);
}

async function clearLock(): Promise<void> {
  await SecureStore.deleteItemAsync(K_LOCK, opts);
}

export async function hasPin(): Promise<boolean> {
  if (await SecureStore.getItemAsync(K_PIN, opts)) return true;
  return !!(await SecureStore.getItemAsync(K_PIN_LEGACY, opts));
}

export async function setPin(pin: string): Promise<void> {
  const salt = toHex(Crypto.getRandomBytes(16));
  const digest = await hashPin(pin, salt);
  await SecureStore.setItemAsync(K_PIN, `${salt}:${digest}`, opts);
  await clearLock();
}

export interface VerifyResult {
  ok: boolean;
  /** When set, the user is locked out until this epoch-ms timestamp. */
  lockedUntil?: number;
  /** Guesses left before the next lockout. */
  attemptsLeft?: number;
}

export async function verifyPin(pin: string): Promise<VerifyResult> {
  const now = Date.now();
  const lock = await getLock();
  if (lock.lockedUntil > now) return { ok: false, lockedUntil: lock.lockedUntil };

  const stored = await SecureStore.getItemAsync(K_PIN, opts);
  const legacy = stored ? null : await SecureStore.getItemAsync(K_PIN_LEGACY, opts);
  if (!stored && !legacy) return { ok: false };

  let match: boolean;
  if (stored) {
    const [salt, digest] = stored.split(':');
    match = (await hashPin(pin, salt)) === digest;
  } else {
    match = legacy === pin;
  }

  if (match) {
    // Upgrade a legacy plaintext PIN to a salted hash on first successful use.
    if (!stored) {
      await setPin(pin); // writes the hash and clears the lock
      await SecureStore.deleteItemAsync(K_PIN_LEGACY, opts);
    } else {
      await clearLock();
    }
    return { ok: true };
  }

  const decision = computeLockout(lock.attempts, now);
  await setLock(decision.next);
  return {
    ok: false,
    lockedUntil: decision.lockedUntil || undefined,
    attemptsLeft: decision.attemptsLeft,
  };
}
