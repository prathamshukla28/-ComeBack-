import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { Button, Card, H1, H2, Input, P, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useSubscription } from '@/lib/subscription';
import {
  clearAllReminders,
  requestNotificationPermission,
  scheduleDailyReminders,
} from '@/lib/notifications';
import { loadProfile, upsertProfile } from '@/lib/queries';
import {
  clearGeminiKey,
  GEMINI_KEY_WEB_NOTICE,
  geminiKeyStorageAvailable,
  getGeminiKey,
  saveGeminiKey,
} from '@/lib/secureStore';
import { notify } from '@/lib/notify';

export default function Settings() {
  const { session, signOut } = useAuth();
  const { isPro, restore } = useSubscription();
  const qc = useQueryClient();
  const profile = useQuery({ queryKey: ['profile'], queryFn: loadProfile });

  const [name, setName] = useState('');
  const [goals, setGoals] = useState('');
  const [bio, setBio] = useState('');
  const [height, setHeight] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const keyStorage = geminiKeyStorageAvailable();

  useEffect(() => {
    if (profile.data) {
      setName(profile.data.display_name ?? '');
      setGoals(profile.data.goals ?? '');
      setBio(profile.data.bio ?? '');
      setHeight(profile.data.height_cm ? String(profile.data.height_cm) : '');
    }
  }, [profile.data]);

  useEffect(() => {
    if (!keyStorage) return;
    getGeminiKey()
      .then((k) => setHasKey(!!k))
      .catch((e) => console.warn('[ComeBack] could not read the Gemini key', e));
  }, [keyStorage]);

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
      notify('Saved');
    },
    onError: (e: any) => notify('Save failed', e.message),
  });

  const onSaveKey = async () => {
    if (!keyStorage) return notify('Not available on web', GEMINI_KEY_WEB_NOTICE);
    const trimmed = geminiKey.trim();
    if (!trimmed) return notify('Paste your key first');
    if (trimmed.length < 20)
      return notify('Key looks too short', 'Double-check you copied the whole key.');
    try {
      await saveGeminiKey(trimmed);
    } catch (e: any) {
      return notify('Could not save the key', e?.message ?? 'Please try again.');
    }
    setGeminiKey('');
    setHasKey(true);
    notify(
      'Saved',
      'Key stored securely on this device only. If the chat says "authentication failed", the key format is wrong — generate a new one at aistudio.google.com/apikey.',
    );
  };

  const onClearKey = async () => {
    try {
      await clearGeminiKey();
    } catch (e: any) {
      return notify('Could not remove the key', e?.message ?? 'Please try again.');
    }
    setHasKey(false);
    notify('Key removed');
  };

  return (
    <Screen>
      <H1>Settings</H1>
      <P muted>{session?.user.email}</P>
      <View style={{ height: 20 }} />

      <Card elevated>
        <H2>{isPro ? 'ComeBack Pro ✓' : 'ComeBack Pro'}</H2>
        <P muted>
          {isPro
            ? 'Thanks for your support — every premium feature is unlocked.'
            : 'Unlock the AI Life Coach, RAG-grounded Guru, full history, and unlimited habits.'}
        </P>
        <View style={{ height: 12 }} />
        {isPro ? (
          <Button
            title="Restore purchases"
            variant="secondary"
            onPress={async () => {
              const ok = await restore();
              notify(ok ? 'Restored' : 'Nothing to restore');
            }}
          />
        ) : (
          <Button title="Upgrade to Pro" icon="sparkles" onPress={() => router.push('/paywall')} />
        )}
      </Card>

      <Card>
        <H2>About you</H2>
        <P muted>Feeds both AI chats so they actually know you.</P>
        <View style={{ height: 12 }} />
        <Input
          label="Display name"
          value={name}
          onChangeText={setName}
          placeholder="What should I call you?"
        />
        <Input
          label="Height (cm)"
          value={height}
          onChangeText={setHeight}
          keyboardType="decimal-pad"
        />
        <Input
          label="Fitness goals"
          value={goals}
          onChangeText={setGoals}
          placeholder="e.g. lean bulk to 80kg, bench 100kg"
        />
        <Input
          label="Bio (for Life Coach)"
          value={bio}
          onChangeText={setBio}
          placeholder="A few lines about who you are, what matters to you…"
          multiline
          numberOfLines={4}
          style={{ height: 100, textAlignVertical: 'top', paddingTop: 12 }}
        />
        <Button
          title="Save profile"
          onPress={() => saveProfile.mutate()}
          loading={saveProfile.isPending}
        />
      </Card>

      <Card>
        <H2>Gemini API key</H2>
        <P muted>
          Needed for Fitness Guru + Life Coach. Stored encrypted on THIS device only — never sent to
          Supabase.
        </P>
        <View style={{ height: 8 }} />
        <P muted style={{ fontSize: 13 }}>
          {!keyStorage
            ? `🔒 ${GEMINI_KEY_WEB_NOTICE}`
            : hasKey
              ? '✅ Key is set'
              : '⚠️ No key yet — AI chats will not work'}
        </P>
        <View style={{ height: 12 }} />
        <Input
          label="Paste key (starts with AIza…)"
          value={geminiKey}
          onChangeText={setGeminiKey}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          editable={keyStorage}
        />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button title="Save key" onPress={onSaveKey} disabled={!keyStorage} style={{ flex: 1 }} />
          {hasKey && (
            <Button title="Remove" variant="danger" onPress={onClearKey} style={{ flex: 1 }} />
          )}
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
          4 daily nudges: morning weigh-in, midday check, gym window, evening wrap-up. Turn on to
          stay honest.
        </P>
        <View style={{ height: 12 }} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button
            title="Turn on reminders"
            icon="bell.fill"
            style={{ flex: 1 }}
            onPress={async () => {
              const ok = await requestNotificationPermission();
              if (!ok)
                return notify(
                  'Permission denied',
                  'Enable notifications for ComeBack in iOS Settings.',
                );
              const n = await scheduleDailyReminders();
              notify('Done', `${n} daily reminders scheduled.`);
            }}
          />
          <Button
            title="Turn off"
            variant="secondary"
            style={{ flex: 1 }}
            onPress={async () => {
              await clearAllReminders();
              notify('Reminders off');
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
            notify('Sign out?', '', [
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
