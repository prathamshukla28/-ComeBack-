describe('env module', () => {
  const ORIGINAL = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL };
    jest.resetModules();
  });

  it('marks env as valid when required vars are present', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'a'.repeat(40);
    jest.isolateModules(() => {
      const { env, isEnvValid } = require('../env');
      expect(isEnvValid).toBe(true);
      expect(env.EXPO_PUBLIC_SUPABASE_URL).toBe('https://example.supabase.co');
    });
  });

  it('falls back to placeholders and marks env invalid when vars are missing', () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    jest.isolateModules(() => {
      const { env, isEnvValid } = require('../env');
      expect(isEnvValid).toBe(false);
      expect(env.EXPO_PUBLIC_SUPABASE_URL).toContain('placeholder');
    });
  });
});
