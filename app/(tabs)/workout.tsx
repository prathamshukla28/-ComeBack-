import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Confetti } from '@/components/Confetti';
import { Button, Card, Empty, H1, H2, Input, P, Screen } from '@/components/ui';
import { heavy, success } from '@/lib/haptics';
import { deleteSet, ensureTodayWorkout, isNewPR, listExercises, logSet, todaySets, type Exercise } from '@/lib/queries';
import { useTheme } from '@/lib/theme';

export default function Workout() {
  const { c, brand } = useTheme();
  const qc = useQueryClient();
  const workoutId = useQuery({ queryKey: ['todayWorkout'], queryFn: ensureTodayWorkout });
  const exercises = useQuery({ queryKey: ['exercises'], queryFn: listExercises });
  const sets = useQuery({
    queryKey: ['sets', workoutId.data],
    queryFn: () => todaySets(workoutId.data!),
    enabled: !!workoutId.data,
  });

  const [picked, setPicked] = useState<Exercise | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [rir, setRir] = useState('');
  const [confetti, setConfetti] = useState(false);

  const add = useMutation({
    mutationFn: async () => {
      if (!workoutId.data || !picked) throw new Error('Pick an exercise first');
      const w = parseFloat(weight);
      const r = parseInt(reps, 10);
      if (isNaN(w) || isNaN(r)) throw new Error('Enter weight (kg) and reps');
      await logSet({
        workoutId: workoutId.data,
        exerciseId: picked.id,
        exerciseName: picked.name,
        weightKg: w,
        reps: r,
        rir: rir ? parseInt(rir, 10) : undefined,
      });
      const pr = await isNewPR(picked.name, w, r).catch(() => false);
      return { pr, name: picked.name, w, r };
    },
    onSuccess: (result) => {
      setWeight('');
      setReps('');
      setRir('');
      qc.invalidateQueries({ queryKey: ['sets'] });
      qc.invalidateQueries({ queryKey: ['workoutStreak'] });
      if (result?.pr) {
        heavy();
        setConfetti(true);
        Alert.alert('🎉 NEW PR', `${result.name}: ${result.w}kg × ${result.r}\nEstimated 1RM went up.`);
      } else {
        success();
      }
    },
    onError: (e: any) => Alert.alert('Cannot log set', e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteSet(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sets'] }),
  });

  const grouped = useMemo(() => {
    const g: Record<string, any[]> = {};
    for (const s of sets.data ?? []) {
      g[s.exercise_name] ??= [];
      g[s.exercise_name].push(s);
    }
    return g;
  }, [sets.data]);

  return (
    <Screen>
      <Confetti visible={confetti} onDone={() => setConfetti(false)} />
      <H1>Workout</H1>
      <P muted>Log every set. No excuses.</P>
      <View style={{ height: 16 }} />

      <Card>
        <H2>Log a set</H2>
        <Pressable
          onPress={() => setPickerOpen(true)}
          style={[styles.picker, { backgroundColor: c.background, borderColor: c.border }]}
        >
          <P>{picked ? picked.name : 'Pick exercise…'}</P>
        </Pressable>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Input label="Weight (kg)" keyboardType="decimal-pad" value={weight} onChangeText={setWeight} />
          </View>
          <View style={{ flex: 1 }}>
            <Input label="Reps" keyboardType="number-pad" value={reps} onChangeText={setReps} />
          </View>
          <View style={{ flex: 1 }}>
            <Input label="RIR" keyboardType="number-pad" value={rir} onChangeText={setRir} placeholder="opt" />
          </View>
        </View>
        <Button title="Add set" icon="plus.circle.fill" onPress={() => add.mutate()} loading={add.isPending} />
      </Card>

      <H2>Today's sets</H2>
      {Object.keys(grouped).length === 0 ? (
        <Empty icon="dumbbell.fill" title="No sets yet" subtitle="Pick an exercise above and start logging." />
      ) : (
        Object.entries(grouped).map(([name, rows]) => (
          <Card key={name}>
            <H2>{name}</H2>
            {rows.map((s: any) => (
              <View key={s.id} style={styles.setRow}>
                <P>
                  Set {s.set_index} · {s.weight_kg}kg × {s.reps}
                  {s.rir != null ? ` · RIR ${s.rir}` : ''}
                </P>
                <Pressable onPress={() => del.mutate(s.id)}>
                  <P style={{ color: c.danger }}>Delete</P>
                </Pressable>
              </View>
            ))}
          </Card>
        ))
      )}

      <Modal visible={pickerOpen} animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <View style={{ flex: 1, backgroundColor: c.background, paddingTop: 60, paddingHorizontal: 20 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
            <H1>Exercise</H1>
            <Pressable onPress={() => setPickerOpen(false)}>
              <P style={{ color: brand, fontWeight: '700' }}>Close</P>
            </Pressable>
          </View>
          <FlatList
            data={exercises.data ?? []}
            keyExtractor={(e) => e.id}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  setPicked(item);
                  setPickerOpen(false);
                }}
                style={{ paddingVertical: 14, borderBottomWidth: 1, borderColor: c.border }}
              >
                <P>{item.name}</P>
                <P muted style={{ fontSize: 12 }}>
                  {item.muscle_group}
                </P>
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  picker: { height: 50, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, justifyContent: 'center', marginBottom: 12 },
  setRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
});
