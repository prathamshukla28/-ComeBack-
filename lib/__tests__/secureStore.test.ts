import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import {
  clearGeminiKey,
  GEMINI_KEY_UNAVAILABLE,
  geminiKeyStorageAvailable,
  getGeminiKey,
  saveGeminiKey,
} from '../secureStore';

const setOS = (os: string) =>
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });

describe('lib/secureStore — Gemini key', () => {
  const realOS = Platform.OS;
  afterEach(() => {
    setOS(realOS);
    jest.clearAllMocks();
  });

  it('is only available where there is a keychain', () => {
    expect(geminiKeyStorageAvailable('ios')).toBe(true);
    expect(geminiKeyStorageAvailable('android')).toBe(true);
    expect(geminiKeyStorageAvailable('web')).toBe(false);
  });

  it('on web: never touches storage, reads as "no key", refuses to save', async () => {
    setOS('web');
    expect(await getGeminiKey()).toBeNull();
    await expect(saveGeminiKey('AIza-something-long-enough')).rejects.toThrow(
      GEMINI_KEY_UNAVAILABLE,
    );
    await expect(clearGeminiKey()).resolves.toBeUndefined();
    expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
  });

  it('on native: goes through the keychain', async () => {
    setOS('ios');
    await saveGeminiKey('AIza-key');
    await getGeminiKey();
    await clearGeminiKey();
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'comeback.gemini.apiKey',
      'AIza-key',
      expect.any(Object),
    );
    expect(SecureStore.getItemAsync).toHaveBeenCalled();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
  });
});
