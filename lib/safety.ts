/**
 * Coach safety guardrails.
 *
 * ComeBack's journal tracks addiction-adjacent data (alcohol, cigarettes) and
 * the coach is a confidant people turn to when they're struggling. That makes a
 * crisis response a feature, not a nicety: if a message signals self-harm we
 * short-circuit the LLM entirely and hand back vetted human resources rather
 * than risk a model improvising around suicidal ideation.
 *
 * `detectCrisis` is a pure function so it is unit-testable and runs on-device
 * with zero network cost before any prompt leaves the phone.
 */

export const CRISIS_RESOURCES = `I'm really glad you told me this, and I want to make sure you're not carrying it alone.

I'm an app, not a therapist — but trained humans are available right now and you deserve to talk to one:

• US — call or text 988 (Suicide & Crisis Lifeline), 24/7
• US — text HOME to 741741 (Crisis Text Line)
• UK & Ireland — call 116 123 (Samaritans)
• Anywhere — https://findahelpline.com

If you're in immediate danger, please call your local emergency number. I'll be right here when you're ready to keep going. 💛`;

/**
 * Hard rules appended to every coach/guru system prompt. Belt-and-suspenders:
 * `detectCrisis` catches the clear cases client-side; this keeps the model in
 * bounds for everything that slips past a regex.
 */
export const SAFETY_PREAMBLE = `
--- Non-negotiable safety rules ---
- You are a wellness companion, NOT a doctor, therapist, or crisis service.
- Never diagnose, never prescribe or adjust medication, never give dosing advice.
- If the user mentions suicide, self-harm, or wanting to die: do not counsel or
  explore it yourself. Respond with warmth and immediately point them to 988 (US),
  the Samaritans (116 123 UK/IE), or https://findahelpline.com, and urge them to
  reach a professional or emergency services.
- Never encourage relapse, bingeing, purging, extreme restriction, or any
  self-harming behaviour. For substances, favour harm-reduction and professional
  help over judgement — never glamorise use.
- Stay in your lane: motivation, reflection, and habit support. Decline clearly
  and redirect to a professional when a request is outside it.
---`;

/**
 * Self-harm / suicidal-ideation signals. Deliberately high-recall: a false
 * positive costs one extra set of hotline numbers; a false negative is the
 * failure mode we refuse to accept.
 */
const SELF_HARM_PATTERNS: RegExp[] = [
  /\bkill(?:ing)?\s+my\s?self\b/i,
  /\b(?:end|ending)\s+(?:my|it)\s+(?:life|all)\b/i,
  /\bsuicid(?:e|al)\b/i,
  /\b(?:want|wanna|going|ready)\s+to\s+die\b/i,
  /\bdon'?t\s+want\s+to\s+(?:live|be here|exist|wake up)\b/i,
  /\bself[-\s]?harm(?:ing)?\b/i,
  /\bcut(?:ting)?\s+my\s?self\b/i,
  /\bharm(?:ing)?\s+my\s?self\b/i,
  /\bhurt(?:ing)?\s+my\s?self\b/i,
  /\bno\s+reason\s+to\s+(?:live|go on|keep going)\b/i,
  /\b(?:better off|everyone.{0,12}better)\s+(?:dead|without me|if i was gone)\b/i,
  /\btake\s+my\s+own\s+life\b/i,
];

/** True when a message signals self-harm or suicidal ideation. Pure + offline. */
export function detectCrisis(text: string): boolean {
  if (!text) return false;
  return SELF_HARM_PATTERNS.some((re) => re.test(text));
}
