import { Chat } from '@/components/Chat';
import { askGuruGrounded, buildGuruSystemPrompt } from '@/lib/guru-prompt';
import { ragEnabled } from '@/lib/rag';
import { useSubscription } from '@/lib/subscription';

export default function Guru() {
  const { isPro } = useSubscription();
  return (
    <Chat
      config={{
        thread: 'guru',
        title: 'Fitness Guru',
        subtitle: 'Your no-BS personal trainer',
        // Pro + RAG service configured: retrieve curated exercise knowledge + the
        // user's own history server-side instead of dumping the last 30 days.
        ask: isPro && ragEnabled() ? askGuruGrounded : undefined,
        systemPrompt: buildGuruSystemPrompt,
      }}
    />
  );
}
