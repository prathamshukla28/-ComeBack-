import React from 'react';
import { Platform } from 'react-native';
import { render, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import Intimacy from '@/app/(tabs)/intimacy';

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
  undoLastHabit: jest.fn(),
}));

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
