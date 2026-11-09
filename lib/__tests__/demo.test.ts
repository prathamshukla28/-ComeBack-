import { demoProEnabled } from '../demo';

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
