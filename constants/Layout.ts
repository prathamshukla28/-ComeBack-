import { Platform } from 'react-native';

/**
 * Height of the bottom tab bar (app/(tabs)/_layout.tsx). The bar is absolutely
 * positioned, so screens draw underneath it and must keep their own content clear
 * of this much space at the bottom. On iOS it already includes the home-indicator
 * padding.
 */
export function tabBarHeight(os: string = Platform.OS): number {
  return os === 'ios' ? 88 : 68;
}
