import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { Button } from '../ui';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

describe('Button', () => {
  it('renders its title and is reachable by accessibility role + label', () => {
    const { getByRole } = render(<Button title="Log set" onPress={() => {}} />);
    expect(getByRole('button', { name: 'Log set' })).toBeTruthy();
  });

  it('fires onPress when tapped', () => {
    const onPress = jest.fn();
    const { getByRole } = render(<Button title="Save PIN" onPress={onPress} />);
    fireEvent.press(getByRole('button', { name: 'Save PIN' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire onPress while loading', () => {
    const onPress = jest.fn();
    const { getByRole } = render(<Button title="Unlock" loading onPress={onPress} />);
    fireEvent.press(getByRole('button', { name: 'Unlock' }));
    expect(onPress).not.toHaveBeenCalled();
  });
});
