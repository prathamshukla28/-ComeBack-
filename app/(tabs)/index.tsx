import { useQuery } from '@tanstack/react-query';
import { Screen, H1, H2, Card, StatRow, P } from '@/components/ui';
import { habitCountToday, ensureTodayWorkout, todaySets, loadProfile } from '@/lib/queries';
import { useTheme } from '@/lib/theme';
import { View } from 'react-native';

export default function Dashboard() {
  const { c } = useTheme();
  const profile = useQuery({ queryKey: ['profile'], queryFn: loadProfile });
  const cigs = useQuery({ queryKey: ['habit', 'cigarette', 'today'], queryFn: () => habitCountToday('cigarette') });
  const alc = useQuery({ queryKey: ['habit', 'alcohol', 'today'], queryFn: () => habitCountToday('alcohol') });
  const intim = useQuery({ queryKey: ['habit', 'intimacy', 'today'], queryFn: () => habitCountToday('intimacy') });
  const workoutId = useQuery({ queryKey: ['todayWorkout'], queryFn: ensureTodayWorkout });
  const sets = useQuery({
    queryKey: ['sets', workoutId.data],
    queryFn: () => todaySets(workoutId.data!),
    enabled: !!workoutId.data,
  });

  const greetingName = profile.data?.display_name || 'Champion';
  const now = new Date();
  const hh = now.getHours();
  const greeting = hh < 12 ? 'Good morning' : hh < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <Screen>
      <View style={{ marginBottom: 16 }}>
        <P muted>{greeting},</P>
        <H1>{greetingName}</H1>
        <P muted>{now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</P>
      </View>

      <Card>
        <H2>Today</H2>
        <StatRow icon="dumbbell.fill" label="Sets logged" value={String(sets.data?.length ?? 0)} />
        <StatRow icon="flame.fill" label="Cigarettes" value={String(cigs.data ?? 0)} />
        <StatRow icon="wineglass.fill" label="Alcohol units" value={String(alc.data ?? 0)} />
        <StatRow icon="heart.fill" label="Intimacy" value={String(intim.data ?? 0)} />
      </Card>

      <Card>
        <H2>Focus</H2>
        <P muted>
          Log every set. Log every cig, every drink. Honest data → honest coaching → real progress.
          Come back stronger. 💪
        </P>
      </Card>
    </Screen>
  );
}
