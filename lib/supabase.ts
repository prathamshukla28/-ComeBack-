import 'react-native-url-polyfill/auto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { demoDataEnabled } from './demo';
import { createDemoSupabase } from './demo-data';
import { encryptedSessionStorage } from './sessionStorage';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

function createRealClient(): SupabaseClient {
  if (!url || !anon) {
    // Fail LOUD in dev, we want the user to notice they forgot .env
    console.warn(
      '[ComeBack] Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY.\n' +
        'Create a .env file in the project root — see SETUP.md step 4.',
    );
  }

  return createClient(url ?? 'https://placeholder.supabase.co', anon ?? 'placeholder', {
    auth: {
      // Session blob encrypted at rest; key in the OS keychain (see sessionStorage.ts).
      storage: encryptedSessionStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false, // RN has no URL to detect
    },
  });
}

// Dev-only demo-data mode (EXPO_PUBLIC_DEMO_DATA=1, see ./demo) swaps in an
// in-memory client seeded with sample rows; inert in production builds.
export const supabase: SupabaseClient = demoDataEnabled()
  ? createDemoSupabase()
  : createRealClient();
