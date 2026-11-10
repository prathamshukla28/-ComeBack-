import { ActivityIndicator, Text, View } from 'react-native';
import { Chat } from '@/components/Chat';
import { Paywall } from '@/components/Paywall';
import { buildCoachSystemPrompt, extractMemory } from '@/lib/coach-prompt';
import { useSubscription } from '@/lib/subscription';

export default function Coach() {
  const { isPro, demoMode, loading } = useSubscription();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!isPro) {
    return <Paywall feature="the Life Coach" />;
  }

  return (
    <View style={{ flex: 1 }}>
      {demoMode && (
        <Text
          accessibilityRole="text"
          style={{
            backgroundColor: '#F59E0B',
            color: '#111',
            textAlign: 'center',
            fontSize: 12,
            fontWeight: '700',
            paddingVertical: 4,
          }}
        >
          DEMO PRO — dev build only (EXPO_PUBLIC_DEMO_PRO)
        </Text>
      )}
      <Chat
        config={{
          thread: 'coach',
          title: 'Life Coach',
          subtitle: 'Remembers you. Grows with you.',
          systemPrompt: buildCoachSystemPrompt,
          onAfterReply: extractMemory,
        }}
      />
    </View>
  );
}
