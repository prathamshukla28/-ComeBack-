import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

/**
 * Auto re-lock for the private tab.
 *
 * Expo Router keeps tab screens mounted, so without this an unlocked private tab
 * would stay unlocked for as long as the process lives. It re-locks:
 *
 *  - as soon as the app leaves the foreground (`inactive` or `background`).
 *    `inactive` matters on iOS: it fires before the app-switcher snapshot is
 *    taken, so the private screen is already replaced by the lock screen there;
 *  - after {@link RELOCK_AFTER_MS} unlocked, even in the foreground (e.g. the user
 *    unlocked it, switched to another tab, and handed the phone over).
 *
 * The biometric prompt itself briefly moves the app to `inactive` on iOS. Callers
 * wrap that prompt in {@link AutoRelock.authenticating} so it is not mistaken for
 * the user leaving the app.
 */

/** How long the private tab may stay unlocked before it locks itself again. */
export const RELOCK_AFTER_MS = 5 * 60_000;

/** True for the AppState transitions that mean "the user left the app". */
export function leavesForeground(state: AppStateStatus): boolean {
  return state === 'background' || state === 'inactive';
}

export interface AutoRelock {
  /** Run `fn` (an OS auth prompt) without its AppState blips re-locking the tab. */
  authenticating<T>(fn: () => Promise<T>): Promise<T>;
}

export function useAutoRelock(
  unlocked: boolean,
  lock: () => void,
  timeoutMs: number = RELOCK_AFTER_MS,
): AutoRelock {
  const lockRef = useRef(lock);
  lockRef.current = lock;
  const authInFlight = useRef(0);

  // Leaving the app always locks, whether or not the tab is currently unlocked, so a
  // half-typed PIN is cleared too.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (leavesForeground(state) && authInFlight.current === 0) lockRef.current();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!unlocked) return;
    const t = setTimeout(() => lockRef.current(), timeoutMs);
    return () => clearTimeout(t);
  }, [unlocked, timeoutMs]);

  const guard = useRef<AutoRelock>({
    async authenticating(fn) {
      authInFlight.current++;
      try {
        return await fn();
      } finally {
        authInFlight.current--;
      }
    },
  });
  return guard.current;
}
