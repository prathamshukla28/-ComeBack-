import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, View } from 'react-native';
import { Button, Card, H1, H2, P, Screen } from '@/components/ui';
import { habitCountToday, habitLast7Days, logHabit, undoLastHabit, type HabitKind } from '@/lib/queries';
import { useTheme } from '@/lib/theme';

function HabitBlock({ kind, title, unitLabel, incLabel }: { kind: HabitKind; title: string; unitLabel: string; incLabel: string }) {
  const { c, brand } = useTheme();
  const qc = useQueryClient();
  const today = useQuery({ queryKey: ['habit', kind, 'today'], queryFn: () => habitCountToday(kind) });
  const week = useQuery({ queryKey: ['habit', kind, '7d'], queryFn: () => habitLast7Days(kind) });

  const inv = () => qc.invalidateQueries({ queryKey: ['habit', kind] });

  const add = useMutation({ mutationFn: () => logHabit(kind, 1), onSuccess: inv });
  const undo = useMutation({
    mutationFn: () => undoLastHabit(kind),
    onSuccess: (ok) => {
      inv();
      if (!ok) Alert.alert('Nothing to undo');
    },
  });

  const weekTotal = (week.data ?? []).reduce((s, d) => s + d.total, 0);
  const maxBar = Math.max(1, ...(week.data ?? []).map((d) => d.total));

  return (
    <Card>
      <H2>{title}</H2>
      <View style={{ alignItems: 'center', marginVertical: 8 }}>
        <P muted>{unitLabel} today</P>
        <H1>{today.data ?? 0}</H1>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <Button title={incLabel} icon="plus.circle.fill" onPress={() => add.mutate()} style={{ flex: 2 }} />
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
      <HabitBlock kind="cigarette" title="🚬 Cigarettes" unitLabel="cigarettes" incLabel="+1 cigarette" />
      <HabitBlock kind="alcohol" title="🍺 Alcohol" unitLabel="units" incLabel="+1 unit" />
    </Screen>
  );
}
