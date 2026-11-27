import React from 'react';
import { act } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import Intimacy from '@/app/(tabs)/intimacy';
import { notify } from '@/lib/notify';
import { RELOCK_AFTER_MS } from '@/lib/privacy-lock';
import { logHabitResilient } from '@/lib/queries';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(async () => false),
  isEnrolledAsync: jest.fn(async () => false),
  authenticateAsync: jest.fn(async () => ({ success: true })),
}));
// The private content must never render in these tests; stub its data layer.
jest.mock('@/lib/queries', () => ({
  habitCountToday: jest.fn(async () => 0),
  habitLast7Days: jest.fn(async () => []),
  logHabit: jest.fn(),
  logHabitResilient: jest.fn(async () => ({ queued: false })),
  undoLastHabit: jest.fn(),
}));
jest.mock('@/lib/notify', () => ({ notify: jest.fn() }));

describe('Intimacy tab lock', () => {
  const realOS = Platform.OS;
  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: realOS, configurable: true });
    jest.clearAllMocks();
  });

  it('stays locked on web, where there is no keychain, and never asks for the PIN', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    render(<Intimacy />);
    expect(await screen.findByText(/Locked on web/)).toBeTruthy();
    expect(screen.queryByText('Today')).toBeNull();
    expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
    expect(LocalAuthentication.authenticateAsync).not.toHaveBeenCalled();
  });

  it('fails closed on native when the keychain errors, instead of hanging on "Checking…"', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(new Error('keychain'));
    render(<Intimacy />);
    expect(await screen.findByText(/Locked/)).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('Checking…')).toBeNull());
    expect(screen.getByText('Or enter PIN')).toBeTruthy();
  });

  it('asks for a new PIN on native when none is set', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
    render(<Intimacy />);
    expect(await screen.findByText('Set a PIN')).toBeTruthy();
  });
});

/* ---------- re-locking ---------- */

/** Captures AppState listeners so a test can move the app to the background. */
function mockAppState() {
  const listeners = new Set<(s: AppStateStatus) => void>();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, fn) => {
    listeners.add(fn as (s: AppStateStatus) => void);
    return { remove: () => listeners.delete(fn as (s: AppStateStatus) => void) };
  });
  return (state: AppStateStatus) => act(() => listeners.forEach((l) => l(state)));
}

/** A PIN is configured and Face ID succeeds, so the tab unlocks on mount. */
function biometricUnlocks() {
  (SecureStore.getItemAsync as jest.Mock).mockImplementation(async (k: string) =>
    k === 'comeback.intimacy.pinHash' ? 'salt:digest' : null,
  );
  (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(true);
  (LocalAuthentication.isEnrolledAsync as jest.Mock).mockResolvedValue(true);
}

function renderTab() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { gcTime: Infinity },
    },
  });
  return render(
    <QueryClientProvider client={qc}>
      <Intimacy />
    </QueryClientProvider>,
  );
}

describe('Intimacy tab re-locks', () => {
  const realOS = Platform.OS;
  beforeEach(() => {
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
    biometricUnlocks();
  });
  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: realOS, configurable: true });
    (SecureStore.getItemAsync as jest.Mock).mockImplementation(async () => null);
    (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(false);
    (LocalAuthentication.isEnrolledAsync as jest.Mock).mockResolvedValue(false);
    jest.restoreAllMocks();
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it.each(['background', 'inactive'] as const)(
    'locks as soon as the app goes %s',
    async (state) => {
      const setAppState = mockAppState();
      renderTab();
      expect(await screen.findByText('Log +1')).toBeTruthy();

      setAppState(state);

      expect(await screen.findByText('🔒 Locked')).toBeTruthy();
      expect(screen.queryByText('Log +1')).toBeNull();
    },
  );

  it('stays locked when the app comes back; unlocking needs Face ID or the PIN again', async () => {
    const setAppState = mockAppState();
    renderTab();
    expect(await screen.findByText('Log +1')).toBeTruthy();
    setAppState('background');
    setAppState('active');
    expect(await screen.findByText('🔒 Locked')).toBeTruthy();
    expect(screen.queryByText('Log +1')).toBeNull();
  });

  it("is not re-locked by the Face ID prompt's own inactive blip", async () => {
    const setAppState = mockAppState();
    (LocalAuthentication.authenticateAsync as jest.Mock).mockImplementationOnce(async () => {
      setAppState('inactive'); // iOS does this while the system prompt is up
      return { success: true };
    });
    renderTab();
    expect(await screen.findByText('Log +1')).toBeTruthy();
  });

  it('locks itself after the idle timeout even in the foreground', async () => {
    jest.useFakeTimers();
    mockAppState();
    renderTab();
    expect(await screen.findByText('Log +1')).toBeTruthy();
    act(() => jest.advanceTimersByTime(RELOCK_AFTER_MS - 1000));
    expect(screen.getByText('Log +1')).toBeTruthy();
    act(() => jest.advanceTimersByTime(1000));
    expect(await screen.findByText('🔒 Locked')).toBeTruthy();
  });

  it('removes its AppState listener on unmount', async () => {
    mockAppState();
    const view = renderTab();
    expect(await screen.findByText('Log +1')).toBeTruthy();
    const sub = (AppState.addEventListener as jest.Mock).mock.results[0].value;
    const remove = jest.spyOn(sub, 'remove');
    view.unmount();
    expect(remove).toHaveBeenCalled();
  });
});

describe('Intimacy taps offline', () => {
  const realOS = Platform.OS;
  beforeEach(() => {
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
    biometricUnlocks();
    mockAppState();
  });
  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: realOS, configurable: true });
    (SecureStore.getItemAsync as jest.Mock).mockImplementation(async () => null);
    (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(false);
    (LocalAuthentication.isEnrolledAsync as jest.Mock).mockResolvedValue(false);
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('go through the offline-safe outbox path and say when a tap was queued', async () => {
    (logHabitResilient as jest.Mock).mockResolvedValueOnce({ queued: true });
    renderTab();
    fireEvent.press(await screen.findByText('Log +1'));
    await waitFor(() => expect(logHabitResilient).toHaveBeenCalledWith('intimacy', 1));
    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith('Saved offline', 'It will sync when you reconnect.'),
    );
  });
});
