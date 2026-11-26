"""Safety guardrails for every Gemini call the RAG service makes.

A byte-identical mirror of the app's lib/safety.ts — the preamble, the crisis
resources and the self-harm patterns. tests/test_safety.py parses lib/safety.ts and
fails if the two ever drift, so the app and the service behave the same way.

The service can be called without the app (any Pro user with a token can POST to
/rag/coach), so it cannot rely on the app's client-side crisis gate: a message that
signals self-harm is answered with vetted human resources and never reaches Gemini.
"""

from __future__ import annotations

import re

CRISIS_RESOURCES = """I'm really glad you told me this, and I want to make sure you're not carrying it alone.

I'm an app, not a therapist — but trained humans are available right now and you deserve to talk to one:

• US — call or text 988 (Suicide & Crisis Lifeline), 24/7
• US — text HOME to 741741 (Crisis Text Line)
• UK & Ireland — call 116 123 (Samaritans)
• Anywhere — https://findahelpline.com

If you're in immediate danger, please call your local emergency number. I'll be right here when you're ready to keep going. 💛"""

# Appended to every system prompt (app/prompts.py SYSTEM_BY_THREAD).
SAFETY_PREAMBLE = """
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
---"""

# Deliberately high-recall: a false positive costs one extra set of hotline numbers;
# a false negative is the failure mode we refuse to accept.
SELF_HARM_PATTERNS: tuple[str, ...] = (
    r"\bkill(?:ing)?\s+my\s?self\b",
    r"\b(?:end|ending)\s+(?:my|it)\s+(?:life|all)\b",
    r"\bsuicid(?:e|al)\b",
    r"\b(?:want|wanna|going|ready)\s+to\s+die\b",
    r"\bdon'?t\s+want\s+to\s+(?:live|be here|exist|wake up)\b",
    r"\bself[-\s]?harm(?:ing)?\b",
    r"\bcut(?:ting)?\s+my\s?self\b",
    r"\bharm(?:ing)?\s+my\s?self\b",
    r"\bhurt(?:ing)?\s+my\s?self\b",
    r"\bno\s+reason\s+to\s+(?:live|go on|keep going)\b",
    r"\b(?:better off|everyone.{0,12}better)\s+(?:dead|without me|if i was gone)\b",
    r"\btake\s+my\s+own\s+life\b",
)

_COMPILED = tuple(re.compile(p, re.IGNORECASE) for p in SELF_HARM_PATTERNS)


def detect_crisis(text: str) -> bool:
    """True when a message signals self-harm or suicidal ideation. Pure + offline."""
    return bool(text) and any(p.search(text) for p in _COMPILED)
