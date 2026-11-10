import { Alert } from 'react-native';
import { notify } from '../notify';

describe('notify — cross-platform Alert.alert', () => {
  const g = globalThis as { window?: any };
  let savedWindow: unknown;

  beforeEach(() => {
    savedWindow = g.window;
    g.window = { alert: jest.fn(), confirm: jest.fn() };
  });
  afterEach(() => {
    g.window = savedWindow;
    jest.restoreAllMocks();
  });

  it('uses the native Alert off the web', () => {
    const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const buttons = [{ text: 'OK' }];
    notify('🎉 NEW PR', 'Bench Press: 85kg × 5', buttons, 'ios');
    expect(spy).toHaveBeenCalledWith('🎉 NEW PR', 'Bench Press: 85kg × 5', buttons);
    expect(g.window.alert).not.toHaveBeenCalled();
  });

  it('shows a browser alert on web, where Alert.alert is a no-op', () => {
    const spy = jest.spyOn(Alert, 'alert');
    notify('🎉 NEW PR', 'Bench Press: 85kg × 5', undefined, 'web');
    expect(g.window.alert).toHaveBeenCalledWith('🎉 NEW PR\n\nBench Press: 85kg × 5');
    expect(spy).not.toHaveBeenCalled();
  });

  it('runs a single button after the browser alert', () => {
    const onPress = jest.fn();
    notify('Saved', undefined, [{ text: 'OK', onPress }], 'web');
    expect(g.window.alert).toHaveBeenCalledWith('Saved');
    expect(onPress).toHaveBeenCalled();
  });

  it('maps a cancel/confirm pair onto window.confirm', () => {
    const cancel = jest.fn();
    const confirm = jest.fn();
    const buttons = [
      { text: 'Cancel', style: 'cancel' as const, onPress: cancel },
      { text: 'Sign out', style: 'destructive' as const, onPress: confirm },
    ];

    g.window.confirm.mockReturnValueOnce(true);
    notify('Sign out?', '', buttons, 'web');
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();

    g.window.confirm.mockReturnValueOnce(false);
    notify('Sign out?', '', buttons, 'web');
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it('does nothing while static web output renders in Node (no window)', () => {
    delete g.window;
    expect(() => notify('Saved', undefined, undefined, 'web')).not.toThrow();
  });
});

describe('notify — platform default', () => {
  it('follows Platform.OS when no platform is passed', () => {
    const { Platform } = require('react-native');
    const realOS = Platform.OS;
    const g = globalThis as { window?: any };
    const savedWindow = g.window;
    g.window = { alert: jest.fn(), confirm: jest.fn() };
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    try {
      notify('🎉 NEW PR');
      expect(g.window.alert).toHaveBeenCalledWith('🎉 NEW PR');
    } finally {
      Object.defineProperty(Platform, 'OS', { value: realOS, configurable: true });
      g.window = savedWindow;
    }
  });
});
