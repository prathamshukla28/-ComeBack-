import AsyncStorage from '@react-native-async-storage/async-storage';
import aesjs from 'aes-js';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Encrypted storage adapter for the Supabase session.
 *
 * supabase-js persists the session (access + refresh token) through a
 * localStorage-shaped adapter. Plain AsyncStorage is plaintext on disk, so a
 * device backup or a rooted phone exposes the refresh token — the one credential
 * that unlocks every private row this app stores. SecureStore alone cannot hold
 * it: values are capped at 2048 bytes on some platforms and a session blob is
 * larger. So the blob is AES-256-CTR encrypted into AsyncStorage and only the
 * 32-byte key — small, fixed-size — lives in the OS keychain via SecureStore.
 * This is the adapter shape Supabase documents for Expo; aes-js is pure JS
 * (no native module, no prebuild).
 *
 * CTR gives confidentiality, not integrity: a blob tampered with on disk
 * decrypts to garbage, fails the JSON check below, and the user is simply
 * signed out — the failure mode we want.
 *
 * Web has no SecureStore. There the session is stored as-is (localStorage), the
 * same guarantee every web app has: mobile-only guardrails degrade, never crash.
 *
 * SPEC-GAP: SPEC-GAP-017
 */

const KEY_BYTES = 32;
const IV_BYTES = 16;

const secureOpts: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export interface SessionStorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/* ---------- pure helpers (unit-tested without a device) ---------- */

/**
 * UTF-8 codec. aes-js ships one, but its decoder cannot reassemble 4-byte
 * sequences (emoji — e.g. in a display name inside the session JSON), and
 * TextEncoder/TextDecoder are not guaranteed on every Hermes build, so this is
 * spelled out. The decoder throws on malformed input, which is how a wrong-key
 * decryption is caught rather than returned as mojibake.
 */
export function utf8Encode(text: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let cp = text.charCodeAt(i);
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < text.length) {
      const lo = text.charCodeAt(i + 1);
      if (lo >= 0xdc00 && lo <= 0xdfff) {
        cp = 0x10000 + ((cp - 0xd800) << 10) + (lo - 0xdc00);
        i++;
      }
    }
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else if (cp < 0x10000) {
      out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    } else {
      out.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
    }
  }
  return Uint8Array.from(out);
}

export function utf8Decode(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length;) {
    const b = bytes[i];
    let cp: number;
    let n: number;
    if (b < 0x80) [cp, n] = [b, 1];
    else if ((b & 0xe0) === 0xc0) [cp, n] = [b & 0x1f, 2];
    else if ((b & 0xf0) === 0xe0) [cp, n] = [b & 0x0f, 3];
    else if ((b & 0xf8) === 0xf0) [cp, n] = [b & 0x07, 4];
    else throw new Error('invalid utf-8 lead byte');
    if (i + n > bytes.length) throw new Error('truncated utf-8 sequence');
    for (let j = 1; j < n; j++) {
      const c = bytes[i + j];
      if ((c & 0xc0) !== 0x80) throw new Error('invalid utf-8 continuation byte');
      cp = (cp << 6) | (c & 0x3f);
    }
    i += n;
    if (cp > 0xffff) {
      cp -= 0x10000;
      out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
    } else {
      out += String.fromCharCode(cp);
    }
  }
  return out;
}

export function encryptString(plain: string, key: Uint8Array, iv: Uint8Array): string {
  if (key.length !== KEY_BYTES) throw new Error(`key must be ${KEY_BYTES} bytes`);
  if (iv.length !== IV_BYTES) throw new Error(`iv must be ${IV_BYTES} bytes`);
  const ctr = new aesjs.ModeOfOperation.ctr(key, new aesjs.Counter(iv));
  const ciphertext = ctr.encrypt(utf8Encode(plain));
  return `${aesjs.utils.hex.fromBytes(iv)}:${aesjs.utils.hex.fromBytes(ciphertext)}`;
}

/** Returns null for a malformed payload or a decryption that is not valid UTF-8 (wrong key). */
export function decryptString(payload: string, key: Uint8Array): string | null {
  const [ivHex, ctHex, extra] = payload.split(':');
  if (!ivHex || ctHex === undefined || extra !== undefined || ivHex.length !== IV_BYTES * 2) {
    return null;
  }
  try {
    const ctr = new aesjs.ModeOfOperation.ctr(
      key,
      new aesjs.Counter(aesjs.utils.hex.toBytes(ivHex)),
    );
    return utf8Decode(ctr.decrypt(aesjs.utils.hex.toBytes(ctHex)));
  } catch {
    return null;
  }
}

/** supabase-js only ever stores JSON; anything else is a legacy or corrupted blob. */
export function looksLikeJson(value: string): boolean {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

/** SecureStore keys may only contain alphanumerics, '.', '-', '_'. */
function keyNameFor(storageKey: string): string {
  return `comeback.session.key.${storageKey}`.replace(/[^A-Za-z0-9._-]/g, '_');
}

/* ---------- adapter ---------- */

export function createEncryptedStorage(options: { secure: boolean }): SessionStorageAdapter {
  if (!options.secure) {
    return {
      getItem: (key) => AsyncStorage.getItem(key),
      setItem: (key, value) => AsyncStorage.setItem(key, value),
      removeItem: (key) => AsyncStorage.removeItem(key),
    };
  }

  async function loadOrCreateKey(storageKey: string): Promise<Uint8Array> {
    const name = keyNameFor(storageKey);
    const existing = await SecureStore.getItemAsync(name, secureOpts);
    if (existing) return aesjs.utils.hex.toBytes(existing);
    const fresh = Crypto.getRandomBytes(KEY_BYTES);
    await SecureStore.setItemAsync(name, aesjs.utils.hex.fromBytes(fresh), secureOpts);
    return fresh;
  }

  const adapter: SessionStorageAdapter = {
    async getItem(key) {
      const stored = await AsyncStorage.getItem(key);
      if (stored == null) return null;

      const keyHex = await SecureStore.getItemAsync(keyNameFor(key), secureOpts);
      if (!keyHex) {
        // No key in the keychain. Either a session a pre-encryption build wrote in
        // plaintext — upgrade it in place so the user stays signed in — or a blob
        // whose key is gone, which is unreadable: clear it and start signed out.
        if (looksLikeJson(stored)) {
          await adapter.setItem(key, stored);
          return stored;
        }
        await AsyncStorage.removeItem(key);
        return null;
      }

      const plain = decryptString(stored, aesjs.utils.hex.toBytes(keyHex));
      if (plain == null || !looksLikeJson(plain)) {
        await adapter.removeItem(key);
        return null;
      }
      return plain;
    },

    async setItem(key, value) {
      const keyBytes = await loadOrCreateKey(key);
      const iv = Crypto.getRandomBytes(IV_BYTES);
      await AsyncStorage.setItem(key, encryptString(value, keyBytes, iv));
    },

    async removeItem(key) {
      await AsyncStorage.removeItem(key);
      await SecureStore.deleteItemAsync(keyNameFor(key), secureOpts);
    },
  };
  return adapter;
}

export const encryptedSessionStorage = createEncryptedStorage({ secure: Platform.OS !== 'web' });
