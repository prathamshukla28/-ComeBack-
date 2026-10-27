import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { encryptedSessionStorage } from './sessionStorage';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anon) {
  // Fail LOUD in dev, we want the user to notice they forgot .env
  console.warn(
    '[ComeBack] Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY.\n' +
      'Create a .env file in the project root — see SETUP.md step 4.',
  );
}

export const supabase = createClient(
  url ?? 'https://placeholder.supabase.co',
  anon ?? 'placeholder',
  {
    auth: {
      // Session blob encrypted at rest; key in the OS keychain (see sessionStorage.ts).
      storage: encryptedSessionStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false, // RN has no URL to detect
    },
  },
);
