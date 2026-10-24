/**
 * Thin wrapper around RevenueCat (`react-native-purchases`).
 *
 * The native SDK only exists in a real dev/production build. In Expo Go, on the
 * web, and under Jest the module is absent — every function here degrades
 * gracefully (no Pro, no crash) so the rest of the app keeps working. The SDK is
 * therefore loaded lazily and defensively, never imported at module scope.
 */
import { Platform } from 'react-native';
import { env } from './env';

/** Entitlement identifier configured in the RevenueCat dashboard. */
export const PRO_ENTITLEMENT = 'pro';

/** Minimal shape of RevenueCat's CustomerInfo — only the part we read. */
export interface CustomerInfoLike {
  entitlements?: { active?: Record<string, unknown> };
}

/**
 * Pure predicate: does this CustomerInfo grant the Pro entitlement?
 * Exported on its own so it can be unit-tested without the native module.
 */
export function hasProEntitlement(info: CustomerInfoLike | null | undefined): boolean {
  return Boolean(info?.entitlements?.active?.[PRO_ENTITLEMENT]);
}

/** The RevenueCat API key for the current platform, or undefined on web/unset. */
export function purchasesApiKey(): string | undefined {
  if (Platform.OS === 'ios') return env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
  if (Platform.OS === 'android') return env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
  return undefined;
}

/** True when a key is configured for this platform (so billing can run). */
export function purchasesConfigured(): boolean {
  return Boolean(purchasesApiKey());
}

/* -------- lazy native SDK load -------- */

let sdk: any = null;
let loadAttempted = false;

function loadSdk(): any {
  if (loadAttempted) return sdk;
  loadAttempted = true;
  try {
    // Loaded inside try/catch so Metro treats it as optional and the app still
    // runs where the native module is unavailable (web, Expo Go, tests).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    sdk = require('react-native-purchases').default ?? null;
  } catch {
    sdk = null;
  }
  return sdk;
}

/** True once the native SDK is present AND a key is configured. */
export function purchasesAvailable(): boolean {
  return purchasesConfigured() && loadSdk() != null;
}

/**
 * Configure the SDK for the signed-in user. Safe to call when billing is
 * unavailable — it simply no-ops. Returns the current CustomerInfo if it could.
 */
export async function configurePurchases(appUserId?: string): Promise<CustomerInfoLike | null> {
  const Purchases = loadSdk();
  const apiKey = purchasesApiKey();
  if (!Purchases || !apiKey) return null;
  try {
    Purchases.configure({ apiKey, appUserID: appUserId ?? null });
    return await Purchases.getCustomerInfo();
  } catch (e) {
    console.warn('[ComeBack] RevenueCat configure failed', e);
    return null;
  }
}

/** Subscribe to customer-info changes. Returns an unsubscribe fn (no-op if N/A). */
export function onCustomerInfo(cb: (info: CustomerInfoLike) => void): () => void {
  const Purchases = loadSdk();
  if (!Purchases) return () => {};
  try {
    Purchases.addCustomerInfoUpdateListener(cb);
    return () => {
      try {
        Purchases.removeCustomerInfoUpdateListener(cb);
      } catch {
        /* older SDKs lack remove — safe to ignore */
      }
    };
  } catch {
    return () => {};
  }
}

/** Current entitlement snapshot. */
export async function getCustomerInfo(): Promise<CustomerInfoLike | null> {
  const Purchases = loadSdk();
  if (!Purchases) return null;
  try {
    return await Purchases.getCustomerInfo();
  } catch {
    return null;
  }
}

/** The default offering's purchasable packages, or [] when unavailable. */
export async function getProPackages(): Promise<any[]> {
  const Purchases = loadSdk();
  if (!Purchases) return [];
  try {
    const offerings = await Purchases.getOfferings();
    return offerings?.current?.availablePackages ?? [];
  } catch (e) {
    console.warn('[ComeBack] getOfferings failed', e);
    return [];
  }
}

/** Buy a package. Resolves to the resulting Pro status. */
export async function purchasePackage(pkg: any): Promise<{ isPro: boolean; cancelled?: boolean }> {
  const Purchases = loadSdk();
  if (!Purchases) return { isPro: false };
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return { isPro: hasProEntitlement(customerInfo) };
  } catch (e: any) {
    if (e?.userCancelled) return { isPro: false, cancelled: true };
    throw e;
  }
}

/** Restore prior purchases (required by App Store review). */
export async function restorePurchases(): Promise<{ isPro: boolean }> {
  const Purchases = loadSdk();
  if (!Purchases) return { isPro: false };
  const info = await Purchases.restorePurchases();
  return { isPro: hasProEntitlement(info) };
}
