/**
 * Dev-only "demo Pro" switch, so the Pro-gated Life Coach can be shown in a demo
 * or screen recording without a RevenueCat sandbox purchase.
 *
 *   EXPO_PUBLIC_DEMO_PRO=1 npx expo start
 *
 * It is impossible to turn on in a production build, by three independent guards:
 *   - `__DEV__` is `false` in every release bundle (Metro sets it per build mode);
 *   - `process.env.NODE_ENV` is inlined as "production" by babel-preset-expo in
 *     release bundles, so the minifier drops the branch entirely;
 *   - the flag must be exactly "1".
 *
 * It only flips the CLIENT's view of Pro. Server-side Pro checks (the RAG service,
 * see rag/app/entitlements.py) are unaffected: demo mode never gets paid server
 * resources; Pro features that need the server fall back to the direct path.
 */
export function demoProEnabled(
  flag: string | undefined = process.env.EXPO_PUBLIC_DEMO_PRO,
  isDev: boolean = typeof __DEV__ !== 'undefined' && __DEV__,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  if (nodeEnv === 'production') return false;
  return isDev === true && flag === '1';
}
