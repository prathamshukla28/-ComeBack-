/**
 * Subscription state for the whole app.
 *
 * Wraps RevenueCat (see `./purchases`) in a React context so any screen can ask
 * "is this user Pro?" via {@link useIsPro}, and the paywall can drive purchases
 * via {@link useSubscription}. Everything degrades gracefully when billing is
 * unavailable (web, Expo Go, tests, or no RevenueCat key) — `isPro` is simply
 * `false` and `billingAvailable` is `false`.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from './auth';
import {
  configurePurchases,
  getProPackages,
  hasProEntitlement,
  onCustomerInfo,
  purchasePackage,
  purchasesAvailable,
  restorePurchases,
} from './purchases';

interface SubscriptionContextValue {
  /** True when the signed-in user has an active Pro entitlement. */
  isPro: boolean;
  /** Still determining entitlement on first load. */
  loading: boolean;
  /** Whether real billing can run here (native SDK + configured key). */
  billingAvailable: boolean;
  /** Purchasable packages from the current RevenueCat offering. */
  packages: any[];
  /** Buy a package; resolves true if it resulted in Pro. */
  purchase: (pkg: any) => Promise<boolean>;
  /** Restore prior purchases; resolves true if Pro was restored. */
  restore: () => Promise<boolean>;
}

const SubscriptionCtx = createContext<SubscriptionContextValue | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user?.id;

  const [isPro, setIsPro] = useState(false);
  const [loading, setLoading] = useState(true);
  const [packages, setPackages] = useState<any[]>([]);
  const billingAvailable = purchasesAvailable();

  useEffect(() => {
    let active = true;

    if (!billingAvailable) {
      setIsPro(false);
      setLoading(false);
      return;
    }

    (async () => {
      const info = await configurePurchases(userId);
      if (!active) return;
      setIsPro(hasProEntitlement(info));
      setLoading(false);
      setPackages(await getProPackages());
    })();

    const unsubscribe = onCustomerInfo((info) => {
      if (active) setIsPro(hasProEntitlement(info));
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [userId, billingAvailable]);

  const value = useMemo<SubscriptionContextValue>(
    () => ({
      isPro,
      loading,
      billingAvailable,
      packages,
      purchase: async (pkg) => {
        const { isPro: nowPro } = await purchasePackage(pkg);
        if (nowPro) setIsPro(true);
        return nowPro;
      },
      restore: async () => {
        const { isPro: nowPro } = await restorePurchases();
        setIsPro(nowPro);
        return nowPro;
      },
    }),
    [isPro, loading, billingAvailable, packages],
  );

  return <SubscriptionCtx.Provider value={value}>{children}</SubscriptionCtx.Provider>;
}

export function useSubscription(): SubscriptionContextValue {
  const ctx = useContext(SubscriptionCtx);
  if (!ctx) throw new Error('useSubscription must be used inside <SubscriptionProvider>');
  return ctx;
}

/** Convenience hook: just the boolean. */
export function useIsPro(): boolean {
  return useSubscription().isPro;
}
