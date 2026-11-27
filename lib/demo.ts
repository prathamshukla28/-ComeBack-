/**
 * Dev-only demo switches, so the app can be shown in a demo, screen recording or
 * README screenshot without a RevenueCat sandbox purchase or a Supabase project.
 *
 *   EXPO_PUBLIC_DEMO_PRO=1 npx expo start    # Pro-gated Life Coach unlocked
 *   EXPO_PUBLIC_DEMO_DATA=1 npx expo start   # in-memory sample data, no backend
 *
 * Each is impossible to turn on in a production build, by three independent guards:
 *   - `__DEV__` is `false` in every release bundle (Metro sets it per build mode);
 *   - `process.env.NODE_ENV` is inlined as "production" by babel-preset-expo in
 *     release bundles, so the minifier drops the branch entirely;
 *   - the flag must be exactly "1".
 */
function devOnlyFlag(
  flag: string | undefined,
  isDev: boolean,
  nodeEnv: string | undefined,
): boolean {
  if (nodeEnv === 'production') return false;
  return isDev === true && flag === '1';
}

const isDevBuild = (): boolean => typeof __DEV__ !== 'undefined' && __DEV__;

/**
 * Demo Pro only flips the CLIENT's view of Pro. Server-side Pro checks (the RAG
 * service, see rag/app/entitlements.py) are unaffected: demo mode never gets paid
 * server resources; Pro features that need the server fall back to the direct path.
 */
export function demoProEnabled(
  flag: string | undefined = process.env.EXPO_PUBLIC_DEMO_PRO,
  isDev: boolean = isDevBuild(),
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  return devOnlyFlag(flag, isDev, nodeEnv);
}

/**
 * Demo data swaps the Supabase client for an in-memory stand-in seeded with
 * deterministic sample rows (see ./demo-data), signs in a local demo user and
 * shows a "DEMO DATA" badge on every screen. No network request is made to
 * Supabase; the real screens and the real lib/queries.ts code run on top of it.
 */
export function demoDataEnabled(
  flag: string | undefined = process.env.EXPO_PUBLIC_DEMO_DATA,
  isDev: boolean = isDevBuild(),
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  return devOnlyFlag(flag, isDev, nodeEnv);
}
