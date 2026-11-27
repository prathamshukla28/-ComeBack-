import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import Settings from '@/app/(tabs)/settings';
import { Paywall } from '@/components/Paywall';
import { proBenefits, proSummary } from '@/lib/pro-benefits';
import { ragEnabled } from '@/lib/rag';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View> };
});
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ session: { user: { email: 'me@example.invalid' } }, signOut: jest.fn() }),
}));
jest.mock('@/lib/subscription', () => ({
  useSubscription: () => ({
    isPro: false,
    restore: jest.fn(),
    purchase: jest.fn(),
    packages: [],
    billingAvailable: false,
  }),
}));
jest.mock('@/lib/notifications', () => ({
  clearAllReminders: jest.fn(),
  requestNotificationPermission: jest.fn(),
  scheduleDailyReminders: jest.fn(),
}));
jest.mock('@/lib/rag', () => ({ ragEnabled: jest.fn(() => false) }));
jest.mock('@/lib/queries', () => ({
  loadProfile: jest.fn(async () => null),
  upsertProfile: jest.fn(),
}));

/** Features that do not exist: nothing caps history or the number of habits. */
const UNTRUE = /full history|unlimited habits|unlimited/i;

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('Pro copy promises only what is gated', () => {
  it('Settings upsell does not promise full history or unlimited habits', async () => {
    wrap(<Settings />);
    const upsell = await screen.findByText(/Unlock the AI Life Coach/);
    expect(upsell.props.children).not.toMatch(UNTRUE);
    expect(screen.queryByText(UNTRUE)).toBeNull();
  });

  it('paywall lists no feature that does not exist', () => {
    wrap(<Paywall />);
    expect(screen.getByText(/AI Life Coach/)).toBeTruthy();
    expect(screen.queryByText(UNTRUE)).toBeNull();
  });

  it('mentions grounded Guru answers only when a RAG service is configured', () => {
    expect(proBenefits(false).join(' ')).not.toMatch(/grounded/i);
    expect(proSummary(false)).not.toMatch(/grounded|RAG/i);
    expect(proBenefits(true).join(' ')).toMatch(/grounded/i);
    expect(proSummary(true)).toMatch(/grounded/i);
    for (const line of [...proBenefits(true), proSummary(true), proSummary(false)]) {
      expect(line).not.toMatch(UNTRUE);
    }
  });

  it('the paywall shows the grounded Guru only when the RAG service is configured', () => {
    const view = wrap(<Paywall />);
    expect(screen.queryByText(/grounded/i)).toBeNull();
    view.unmount();

    (ragEnabled as jest.Mock).mockReturnValue(true);
    wrap(<Paywall />);
    expect(screen.getByText(/grounded/i)).toBeTruthy();
  });
});
