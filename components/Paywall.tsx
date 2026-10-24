import { useState } from 'react';
import { Alert, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { Button, Caption, Card, Eyebrow, H1, P, Screen } from '@/components/ui';
import { useSubscription } from '@/lib/subscription';
import { useTheme } from '@/lib/theme';

const BENEFITS = [
  'Unlimited AI Life Coach — it remembers you and grows with you',
  'RAG-grounded Fitness Guru on your own history',
  'Full stats history & progression charts',
  'Unlimited habits and streaks',
];

function Benefit({ text }: { text: string }) {
  const { c, brand } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 12 }}>
      <SymbolView name="checkmark.seal.fill" tintColor={brand} size={20} />
      <P style={{ flex: 1, color: c.text }}>{text}</P>
    </View>
  );
}

/** Human label + price for a RevenueCat package. */
function packageLabel(pkg: any): { title: string; price: string } {
  const type = String(pkg?.packageType ?? '').toUpperCase();
  const title =
    type === 'ANNUAL'
      ? 'Yearly'
      : type === 'MONTHLY'
        ? 'Monthly'
        : (pkg?.product?.title ?? 'ComeBack Pro');
  return { title, price: pkg?.product?.priceString ?? '' };
}

/**
 * The paywall surface. Shown in place of a Pro-only feature (e.g. the Coach
 * tab) when the user is not subscribed. `feature` names what they're unlocking;
 * `onClose` is optional (used when presented as a modal route).
 */
export function Paywall({
  feature = 'ComeBack Pro',
  onClose,
}: {
  feature?: string;
  onClose?: () => void;
}) {
  const { packages, billingAvailable, purchase, restore } = useSubscription();
  const [busy, setBusy] = useState<string | null>(null);

  const onBuy = async (pkg: any) => {
    setBusy(pkg?.identifier ?? 'buy');
    try {
      const ok = await purchase(pkg);
      if (ok) {
        Alert.alert('Welcome to Pro 🎉', 'Everything is unlocked. Thank you for the support.');
        onClose?.();
      }
    } catch (e: any) {
      Alert.alert('Purchase failed', e?.message ?? 'Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const onRestore = async () => {
    setBusy('restore');
    try {
      const ok = await restore();
      Alert.alert(ok ? 'Restored' : 'Nothing to restore', ok ? 'Your Pro access is back.' : '');
      if (ok) onClose?.();
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <View style={{ height: 12 }} />
      <Eyebrow>ComeBack Pro</Eyebrow>
      <H1>Unlock {feature}</H1>
      <P muted>Go all-in on the comeback. One subscription, every premium feature.</P>
      <View style={{ height: 20 }} />

      <Card elevated>
        {BENEFITS.map((b) => (
          <Benefit key={b} text={b} />
        ))}
      </Card>

      <View style={{ height: 8 }} />

      {billingAvailable && packages.length > 0 ? (
        packages.map((pkg) => {
          const { title, price } = packageLabel(pkg);
          return (
            <Button
              key={pkg?.identifier ?? title}
              title={price ? `${title} — ${price}` : title}
              loading={busy === (pkg?.identifier ?? 'buy')}
              onPress={() => onBuy(pkg)}
              style={{ marginBottom: 10 }}
            />
          );
        })
      ) : (
        <Card>
          <P muted>
            {billingAvailable
              ? 'No subscription plans are published yet. Add products and an offering in the RevenueCat dashboard.'
              : 'In-app purchases run in a native build on iOS or Android. Create a RevenueCat account, add your keys to .env, and build a dev client — see docs/MONETIZATION.md.'}
          </P>
        </Card>
      )}

      {billingAvailable && (
        <Button
          title="Restore purchases"
          variant="ghost"
          loading={busy === 'restore'}
          onPress={onRestore}
        />
      )}

      {onClose && <Button title="Not now" variant="ghost" onPress={onClose} />}

      <Caption style={{ textAlign: 'center', marginTop: 12 }}>
        Billed through the App Store / Google Play. Cancel anytime.
      </Caption>
    </Screen>
  );
}
