import { getGeminiKey } from './secureStore';

export type ChatRole = 'user' | 'model';
export interface ChatTurn {
  role: ChatRole;
  text: string;
}

const MODEL = 'gemini-2.0-flash';
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

async function callGemini(
  systemPrompt: string,
  history: ChatTurn[],
  userMessage: string,
): Promise<string> {
  const key = await getGeminiKey();
  if (!key) throw new Error('GEMINI_KEY_MISSING');

  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [
      ...history.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
      { role: 'user', parts: [{ text: userMessage }] },
    ],
    generationConfig: { temperature: 0.9, maxOutputTokens: 2048 },
  };

  const res = await fetch(`${BASE}/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `Auth failed (${res.status}). Your API key may be invalid or an AQ. format key not accepted. Create a new key.`,
      );
    }
    if (res.status === 429) throw new Error('Rate limit hit. Free tier: 15 req/min.');
    throw new Error(`Gemini ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? '';
  if (!text) throw new Error('Empty response from Gemini');
  return text.trim();
}

export async function sendMessage(
  systemPrompt: string,
  history: ChatTurn[],
  userMessage: string,
): Promise<string> {
  return callGemini(systemPrompt, history, userMessage);
}

export async function generateOnce(systemPrompt: string, userMessage: string): Promise<string> {
  return callGemini(systemPrompt, [], userMessage);
}
