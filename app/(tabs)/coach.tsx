import { Chat } from '@/components/Chat';
import { generateOnce } from '@/lib/gemini';
import { last30dContext, loadCoachMemory, loadProfile, upsertMemory } from '@/lib/queries';

const SYSTEM_BASE = `You are the LIFE COACH inside "ComeBack" — a warm, wise, deeply personal confidant.

Style:
- Empathetic, thoughtful, unhurried. Ask a question back when it deepens understanding.
- Zero preachy filler. Zero "as an AI" disclaimers.
- Remember what the user tells you. Reference past facts naturally.

Job:
- Mental health check-ins, life decisions, relationships, stress, habits.
- Notice patterns across their tracked data (workouts, cigs, alcohol, intimacy) and gently reflect them back.
- Celebrate wins. Sit with losses. Never moralize.

Rules:
- NEVER give medical or crisis advice. If the user shows signs of self-harm, tell them to contact a crisis line (988 in US) and a professional.`;

const MEMORY_EXTRACTOR_PROMPT = `You extract durable long-term facts about the user from a single chat exchange.

Rules:
- Return AT MOST 3 facts.
- Each fact = one line: KEY: VALUE
- KEY is short snake_case (e.g. dads_health, work_stress_source, relationship_status).
- Skip trivial or temporary facts (mood right now, one-off events).
- If nothing important, return exactly: NONE

Example:
work_stress_source: pressure from new manager Sarah
sister_wedding: happening June 2026
quit_smoking_attempt_1: started Jan 3, lasted 4 days`;

async function extractMemory(userMsg: string, reply: string) {
  try {
    const raw = await generateOnce(
      MEMORY_EXTRACTOR_PROMPT,
      `USER SAID:\n${userMsg}\n\nCOACH REPLIED:\n${reply}\n\nExtract facts.`,
    );
    if (!raw || raw.trim().toUpperCase().startsWith('NONE')) return;
    const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      const idx = line.indexOf(':');
      if (idx < 3) continue;
      const key = line.slice(0, idx).trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      const value = line.slice(idx + 1).trim();
      if (!key || !value) continue;
      await upsertMemory(key, value);
    }
  } catch (e) {
    console.warn('extractMemory failed', e);
  }
}

export default function Coach() {
  return (
    <Chat
      config={{
        thread: 'coach',
        title: 'Life Coach',
        subtitle: 'Remembers you. Grows with you.',
        systemPrompt: async () => {
          const [ctx, profile, mem] = await Promise.all([last30dContext(), loadProfile(), loadCoachMemory()]);
          const memBlock = mem.length ? `\n--- What I remember about you ---\n${mem.map((m) => `- ${m.key}: ${m.value}`).join('\n')}\n---` : '';
          const p = profile
            ? `\n--- Profile ---\nName: ${profile.display_name ?? '—'}\nGoals: ${profile.goals ?? '—'}\nBio: ${profile.bio ?? '—'}\n---`
            : '';
          return `${SYSTEM_BASE}${p}${memBlock}\n\n${ctx}`;
        },
        onAfterReply: extractMemory,
      }}
    />
  );
}
