import { demoDataEnabled, demoProEnabled } from '../demo';

// lib/supabase.ts pulls in the session adapter; AsyncStorage has no native module in Jest.
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));

describe('demoProEnabled — dev-only demo Pro', () => {
  it('is on only for a dev build with the flag set to exactly "1"', () => {
    expect(demoProEnabled('1', true, 'development')).toBe(true);
    expect(demoProEnabled('1', true, 'test')).toBe(true);
  });

  it('is off in any production build, whatever the flag says', () => {
    expect(demoProEnabled('1', false, 'production')).toBe(false);
    expect(demoProEnabled('1', true, 'production')).toBe(false); // even if __DEV__ were true
    expect(demoProEnabled('1', false, 'development')).toBe(false); // __DEV__ false
  });

  it('is off unless the flag is exactly "1"', () => {
    for (const flag of [undefined, '', '0', 'true', 'yes', ' 1']) {
      expect(demoProEnabled(flag, true, 'development')).toBe(false);
    }
  });

  it('defaults to off in the test environment (flag unset)', () => {
    expect(process.env.EXPO_PUBLIC_DEMO_PRO).toBeUndefined();
    expect(demoProEnabled()).toBe(false);
  });
});

describe('demoDataEnabled — dev-only demo data', () => {
  it('is on only for a dev build with the flag set to exactly "1"', () => {
    expect(demoDataEnabled('1', true, 'development')).toBe(true);
  });

  it('is off in any production build, whatever the flag says', () => {
    expect(demoDataEnabled('1', false, 'production')).toBe(false);
    expect(demoDataEnabled('1', true, 'production')).toBe(false);
    expect(demoDataEnabled('1', false, 'development')).toBe(false);
  });

  it('is off unless the flag is exactly "1"', () => {
    for (const flag of [undefined, '', '0', 'true', ' 1']) {
      expect(demoDataEnabled(flag, true, 'development')).toBe(false);
    }
  });

  it('defaults to off in the test environment (flag unset)', () => {
    expect(process.env.EXPO_PUBLIC_DEMO_DATA).toBeUndefined();
    expect(demoDataEnabled()).toBe(false);
  });
});

describe('lib/supabase.ts honours the demo-data guard', () => {
  const saved = { flag: process.env.EXPO_PUBLIC_DEMO_DATA, nodeEnv: process.env.NODE_ENV };
  const savedDev = (global as { __DEV__?: boolean }).__DEV__;

  afterEach(() => {
    if (saved.flag === undefined) delete process.env.EXPO_PUBLIC_DEMO_DATA;
    else process.env.EXPO_PUBLIC_DEMO_DATA = saved.flag;
    (process.env as Record<string, string | undefined>).NODE_ENV = saved.nodeEnv;
    (global as { __DEV__?: boolean }).__DEV__ = savedDev;
  });

  /** The client lib/supabase.ts exports under the current env, from a fresh module registry. */
  function loadClient(): { isDemo: boolean } {
    let isDemo = false;
    jest.isolateModules(() => {
      const { supabase } = require('../supabase');
      // The real SupabaseClient has realtime channels; the demo stand-in does not.
      isDemo = typeof supabase.channel !== 'function';
    });
    return { isDemo };
  }

  it('uses the in-memory demo client in a dev build with the flag set', () => {
    process.env.EXPO_PUBLIC_DEMO_DATA = '1';
    (global as { __DEV__?: boolean }).__DEV__ = true;
    expect(loadClient().isDemo).toBe(true);
  });

  it('uses the real client when NODE_ENV is production, even with the flag set', () => {
    process.env.EXPO_PUBLIC_DEMO_DATA = '1';
    (global as { __DEV__?: boolean }).__DEV__ = true;
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    expect(loadClient().isDemo).toBe(false);
  });

  it('uses the real client when __DEV__ is false, even with the flag set', () => {
    process.env.EXPO_PUBLIC_DEMO_DATA = '1';
    (global as { __DEV__?: boolean }).__DEV__ = false;
    expect(loadClient().isDemo).toBe(false);
  });
});
