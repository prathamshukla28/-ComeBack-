import { router } from 'expo-router';
import { Paywall } from '@/components/Paywall';

/** Standalone, modally-presented paywall — open with `router.push('/paywall')`. */
export default function PaywallScreen() {
  return <Paywall feature="ComeBack Pro" onClose={() => router.back()} />;
}
