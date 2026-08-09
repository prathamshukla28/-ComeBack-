import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { sendMessage, type ChatTurn } from '@/lib/gemini';
import { clearThread, loadThread, saveMessage, type ChatThread } from '@/lib/queries';
import { useTheme } from '@/lib/theme';

export interface ChatConfig {
  thread: ChatThread;
  title: string;
  subtitle: string;
  systemPrompt: () => Promise<string> | string;
  /** Called after each assistant reply, e.g. to extract long-term memory */
  onAfterReply?: (userMessage: string, modelReply: string) => void | Promise<void>;
}

export function Chat({ config }: { config: ChatConfig }) {
  const { c, brand } = useTheme();
  const qc = useQueryClient();
  const listRef = useRef<FlatList>(null);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);

  const history = useQuery({ queryKey: ['chat', config.thread], queryFn: () => loadThread(config.thread) });

  useEffect(() => {
    if (history.data?.length) setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 100);
  }, [history.data?.length]);

  const send = useMutation({
    mutationFn: async (text: string) => {
      await saveMessage(config.thread, 'user', text);
      qc.invalidateQueries({ queryKey: ['chat', config.thread] });
      setThinking(true);
      try {
        const sys = await config.systemPrompt();
        const turns: ChatTurn[] = (history.data ?? []).map((m: any) => ({
          role: m.role === 'user' ? 'user' : 'model',
          text: m.content,
        }));
        const reply = await sendMessage(sys, turns, text);
        await saveMessage(config.thread, 'model', reply);
        // fire-and-forget post-reply hook
        if (config.onAfterReply) {
          Promise.resolve(config.onAfterReply(text, reply)).catch((e) => console.warn('onAfterReply', e));
        }
        return reply;
      } finally {
        setThinking(false);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['chat', config.thread] }),
    onError: (e: any) => {
      const msg = e?.message === 'GEMINI_KEY_MISSING' ? 'Paste your Gemini API key in Settings first.' : e?.message ?? 'Something went wrong';
      Alert.alert('Gemini error', msg);
    },
  });

  const submit = () => {
    const t = input.trim();
    if (!t || send.isPending) return;
    setInput('');
    send.mutate(t);
  };

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: c.background }}>
      <View style={[styles.header, { borderColor: c.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: c.text }]}>{config.title}</Text>
          <Text style={[styles.subtitle, { color: c.textMuted }]}>{config.subtitle}</Text>
        </View>
        <Pressable
          onPress={() =>
            Alert.alert('Clear conversation?', 'This deletes all messages in this chat.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Clear',
                style: 'destructive',
                onPress: async () => {
                  await clearThread(config.thread);
                  qc.invalidateQueries({ queryKey: ['chat', config.thread] });
                },
              },
            ])
          }
        >
          <SymbolView name="trash" tintColor={c.textMuted} size={20} />
        </Pressable>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90} style={{ flex: 1 }}>
        <FlatList
          ref={listRef}
          data={history.data ?? []}
          keyExtractor={(m: any) => m.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
          ListEmptyComponent={
            <View style={{ padding: 32, alignItems: 'center' }}>
              <SymbolView name="bubble.left.and.bubble.right.fill" tintColor={c.textMuted} size={40} />
              <Text style={[styles.subtitle, { color: c.textMuted, textAlign: 'center', marginTop: 12 }]}>
                Say hi. I have context on your recent workouts, habits, and profile.
              </Text>
            </View>
          }
          renderItem={({ item }: any) => {
            const mine = item.role === 'user';
            return (
              <View
                style={[
                  styles.bubble,
                  {
                    alignSelf: mine ? 'flex-end' : 'flex-start',
                    backgroundColor: mine ? brand : c.card,
                    borderColor: c.border,
                    borderWidth: mine ? 0 : 1,
                  },
                ]}
              >
                <Text style={{ color: mine ? '#fff' : c.text, fontSize: 15, lineHeight: 22 }}>{item.content}</Text>
              </View>
            );
          }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        />

        {thinking && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 6 }}>
            <ActivityIndicator size="small" color={brand} />
            <Text style={{ color: c.textMuted, fontSize: 13 }}>Thinking…</Text>
          </View>
        )}

        <View style={[styles.inputRow, { borderColor: c.border, backgroundColor: c.card }]}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Message…"
            placeholderTextColor={c.textMuted}
            multiline
            style={[styles.input, { color: c.text }]}
            editable={!send.isPending}
          />
          <Pressable
            onPress={submit}
            disabled={!input.trim() || send.isPending}
            style={({ pressed }) => ({
              backgroundColor: brand,
              opacity: !input.trim() || pressed || send.isPending ? 0.6 : 1,
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: 'center',
              justifyContent: 'center',
            })}
          >
            <SymbolView name="arrow.up" tintColor="#fff" size={18} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1 },
  title: { fontSize: 22, fontWeight: '800' },
  subtitle: { fontSize: 13, marginTop: 2 },
  bubble: { maxWidth: '82%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1 },
  input: { flex: 1, fontSize: 16, maxHeight: 120, paddingVertical: 8, paddingHorizontal: 4 },
});
