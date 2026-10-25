import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View> };
});

describe('EnvBanner', () => {
  afterEach(() => jest.resetModules());

  it('renders nothing when the environment is valid', () => {
    jest.doMock('@/lib/env', () => ({ isEnvValid: true }));
    const { EnvBanner } = require('../EnvBanner');
    const { toJSON } = render(<EnvBanner />);
    expect(toJSON()).toBeNull();
  });

  it('surfaces a loud warning when the environment is invalid', () => {
    jest.doMock('@/lib/env', () => ({ isEnvValid: false }));
    const { EnvBanner } = require('../EnvBanner');
    const { getByText, getByRole } = render(<EnvBanner />);
    expect(getByText(/Supabase not configured/i)).toBeTruthy();
    expect(getByRole('alert')).toBeTruthy();
  });
});
