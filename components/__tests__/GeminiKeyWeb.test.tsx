import React from 'react';
import { Platform } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import Settings from '@/app/(tabs)/settings';
import { Chat } from '@/components/Chat';
import { notify } from '@/lib/notify';
import { GEMINI_KEY_WEB_NOTICE } from '@/lib/secureStore';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View> };
});
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/lib/notify', () => ({ notify: jest.fn() }));
jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ session: { user: { email: 'me@example.invalid' } }, signOut: jest.fn() }),
}));
jest.mock('@/lib/subscription', () => ({
  useSubscription: () => ({ isPro: false, restore: jest.fn() }),
}));
jest.mock('@/lib/notifications', () => ({
  clearAllReminders: jest.fn(),
  requestNotificationPermission: jest.fn(),
  scheduleDailyReminders: jest.fn(),
}));
jest.mock('@/lib/queries', () => ({
  loadProfile: jest.fn(async () => null),
  upsertProfile: jest.fn(),
  loadThread: jest.fn(async () => []),
  saveMessage: jest.fn(async () => undefined),
  clearThread: jest.fn(),
}));

function wrap(ui: React.ReactElement) {
  // gcTime: Infinity schedules no garbage-collection timers, so Jest can exit.
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { gcTime: Infinity },
    },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('Gemini key on web (no keychain)', () => {
  const realOS = Platform.OS;
  beforeEach(() => Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true }));
  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: realOS, configurable: true });
    jest.clearAllMocks();
  });

  it('Settings explains key storage is mobile-only and disables Save', async () => {
    wrap(<Settings />);
    expect(await screen.findByText(new RegExp('Gemini key storage is mobile-only'))).toBeTruthy();
    const save = screen.getByRole('button', { name: 'Save key' });
    expect(save.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    fireEvent.press(save);
    expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it('a chat explains why instead of surfacing an unhandled error', async () => {
    wrap(
      <Chat
        config={{ thread: 'coach', title: 'Life Coach', subtitle: 's', systemPrompt: () => 'SYS' }}
      />,
    );
    fireEvent.changeText(await screen.findByPlaceholderText('Message…'), 'hello');
    fireEvent.press(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith('AI chat needs the mobile app', GEMINI_KEY_WEB_NOTICE),
    );
    expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
  });
});
