import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Alert, Linking, View } from 'react-native';
import { Button, Card, H1, H2, Input, P, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { clearAllReminders, requestNotificationPermission, scheduleDailyReminders } from '@/lib/notifications';
import { loadProfile, upsertProfile } from '@/lib/queries';
import { clearGeminiKey, getGeminiKey, saveGeminiKey } from '@/lib/secureStore';

export default function Settings() {
  const { session, signOut } = useAuth();
  const qc = useQueryClient();
  const profile = useQuery({ queryKey: ['profile'], queryFn: loadProfile });

  const [name, setName] = useState('');
  const [goals, setGoals] = useState('');
  const [bio, setBio] = useState('');
  const [height, setHeight] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [hasKey, setHasKey] = useState(false);

  useEffect(() => {
    if (profile.data) {
      setName(profile.data.display_name ?? '');
      setGoals(profile.data.goals ?? '');
      setBio(profile.data.bio ?? '');
      setHeight(profile.data.height_cm ? String(profile.data.height_cm) : '');
    }
  }, [profile.data]);

  useEffect(() => {
    getGeminiKey().then((k) => setHasKey(!!k));
  }, []);

  const saveProfile = useMutation({
    mutationFn: async () => {
      await upsertProfile({
        display_name: name || null,
        goals: goals || null,
        bio: bio || null,
        height_cm: height ? parseFloat(height) : null,
        units: 'metric',
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile'] });
      Alert.alert('Saved');
    },
    onError: (e: any) => Alert.alert('Save failed', e.message),
  });

  const onSaveKey = async () => {
    const trimmed = geminiKey.trim();
    if (!trimmed) return Alert.alert('Paste your key first');
    if (trimmed.length < 20) return Alert.alert('Key looks too short', 'Double-check you copied the whole key.');
    await saveGeminiKey(trimmed);
    setGeminiKey('');
    setHasKey(true);
    Alert.alert('Saved', 'Key stored securely on this device only. If the chat says "authentication failed", the key format is wrong — generate a new one at aistudio.google.com/apikey.');
  };

  const onClearKey = async () => {
    await clearGeminiKey();
    setHasKey(false);
    Alert.alert('Key removed');
  };

  return (
    <Screen>
      <H1>Settings</H1>
      <P muted>{session?.user.email}</P>
      <View style={{ height: 20 }} />

      <Card>
        <H2>About you</H2>
        <P muted>Feeds both AI chats so they actually know you.</P>
        <View style={{ height: 12 }} />
        <Input label="Display name" value={name} onChangeText={setName} placeholder="What should I call you?" />
        <Input label="Height (cm)" value={height} onChangeText={setHeight} keyboardType="decimal-pad" />
        <Input label="Fitness goals" value={goals} onChangeText={setGoals} placeholder="e.g. lean bulk to 80kg, bench 100kg" />
        <Input
          label="Bio (for Life Coach)"
          value={bio}
          onChangeText={setBio}
          placeholder="A few lines about who you are, what matters to you…"
          multiline
          numberOfLines={4}
          style={{ height: 100, textAlignVertical: 'top', paddingTop: 12 }}
        />
        <Button title="Save profile" onPress={() => saveProfile.mutate()} loading={saveProfile.isPending} />
      </Card>

      <Card>
        <H2>Gemini API key</H2>
        <P muted>
          Needed for Fitness Guru + Life Coach. Stored encrypted on THIS device only — never sent to Supabase.
        </P>
        <View style={{ height: 8 }} />
        <P muted style={{ fontSize: 13 }}>
          {hasKey ? '✅ Key is set' : '⚠️ No key yet — AI chats will not work'}
        </P>
        <View style={{ height: 12 }} />
        <Input
          label="Paste key (starts with AIza…)"
          value={geminiKey}
          onChangeText={setGeminiKey}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button title="Save key" onPress={onSaveKey} style={{ flex: 1 }} />
          {hasKey && <Button title="Remove" variant="danger" onPress={onClearKey} style={{ flex: 1 }} />}
        </View>
        <View style={{ height: 8 }} />
        <Button
          title="Get a free key ↗"
          variant="ghost"
          onPress={() => Linking.openURL('https://aistudio.google.com/apikey')}
        />
      </Card>

      <Card>
        <H2>Daily reminders</H2>
        <P muted>
          4 daily nudges: morning weigh-in, midday check, gym window, evening wrap-up. Turn on to stay honest.
        </P>
        <View style={{ height: 12 }} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button
            title="Turn on reminders"
            icon="bell.fill"
            style={{ flex: 1 }}
            onPress={async () => {
              const ok = await requestNotificationPermission();
              if (!ok) return Alert.alert('Permission denied', 'Enable notifications for ComeBack in iOS Settings.');
              const n = await scheduleDailyReminders();
              Alert.alert('Done', `${n} daily reminders scheduled.`);
            }}
          />
          <Button
            title="Turn off"
            variant="secondary"
            style={{ flex: 1 }}
            onPress={async () => {
              await clearAllReminders();
              Alert.alert('Reminders off');
            }}
          />
        </View>
      </Card>

      <Card>
        <H2>Account</H2>
        <Button
          title="Sign out"
          variant="danger"
          icon="rectangle.portrait.and.arrow.right"
          onPress={() =>
            Alert.alert('Sign out?', '', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
            ])
          }
        />
      </Card>

      <P muted style={{ textAlign: 'center', fontSize: 12, marginTop: 8 }}>
        ComeBack · v0.1 · Built for the long game
      </P>
    </Screen>
  );
}
