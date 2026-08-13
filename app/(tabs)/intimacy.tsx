import * as LocalAuthentication from 'expo-local-authentication';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { Button, Card, Empty, H1, Input, P, Screen } from '@/components/ui';
import { habitCountToday, habitLast7Days, logHabit, undoLastHabit } from '@/lib/queries';
import { getIntimacyPin, saveIntimacyPin } from '@/lib/secureStore';
import { useTheme } from '@/lib/theme';

export default function Intimacy() {
  const [unlocked, setUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [needsPinSetup, setNeedsPinSetup] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    (async () => {
      const savedPin = await getIntimacyPin();
      if (!savedPin) {
        setNeedsPinSetup(true);
        setChecking(false);
        return;
      }
      // Try biometric first
      const hasHW = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (hasHW && enrolled) {
        const res = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Unlock Intimacy',
          disableDeviceFallback: false,
          fallbackLabel: 'Use PIN',
        });
        if (res.success) {
          setUnlocked(true);
        }
      }
      setChecking(false);
    })();
  }, []);

  const savePin = async () => {
    if (pinInput.length < 4) return Alert.alert('PIN too short', 'Use at least 4 digits.');
    await saveIntimacyPin(pinInput);
    setPinInput('');
    setNeedsPinSetup(false);
    setUnlocked(true);
  };

  const tryPin = async () => {
    const saved = await getIntimacyPin();
    if (pinInput === saved) {
      setUnlocked(true);
      setPinInput('');
    } else {
      Alert.alert('Wrong PIN');
      setPinInput('');
    }
  };

  if (checking)
    return (
      <Screen>
        <P muted>Checking…</P>
      </Screen>
    );

  if (needsPinSetup) {
    return (
      <Screen>
        <H1>Set a PIN</H1>
        <P muted>4+ digits. Used as a fallback if FaceID fails. Stored only on this device.</P>
        <View style={{ height: 16 }} />
        <Input
          label="New PIN"
          keyboardType="number-pad"
          secureTextEntry
          value={pinInput}
          onChangeText={setPinInput}
          maxLength={8}
        />
        <Button title="Save PIN" onPress={savePin} />
      </Screen>
    );
  }

  if (!unlocked) {
    return (
      <Screen>
        <H1>🔒 Locked</H1>
        <P muted>This tab is private. Use FaceID or enter your PIN.</P>
        <View style={{ height: 16 }} />
        <Button
          title="Unlock with FaceID"
          icon="faceid"
          onPress={async () => {
            const res = await LocalAuthentication.authenticateAsync({
              promptMessage: 'Unlock Intimacy',
            });
            if (res.success) setUnlocked(true);
          }}
        />
        <View style={{ height: 12 }} />
        <Input
          label="Or enter PIN"
          keyboardType="number-pad"
          secureTextEntry
          value={pinInput}
          onChangeText={setPinInput}
          maxLength={8}
        />
        <Button title="Unlock" variant="secondary" onPress={tryPin} />
      </Screen>
    );
  }

  return <IntimacyContent />;
}

function IntimacyContent() {
  const { c, brand } = useTheme();
  const qc = useQueryClient();
  const today = useQuery({
    queryKey: ['habit', 'intimacy', 'today'],
    queryFn: () => habitCountToday('intimacy'),
  });
  const week = useQuery({
    queryKey: ['habit', 'intimacy', '7d'],
    queryFn: () => habitLast7Days('intimacy'),
  });
  const inv = () => qc.invalidateQueries({ queryKey: ['habit', 'intimacy'] });
  const add = useMutation({ mutationFn: () => logHabit('intimacy', 1), onSuccess: inv });
  const undo = useMutation({
    mutationFn: () => undoLastHabit('intimacy'),
    onSuccess: (ok) => {
      inv();
      if (!ok) Alert.alert('Nothing to undo');
    },
  });

  const weekTotal = (week.data ?? []).reduce((s, d) => s + d.total, 0);
  const maxBar = Math.max(1, ...(week.data ?? []).map((d) => d.total));

  return (
    <Screen>
      <H1>Intimacy</H1>
      <P muted>Private. Encrypted lock on this device.</P>
      <View style={{ height: 16 }} />

      <Card>
        <View style={{ alignItems: 'center', marginVertical: 8 }}>
          <P muted>Today</P>
          <H1>{today.data ?? 0}</H1>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          <Button
            title="Log +1"
            icon="heart.fill"
            onPress={() => add.mutate()}
            style={{ flex: 2 }}
          />
          <Button
            title="Undo"
            variant="secondary"
            icon="arrow.uturn.backward"
            onPress={() => undo.mutate()}
            style={{ flex: 1 }}
          />
        </View>
        <P muted>Last 7 days · total {weekTotal}</P>
        <View
          style={{ flexDirection: 'row', alignItems: 'flex-end', height: 60, gap: 6, marginTop: 8 }}
        >
          {(week.data ?? []).map((d) => (
            <View key={d.date} style={{ flex: 1, alignItems: 'center' }}>
              <View
                style={{
                  width: '100%',
                  height: (d.total / maxBar) * 50 || 2,
                  backgroundColor: brand,
                  borderRadius: 4,
                }}
              />
              <P style={{ fontSize: 10, color: c.textMuted, marginTop: 4 }}>{d.date.slice(5)}</P>
            </View>
          ))}
        </View>
      </Card>

      <Empty
        icon="lock.shield.fill"
        title="Your data, your device"
        subtitle="This tab locks again when you leave the app."
      />
    </Screen>
  );
}
