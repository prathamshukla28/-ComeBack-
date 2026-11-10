import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { demoDataEnabled } from '@/lib/demo';
import { isEnvValid } from '@/lib/env';

/**
 * Loud, unmissable banner when Supabase env vars are missing/invalid.
 *
 * Without this, a misconfigured build silently falls back to a placeholder
 * Supabase client (see lib/supabase.ts) and every query fails with a cryptic
 * network error. Surfacing the real cause up front saves the "why is nothing
 * loading?" debugging spiral.
 *
 * In the dev-only demo-data mode (see lib/demo.ts) no Supabase is needed, so it
 * shows a "DEMO DATA" badge instead, making it obvious every screen is sample data.
 */
export function EnvBanner() {
  if (demoDataEnabled()) {
    return (
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#F59E0B' }}>
        <Text
          accessibilityRole="text"
          style={{
            color: '#111',
            textAlign: 'center',
            fontSize: 12,
            fontWeight: '700',
            paddingVertical: 4,
          }}
        >
          DEMO DATA · sample rows · dev build only
        </Text>
      </SafeAreaView>
    );
  }
  if (isEnvValid) return null;
  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: '#B91C1C' }}>
      <View
        accessible
        accessibilityRole="alert"
        style={{ paddingHorizontal: 16, paddingVertical: 8 }}
      >
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
          ⚠️ Supabase not configured
        </Text>
        <Text style={{ color: '#FEE2E2', fontSize: 12, marginTop: 2 }}>
          Copy .env.example → .env and add your Supabase URL + anon key, then restart. See
          docs/SETUP.md.
        </Text>
      </View>
    </SafeAreaView>
  );
}
