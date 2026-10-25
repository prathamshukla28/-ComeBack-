import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isEnvValid } from '@/lib/env';

/**
 * Loud, unmissable banner when Supabase env vars are missing/invalid.
 *
 * Without this, a misconfigured build silently falls back to a placeholder
 * Supabase client (see lib/supabase.ts) and every query fails with a cryptic
 * network error. Surfacing the real cause up front saves the "why is nothing
 * loading?" debugging spiral.
 */
export function EnvBanner() {
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
