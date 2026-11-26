/**
 * What ComeBack Pro actually unlocks — the single source for the paywall list and
 * the Settings upsell, so neither can promise a feature that doesn't exist.
 * Keep in sync with docs/MONETIZATION.md → "What's gated".
 *
 * Gated today: the Life Coach tab (app/(tabs)/coach.tsx), and — only when a RAG
 * service is configured (EXPO_PUBLIC_RAG_URL) — grounded Fitness Guru answers.
 * Logging, history, streaks, trends and the direct Guru are free and unlimited.
 */
import { ragEnabled } from './rag';

const COACH = 'AI Life Coach — it remembers you and grows with you';
const GROUNDED_GURU = 'Fitness Guru grounded in a curated exercise library and your own history';
const SUPPORT = 'Supports an independent, privacy-first app — your data stays yours';

/** Paywall bullet points. The grounded Guru is listed only when it can be delivered. */
export function proBenefits(rag: boolean = ragEnabled()): string[] {
  return rag ? [COACH, GROUNDED_GURU, SUPPORT] : [COACH, SUPPORT];
}

/** One-line upsell for Settings. */
export function proSummary(rag: boolean = ragEnabled()): string {
  return rag
    ? 'Unlock the AI Life Coach and Fitness Guru answers grounded in a curated exercise library and your own history.'
    : 'Unlock the AI Life Coach — it remembers you and grows with you.';
}
