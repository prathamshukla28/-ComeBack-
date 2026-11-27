import React from 'react';
import { Text } from 'react-native';
import { render, waitFor } from '@testing-library/react-native';
import { SubscriptionProvider, useIsPro, useSubscription } from '../subscription';

jest.mock('../auth', () => ({ useAuth: () => ({ session: { user: { id: 'u1' } } }) }));

const mockDemo = jest.fn(() => false);
jest.mock('../demo', () => ({ demoProEnabled: () => mockDemo() }));

const mockPurchases = {
  available: false,
  info: null as unknown,
};
jest.mock('../purchases', () => ({
  purchasesAvailable: () => mockPurchases.available,
  configurePurchases: jest.fn(async () => mockPurchases.info),
  getProPackages: jest.fn(async () => []),
  hasProEntitlement: (info: any) => Boolean(info?.entitlements?.active?.pro),
  onCustomerInfo: () => () => {},
  purchasePackage: jest.fn(async () => ({ isPro: true })),
  restorePurchases: jest.fn(async () => ({ isPro: false })),
}));

function Probe() {
  const { isPro, demoMode, loading } = useSubscription();
  return (
    <Text testID="probe">{JSON.stringify({ isPro, demoMode, loading, quick: useIsPro() })}</Text>
  );
}

const state = (getByTestId: (id: string) => { props: { children: string } }) =>
  JSON.parse(getByTestId('probe').props.children);

beforeEach(() => {
  mockDemo.mockReturnValue(false);
  mockPurchases.available = false;
  mockPurchases.info = null;
});

describe('SubscriptionProvider', () => {
  it('is not Pro when billing is unavailable and demo mode is off', async () => {
    const { getByTestId } = render(
      <SubscriptionProvider>
        <Probe />
      </SubscriptionProvider>,
    );
    await waitFor(() => expect(state(getByTestId).loading).toBe(false));
    expect(state(getByTestId)).toEqual({
      isPro: false,
      demoMode: false,
      loading: false,
      quick: false,
    });
  });

  it('dev demo mode unlocks Pro on the client and says so', async () => {
    mockDemo.mockReturnValue(true);
    const { getByTestId } = render(
      <SubscriptionProvider>
        <Probe />
      </SubscriptionProvider>,
    );
    await waitFor(() => expect(state(getByTestId).loading).toBe(false));
    expect(state(getByTestId)).toMatchObject({ isPro: true, demoMode: true, quick: true });
  });

  it('reflects a real RevenueCat entitlement when billing is available', async () => {
    mockPurchases.available = true;
    mockPurchases.info = { entitlements: { active: { pro: {} } } };
    const { getByTestId } = render(
      <SubscriptionProvider>
        <Probe />
      </SubscriptionProvider>,
    );
    await waitFor(() => expect(state(getByTestId).isPro).toBe(true));
    expect(state(getByTestId).demoMode).toBe(false);
  });

  it('useSubscription throws outside the provider', () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/inside <SubscriptionProvider>/);
    err.mockRestore();
  });
});
