import { Chat } from '@/components/Chat';
import { last30dContext, loadProfile } from '@/lib/queries';
import { askCoach, ragEnabled } from '@/lib/rag';

const SYSTEM_BASE = `You are the FITNESS GURU inside "ComeBack" — a no-BS, high-intensity personal trainer.

Style:
- Direct. Tactical. Short paragraphs.
- Zero preachy filler, zero "as an AI" disclaimers.
- Speak like a Bay Area strength coach: honest, encouraging, evidence-based.
- Metric units (kg, cm).

Job:
- Program advice, form cues, deload calls, warmups, exercise swaps, injury workarounds.
- Read the user's recent data below before answering. Reference specific numbers when useful.
- If user asks about non-fitness stuff, redirect to the Life Coach tab.

Rules:
- NEVER prescribe medical treatment. Refer to a doctor for injuries or medical questions.
- If the user hasn't logged anything, coach them to start logging.`;

export default function Guru() {
  return (
    <Chat
      config={{
        thread: 'guru',
        title: 'Fitness Guru',
        subtitle: 'Your no-BS personal trainer',
        // When the RAG service is configured, retrieve curated exercise knowledge +
        // the user's own history server-side instead of dumping the last 30 days.
        ask: ragEnabled() ? async (text) => (await askCoach('guru', text)).answer : undefined,
        systemPrompt: async () => {
          const [ctx, profile] = await Promise.all([last30dContext(), loadProfile()]);
          const p = profile
            ? `Athlete profile: ${profile.display_name ?? ''}, goals: ${profile.goals ?? '—'}`
            : '';
          return `${SYSTEM_BASE}\n\n${p}\n\n${ctx}`;
        },
      }}
    />
  );
}
