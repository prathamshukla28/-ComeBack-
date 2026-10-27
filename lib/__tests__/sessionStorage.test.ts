import { randomBytes } from 'crypto';
import {
  createEncryptedStorage,
  decryptString,
  encryptString,
  looksLikeJson,
  utf8Decode,
  utf8Encode,
} from '../sessionStorage';

const mockAsyncStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => mockAsyncStore.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => void mockAsyncStore.set(k, v)),
    removeItem: jest.fn(async (k: string) => void mockAsyncStore.delete(k)),
  },
}));

const mockKeychain = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'whenUnlockedThisDeviceOnly',
  getItemAsync: jest.fn(async (k: string) => mockKeychain.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => void mockKeychain.set(k, v)),
  deleteItemAsync: jest.fn(async (k: string) => void mockKeychain.delete(k)),
}));

jest.mock('expo-crypto', () => ({
  getRandomBytes: (n: number) => new Uint8Array(require('crypto').randomBytes(n)),
}));

const KEY = 'sb-testproj-auth-token';
const SESSION = JSON.stringify({
  access_token: 'eyJhbGciOiJIUzI1NiJ9.payload.sig',
  refresh_token: 'refresh-me-please',
  user: { id: 'user-123' },
});

const key32 = () => new Uint8Array(randomBytes(32));
const iv16 = () => new Uint8Array(randomBytes(16));

beforeEach(() => {
  mockAsyncStore.clear();
  mockKeychain.clear();
});

describe('utf8Encode / utf8Decode', () => {
  // 1-, 2-, 3- and 4-byte sequences: ASCII, é, ₹ / 日, 🌍 (surrogate pair in JS).
  const SAMPLE = 'héllo ₹100 日本 🌍 {"name":"Pratham 💪"}';

  it('matches the platform encoder byte-for-byte and round-trips', () => {
    const bytes = utf8Encode(SAMPLE);
    expect(Array.from(bytes)).toEqual(Array.from(Buffer.from(SAMPLE, 'utf8')));
    expect(utf8Decode(bytes)).toBe(SAMPLE);
  });

  it('rejects malformed sequences instead of producing mojibake', () => {
    expect(() => utf8Decode(Uint8Array.from([0xff]))).toThrow(/lead byte/);
    expect(() => utf8Decode(Uint8Array.from([0xe2, 0x82]))).toThrow(/truncated/);
    expect(() => utf8Decode(Uint8Array.from([0xc3, 0x41]))).toThrow(/continuation/);
  });
});

describe('encryptString / decryptString', () => {
  it('round-trips unicode text, including 4-byte emoji', () => {
    const k = key32();
    const text = 'héllo 🌍 {"name":"💪"}';
    expect(decryptString(encryptString(text, k, iv16()), k)).toBe(text);
  });

  it('never stores the plaintext and differs per IV', () => {
    const k = key32();
    const a = encryptString(SESSION, k, iv16());
    const b = encryptString(SESSION, k, iv16());
    expect(a).not.toContain('refresh-me-please');
    expect(a).not.toBe(b);
  });

  it('a wrong key is detected (invalid UTF-8) rather than returned as garbage', () => {
    const payload = encryptString(SESSION, key32(), iv16());
    // Random bytes are overwhelmingly unlikely to be valid UTF-8 for a 100+ byte blob.
    expect(decryptString(payload, key32())).toBeNull();
  });

  it('rejects malformed payloads instead of throwing', () => {
    const k = key32();
    expect(decryptString('not-a-payload', k)).toBeNull();
    expect(decryptString('abcd:ef', k)).toBeNull();
    expect(decryptString(`${'00'.repeat(16)}:00:extra`, k)).toBeNull();
  });

  it('enforces key and IV sizes', () => {
    expect(() => encryptString('x', new Uint8Array(16), iv16())).toThrow(/32 bytes/);
    expect(() => encryptString('x', key32(), new Uint8Array(8))).toThrow(/16 bytes/);
  });
});

describe('looksLikeJson', () => {
  it('accepts a session blob and rejects ciphertext', () => {
    expect(looksLikeJson(SESSION)).toBe(true);
    expect(looksLikeJson('00ff:aa11')).toBe(false);
  });
});

describe('encrypted adapter (native)', () => {
  const storage = createEncryptedStorage({ secure: true });

  it('writes ciphertext to AsyncStorage and the key to the mockKeychain', async () => {
    await storage.setItem(KEY, SESSION);
    const onDisk = mockAsyncStore.get(KEY)!;
    expect(onDisk).toBeDefined();
    expect(onDisk).not.toContain('refresh-me-please');
    expect(onDisk).not.toContain('user-123');
    expect(mockKeychain.size).toBe(1);
    expect([...mockKeychain.values()][0]).toMatch(/^[0-9a-f]{64}$/);
  });

  it('reads back exactly what was written', async () => {
    await storage.setItem(KEY, SESSION);
    expect(await storage.getItem(KEY)).toBe(SESSION);
  });

  it('keeps one key per storage key across rewrites (fresh IV each time)', async () => {
    await storage.setItem(KEY, SESSION);
    const first = mockAsyncStore.get(KEY);
    const k = [...mockKeychain.values()][0];
    await storage.setItem(KEY, SESSION);
    expect([...mockKeychain.values()][0]).toBe(k);
    expect(mockAsyncStore.get(KEY)).not.toBe(first);
    expect(await storage.getItem(KEY)).toBe(SESSION);
  });

  it('removeItem clears both the blob and the key', async () => {
    await storage.setItem(KEY, SESSION);
    await storage.removeItem(KEY);
    expect(mockAsyncStore.size).toBe(0);
    expect(mockKeychain.size).toBe(0);
    expect(await storage.getItem(KEY)).toBeNull();
  });

  it('upgrades a plaintext session left by a pre-encryption build without signing out', async () => {
    mockAsyncStore.set(KEY, SESSION); // what the old AsyncStorage adapter wrote
    expect(await storage.getItem(KEY)).toBe(SESSION);
    // ...and it is now encrypted at rest with a key in the mockKeychain.
    expect(mockAsyncStore.get(KEY)).not.toContain('refresh-me-please');
    expect(mockKeychain.size).toBe(1);
    expect(await storage.getItem(KEY)).toBe(SESSION);
  });

  it('treats an encrypted blob whose key is gone as signed out and clears it', async () => {
    await storage.setItem(KEY, SESSION);
    mockKeychain.clear(); // e.g. mockKeychain wiped, blob restored from a backup
    expect(await storage.getItem(KEY)).toBeNull();
    expect(mockAsyncStore.size).toBe(0);
  });

  it('treats a tampered blob as signed out and clears it', async () => {
    await storage.setItem(KEY, SESSION);
    const [iv, ct] = mockAsyncStore.get(KEY)!.split(':');
    mockAsyncStore.set(KEY, `${iv}:${ct.slice(0, -8)}deadbeef`);
    expect(await storage.getItem(KEY)).toBeNull();
    expect(mockAsyncStore.size).toBe(0);
    expect(mockKeychain.size).toBe(0);
  });

  it('returns null when nothing is stored', async () => {
    expect(await storage.getItem(KEY)).toBeNull();
  });
});

describe('plain adapter (web)', () => {
  const storage = createEncryptedStorage({ secure: false });

  it('passes through to AsyncStorage and never touches the mockKeychain', async () => {
    await storage.setItem(KEY, SESSION);
    expect(mockAsyncStore.get(KEY)).toBe(SESSION);
    expect(mockKeychain.size).toBe(0);
    expect(await storage.getItem(KEY)).toBe(SESSION);
    await storage.removeItem(KEY);
    expect(mockAsyncStore.size).toBe(0);
  });
});
