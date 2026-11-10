import { Alert, Platform, type AlertButton } from 'react-native';

/**
 * Cross-platform `Alert.alert`.
 *
 * react-native-web implements `Alert.alert` as a no-op, so on web every message
 * (a new PR, a failed save, "wrong PIN") would silently vanish. Native keeps the
 * real Alert; web maps it onto the browser's own dialogs:
 *   - no buttons, or one: `window.alert`, then that button's `onPress`;
 *   - several: `window.confirm`; OK runs the first non-cancel button, Cancel runs
 *     the cancel button (if any).
 */
export function notify(
  title: string,
  message?: string,
  buttons?: AlertButton[],
  os: string = Platform.OS,
): void {
  if (os !== 'web') {
    Alert.alert(title, message, buttons);
    return;
  }
  // Nothing to show while static web output renders in Node.
  if (typeof window === 'undefined') return;

  const text = message ? `${title}\n\n${message}` : title;
  if (!buttons || buttons.length <= 1) {
    window.alert(text);
    buttons?.[0]?.onPress?.();
    return;
  }
  const confirmed = window.confirm(text);
  const chosen = confirmed
    ? buttons.find((b) => b.style !== 'cancel')
    : buttons.find((b) => b.style === 'cancel');
  chosen?.onPress?.();
}
