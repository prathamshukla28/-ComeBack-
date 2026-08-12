import { useQuery } from '@tanstack/react-query';
import { View } from 'react-native';
import { AnimatedNumber } from '@/components/AnimatedNumber';
import { Card, H1, H2, P, Screen, StatRow } from '@/components/ui';
import {
  alcoholMessage,
  cigaretteMessage,
  streakMessage,
  workoutMessage,
  type Vibe,
} from '@/lib/coach-messages';
import {
  cleanStreak,
  ensureTodayWorkout,
  habitCountToday,
  loadProfile,
  todaySets,
  workoutStreak,
} from '@/lib/queries';
import { useTheme } from '@/lib/theme';

function vibeColor(v: Vibe, theme: any) {
  if (v === 'good') return theme.success;
  if (v === 'ok') return theme.textMuted;
  if (v === 'warn') return '#F59E0B';
  return theme.danger;
}

function StatRowAnim({
  label,
  value,
  textColor,
}: {
  label: string;
  value: number;
  textColor: string;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 6,
      }}
    >
      <View style={{ flexShrink: 1 }}>
        <P>{label}</P>
      </View>
      <AnimatedNumber value={value} style={{ fontSize: 18, fontWeight: '700', color: textColor }} />
    </View>
  );
}

export default function Dashboard() {
  const { c } = useTheme();
  const profile = useQuery({ queryKey: ['profile'], queryFn: loadProfile });
  const cigs = useQuery({
    queryKey: ['habit', 'cigarette', 'today'],
    queryFn: () => habitCountToday('cigarette'),
  });
  const alc = useQuery({
    queryKey: ['habit', 'alcohol', 'today'],
    queryFn: () => habitCountToday('alcohol'),
  });
  const intim = useQuery({
    queryKey: ['habit', 'intimacy', 'today'],
    queryFn: () => habitCountToday('intimacy'),
  });
  const workoutId = useQuery({ queryKey: ['todayWorkout'], queryFn: ensureTodayWorkout });
  const sets = useQuery({
    queryKey: ['sets', workoutId.data],
    queryFn: () => todaySets(workoutId.data!),
    enabled: !!workoutId.data,
  });
  const cigStreak = useQuery({
    queryKey: ['habit', 'cigarette', 'streak'],
    queryFn: () => cleanStreak('cigarette'),
  });
  const alcStreak = useQuery({
    queryKey: ['habit', 'alcohol', 'streak'],
    queryFn: () => cleanStreak('alcohol'),
  });
  const wStreak = useQuery({ queryKey: ['workoutStreak'], queryFn: workoutStreak });

  const greetingName = profile.data?.display_name || 'Champion';
  const now = new Date();
  const hh = now.getHours();
  const greeting = hh < 12 ? 'Good morning' : hh < 18 ? 'Good afternoon' : 'Good evening';

  const setsCount = sets.data?.length ?? 0;
  const cigCount = cigs.data ?? 0;
  const alcCount = alc.data ?? 0;

  const cigMsg = cigaretteMessage(cigCount);
  const alcMsg = alcoholMessage(alcCount);
  const wMsg = workoutMessage(setsCount);

  const cigDays = cigStreak.data ?? 0;
  const alcDays = alcStreak.data ?? 0;
  const wDays = wStreak.data ?? 0;

  const vibes: Vibe[] = [cigMsg.vibe, alcMsg.vibe, wMsg.vibe];
  const worstVibe: Vibe = vibes.includes('bad')
    ? 'bad'
    : vibes.includes('warn')
      ? 'warn'
      : vibes.every((v) => v === 'good')
        ? 'good'
        : 'ok';
  const vibeLabel =
    worstVibe === 'good'
      ? 'On fire 🔥'
      : worstVibe === 'ok'
        ? 'Steady'
        : worstVibe === 'warn'
          ? 'Watch it'
          : 'Reset needed';

  return (
    <Screen>
      <View style={{ marginBottom: 16 }}>
        <P muted>{greeting},</P>
        <H1>{greetingName}</H1>
        <P muted>
          {now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        </P>
      </View>

      <View
        style={{
          backgroundColor: vibeColor(worstVibe, c),
          padding: 14,
          borderRadius: 12,
          marginBottom: 16,
        }}
      >
        <P style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Today's vibe: {vibeLabel}</P>
      </View>

      <Card>
        <H2>Today</H2>
        <StatRowAnim label={wMsg.emoji + ' Sets logged'} value={setsCount} textColor={c.text} />
        <P muted style={{ fontSize: 13, marginBottom: 8 }}>
          {wMsg.text}
        </P>
        <StatRowAnim label={cigMsg.emoji + ' Cigarettes'} value={cigCount} textColor={c.text} />
        <P muted style={{ fontSize: 13, color: vibeColor(cigMsg.vibe, c), marginBottom: 8 }}>
          {cigMsg.text}
        </P>
        <StatRowAnim label={alcMsg.emoji + ' Alcohol units'} value={alcCount} textColor={c.text} />
        <P muted style={{ fontSize: 13, color: vibeColor(alcMsg.vibe, c), marginBottom: 8 }}>
          {alcMsg.text}
        </P>
        <StatRowAnim label="❤️ Intimacy" value={intim.data ?? 0} textColor={c.text} />
      </Card>

      <Card>
        <H2>Streaks</H2>
        <StatRow
          icon="dumbbell.fill"
          label="Workout streak"
          value={wDays > 0 ? `${wDays}d ${streakMessage(wDays, 'workout').emoji}` : '—'}
        />
        <StatRow
          icon="lungs.fill"
          label="Smoke-free streak"
          value={
            cigDays >= 999
              ? '∞'
              : cigDays > 0
                ? `${cigDays}d ${streakMessage(cigDays, 'clean').emoji}`
                : '—'
          }
        />
        <StatRow
          icon="drop.fill"
          label="Dry streak"
          value={
            alcDays >= 999
              ? '∞'
              : alcDays > 0
                ? `${alcDays}d ${streakMessage(alcDays, 'clean').emoji}`
                : '—'
          }
        />
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
