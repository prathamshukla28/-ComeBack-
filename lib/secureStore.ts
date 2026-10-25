import * as SecureStore from 'expo-secure-store';

// Keys — namespaced so we don't collide with anything else
const K_GEMINI = 'comeback.gemini.apiKey';

// NOTE: the intimacy PIN is stored (salted + hashed) and rate-limited by `lib/pin.ts`.

const opts: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export async function saveGeminiKey(key: string): Promise<void> {
  await SecureStore.setItemAsync(K_GEMINI, key, opts);
}
export async function getGeminiKey(): Promise<string | null> {
  return SecureStore.getItemAsync(K_GEMINI, opts);
}
export async function clearGeminiKey(): Promise<void> {
  await SecureStore.deleteItemAsync(K_GEMINI, opts);
}
