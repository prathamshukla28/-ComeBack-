import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import Dashboard from '@/app/(tabs)/index';
import * as queries from '@/lib/queries';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View> };
});
jest.mock('@/lib/queries', () => ({
  cleanStreak: jest.fn(async () => 3),
  ensureTodayWorkout: jest.fn(async () => 'w-created'),
  findTodayWorkout: jest.fn(async () => null),
  habitCountToday: jest.fn(async (kind: string) => (kind === 'intimacy' ? 7 : 0)),
  loadProfile: jest.fn(async () => ({ display_name: 'Sam' })),
  todaySets: jest.fn(async () => []),
  workoutStreak: jest.fn(async () => 0),
}));

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('Today dashboard', () => {
  afterEach(() => jest.clearAllMocks());

  it('never reads or shows the private (intimacy) count — that tab is behind a lock', async () => {
    wrap(<Dashboard />);
    expect(await screen.findByText('Sam')).toBeTruthy();
    expect(await screen.findByText(/Cigarettes/)).toBeTruthy();
    expect(queries.habitCountToday).toHaveBeenCalledWith('cigarette');
    expect(queries.habitCountToday).not.toHaveBeenCalledWith('intimacy');
    expect(screen.queryByText(/Intimacy/i)).toBeNull();
    expect(screen.queryByText('7')).toBeNull();
  });

  it('opening it never creates a workout row (so an unused day cannot join the streak)', async () => {
    wrap(<Dashboard />);
    expect(await screen.findByText('Sam')).toBeTruthy();
    expect(queries.findTodayWorkout).toHaveBeenCalled();
    expect(queries.ensureTodayWorkout).not.toHaveBeenCalled();
  });
});
