import * as SecureStore from 'expo-secure-store';

// Keys — namespaced so we don't collide with anything else
const K_GEMINI = 'comeback.gemini.apiKey';
const K_INTIMACY_PIN = 'comeback.intimacy.pin';

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

export async function saveIntimacyPin(pin: string): Promise<void> {
  await SecureStore.setItemAsync(K_INTIMACY_PIN, pin, opts);
}
export async function getIntimacyPin(): Promise<string | null> {
  return SecureStore.getItemAsync(K_INTIMACY_PIN, opts);
}
export async function clearIntimacyPin(): Promise<void> {
  await SecureStore.deleteItemAsync(K_INTIMACY_PIN, opts);
}
