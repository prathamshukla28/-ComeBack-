import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, View } from 'react-native';
import { AnimatedNumber } from '@/components/AnimatedNumber';
import { Confetti } from '@/components/Confetti';
import { Button, Card, H1, H2, P, Screen } from '@/components/ui';
import { alcoholMessage, cigaretteMessage, type CoachMessage, type Vibe } from '@/lib/coach-messages';
import { heavy, success, warn as hapticWarn } from '@/lib/haptics';
import { cleanStreak, habitCountToday, habitLast7Days, logHabit, undoLastHabit, type HabitKind } from '@/lib/queries';
import { useTheme } from '@/lib/theme';

function vibeColor(v: Vibe, theme: any) {
  if (v === 'good') return theme.success;
  if (v === 'ok') return theme.textMuted;
  if (v === 'warn') return '#F59E0B';
  return theme.danger;
}

function HabitBlock({
  kind, title, unitLabel, incLabel, messageFn, positive,
}: {
  kind: HabitKind; title: string; unitLabel: string; incLabel: string;
  messageFn: (n: number) => CoachMessage; positive?: boolean;
}) {
  const { c, brand } = useTheme();
  const qc = useQueryClient();
  const today = useQuery({ queryKey: ['habit', kind, 'today'], queryFn: () => habitCountToday(kind) });
  const week = useQuery({ queryKey: ['habit', kind, '7d'], queryFn: () => habitLast7Days(kind) });
  const streak = useQuery({ queryKey: ['habit', kind, 'streak'], queryFn: () => cleanStreak(kind) });
  const [flash, setFlash] = useState<CoachMessage | null>(null);
  const [confetti, setConfetti] = useState(false);

  const inv = () => qc.invalidateQueries({ queryKey: ['habit', kind] });

  const add = useMutation({
    mutationFn: () => logHabit(kind, 1),
    onSuccess: () => {
      inv();
      const newCount = (today.data ?? 0) + 1;
      const msg = messageFn(newCount);
      setFlash(msg);
      setTimeout(() => setFlash(null), 6000);
      if (positive) { success(); setConfetti(true); }
      else if (msg.vibe === 'bad') heavy();
      else if (msg.vibe === 'warn') hapticWarn();
    },
  });

  const undo = useMutation({
    mutationFn: () => undoLastHabit(kind),
    onSuccess: (ok) => {
      inv();
      if (!ok) Alert.alert('Nothing to undo');
      else setFlash(null);
    },
  });

  const currentCount = today.data ?? 0;
  const contextMsg = messageFn(currentCount);
  const activeMsg = flash ?? contextMsg;
  const weekTotal = (week.data ?? []).reduce((s, d) => s + d.total, 0);
  const maxBar = Math.max(1, ...(week.data ?? []).map((d) => d.total));
  const cleanDays = streak.data ?? 0;
  const showStreak = currentCount === 0 && cleanDays > 0 && cleanDays < 999;

  return (
    <Card>
      <Confetti visible={confetti} onDone={() => setConfetti(false)} />
      <H2>{title}</H2>
      <View style={{ alignItems: 'center', marginVertical: 8 }}>
        <P muted>{unitLabel} today</P>
        <AnimatedNumber value={currentCount} style={{ fontSize: 48, fontWeight: '800', color: c.text, letterSpacing: -1 }} />
      </View>
      <View style={{
        backgroundColor: c.background, borderLeftWidth: 3,
        borderLeftColor: vibeColor(activeMsg.vibe, c),
        padding: 12, borderRadius: 8, marginBottom: 12,
      }}>
        <P style={{ color: vibeColor(activeMsg.vibe, c), fontWeight: '600' }}>
          {activeMsg.emoji} {activeMsg.text}
        </P>
      </View>
      {showStreak && (
        <View style={{ alignItems: 'center', marginBottom: 12 }}>
          <P style={{ color: c.success, fontWeight: '700' }}>
            🏆 {cleanDays} clean day{cleanDays > 1 ? 's' : ''} — don't break it
          </P>
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <Button title={incLabel} icon="plus.circle.fill" onPress={() => add.mutate()} style={{ flex: 2 }} loading={add.isPending} />
        <Button title="Undo" variant="secondary" icon="arrow.uturn.backward" onPress={() => undo.mutate()} style={{ flex: 1 }} />
      </View>
      <P muted>Last 7 days · total {weekTotal}</P>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 60, gap: 6, marginTop: 8 }}>
        {(week.data ?? []).map((d) => (
          <View key={d.date} style={{ flex: 1, alignItems: 'center' }}>
            <View style={{ width: '100%', height: (d.total / maxBar) * 50 || 2, backgroundColor: brand, borderRadius: 4 }} />
            <P style={{ fontSize: 10, color: c.textMuted, marginTop: 4 }}>{d.date.slice(5)}</P>
          </View>
        ))}
      </View>
    </Card>
  );
}

export default function Habits() {
  return (
    <Screen>
      <H1>Habits</H1>
      <P muted>Track it to change it.</P>
      <View style={{ height: 16 }} />
      <HabitBlock kind="cigarette" title="🚬 Cigarettes" unitLabel="cigarettes" incLabel="+1 cigarette" messageFn={cigaretteMessage} />
      <HabitBlock kind="alcohol" title="🍺 Alcohol" unitLabel="units" incLabel="+1 unit" messageFn={alcoholMessage} />
    </Screen>
  );
}
