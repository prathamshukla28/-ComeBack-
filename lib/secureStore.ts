import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Keys — namespaced so we don't collide with anything else
const K_GEMINI = 'comeback.gemini.apiKey';

// NOTE: the intimacy PIN is stored (salted + hashed) and rate-limited by `lib/pin.ts`.

const opts: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

/** Thrown (as the message) when the Gemini key is needed on a platform with no keychain. */
export const GEMINI_KEY_UNAVAILABLE = 'GEMINI_KEY_UNAVAILABLE';

/** Shown wherever the key would be read or written on web. */
export const GEMINI_KEY_WEB_NOTICE =
  'Gemini key storage is mobile-only (it lives in the device keychain). Use the ComeBack app on your phone for the AI chats.';

/**
 * Whether the Gemini key can be kept here. Browsers have no keychain
 * (expo-secure-store has no web backend) and the key is deliberately never put in
 * localStorage, so on web there is no key and the AI chats explain why.
 */
export function geminiKeyStorageAvailable(os: string = Platform.OS): boolean {
  return os !== 'web';
}

export async function saveGeminiKey(key: string): Promise<void> {
  if (!geminiKeyStorageAvailable()) throw new Error(GEMINI_KEY_UNAVAILABLE);
  await SecureStore.setItemAsync(K_GEMINI, key, opts);
}
/** The stored key, or null. Always null on web (no keychain), never an error. */
export async function getGeminiKey(): Promise<string | null> {
  if (!geminiKeyStorageAvailable()) return null;
  return SecureStore.getItemAsync(K_GEMINI, opts);
}
export async function clearGeminiKey(): Promise<void> {
  if (!geminiKeyStorageAvailable()) return;
  await SecureStore.deleteItemAsync(K_GEMINI, opts);
}
