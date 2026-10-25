import { BASE_LOCK_MS, FREE_ATTEMPTS, computeLockout } from '../pin';

const NOW = 1_700_000_000_000;

describe('computeLockout', () => {
  it('allows the free attempts without locking', () => {
    for (let prev = 0; prev < FREE_ATTEMPTS - 1; prev++) {
      const d = computeLockout(prev, NOW);
      expect(d.lockedUntil).toBe(0);
      expect(d.next.lockedUntil).toBe(0);
      expect(d.attemptsLeft).toBe(FREE_ATTEMPTS - (prev + 1));
    }
  });

  it('locks for the base duration on the first over-limit failure', () => {
    const d = computeLockout(FREE_ATTEMPTS - 1, NOW); // this failure hits the limit
    expect(d.next.attempts).toBe(FREE_ATTEMPTS);
    expect(d.lockedUntil).toBe(NOW + BASE_LOCK_MS);
    expect(d.attemptsLeft).toBe(0);
  });

  it('doubles the lockout for each subsequent failure', () => {
    expect(computeLockout(FREE_ATTEMPTS, NOW).lockedUntil).toBe(NOW + BASE_LOCK_MS * 2);
    expect(computeLockout(FREE_ATTEMPTS + 1, NOW).lockedUntil).toBe(NOW + BASE_LOCK_MS * 4);
  });

  it('caps the lockout at one hour', () => {
    const d = computeLockout(FREE_ATTEMPTS + 20, NOW);
    expect(d.lockedUntil - NOW).toBe(60 * 60_000);
  });
});
