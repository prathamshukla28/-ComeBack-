import { useQuery } from '@tanstack/react-query';
import { View } from 'react-native';
import { Card, H1, H2, P, Screen } from '@/components/ui';
import { deltaLabel, weeklyDelta, type WeeklyDelta } from '@/lib/insights';
import {
  cleanStreakStats,
  habitDailyTotals,
  workoutDailyCounts,
  type HabitKind,
} from '@/lib/queries';
import { useTheme } from '@/lib/theme';

const splitWeeks = (series: { total: number }[]) => {
  const totals = series.map((d) => d.total);
  const mid = Math.max(0, totals.length - 7);
  return { previous: totals.slice(0, mid), current: totals.slice(mid) };
};

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const { c } = useTheme();
  const max = Math.max(1, ...values);
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'flex-end', height: 44, gap: 3, marginTop: 10 }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {values.map((v, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: (v / max) * 40 || 2,
            backgroundColor: v > 0 ? color : c.border,
            borderRadius: 3,
          }}
        />
      ))}
    </View>
  );
}

function TrendBlock({
  title,
  series,
  goodWhenDown,
  unit,
}: {
  title: string;
  series: { date: string; total: number }[];
  goodWhenDown: boolean;
  unit: string;
}) {
  const { c, brand } = useTheme();
  const { current, previous } = splitWeeks(series);
  const d: WeeklyDelta = weeklyDelta(current, previous, goodWhenDown);
  const tone = d.direction === 'flat' ? c.textMuted : d.improving ? c.success : c.danger;
  const label = deltaLabel(d);

  return (
    <Card>
      <View
        accessible
        accessibilityLabel={`${title}: ${d.total} ${unit} this week, ${label} versus last week, ${d.improving ? 'improving' : 'needs attention'}`}
        style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <H2>{title}</H2>
        <P style={{ color: tone, fontWeight: '800' }}>{label}</P>
      </View>
      <P muted style={{ fontSize: 13 }}>
        {d.total} {unit} this week · {d.previousTotal} last week
      </P>
      <Sparkline values={series.map((s) => s.total)} color={d.improving ? c.success : brand} />
    </Card>
  );
}

function StreakSummary({ title, kind }: { title: string; kind: HabitKind }) {
  const { c } = useTheme();
  const stats = useQuery({
    queryKey: ['habit', kind, 'streak'],
    queryFn: () => cleanStreakStats(kind),
  });
  const current = stats.data?.current ?? 0;
  const best = Math.max(stats.data?.previousBest ?? 0, current);
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <P muted style={{ fontSize: 12 }}>
        {title}
      </P>
      <P style={{ fontSize: 26, fontWeight: '800', color: c.text }}>{current}</P>
      <P muted style={{ fontSize: 11 }}>
        day{current === 1 ? '' : 's'} · best {best}
      </P>
    </View>
  );
}

export default function Trends() {
  const cig = useQuery({
    queryKey: ['trend', 'cigarette'],
    queryFn: () => habitDailyTotals('cigarette', 14),
  });
  const alc = useQuery({
    queryKey: ['trend', 'alcohol'],
    queryFn: () => habitDailyTotals('alcohol', 14),
  });
  const workouts = useQuery({
    queryKey: ['trend', 'workouts'],
    queryFn: () => workoutDailyCounts(14),
  });

  return (
    <Screen>
      <H1>Trends</H1>
      <P muted>This week vs. last. Progress, not perfection.</P>
      <View style={{ height: 16 }} />

      <Card>
        <H2>Clean streaks</H2>
        <View style={{ flexDirection: 'row', marginTop: 8 }}>
          <StreakSummary title="🫁 Smoke-free" kind="cigarette" />
          <StreakSummary title="💧 Dry" kind="alcohol" />
        </View>
      </Card>

      {cig.data && <TrendBlock title="🚬 Cigarettes" series={cig.data} goodWhenDown unit="cigs" />}
      {alc.data && <TrendBlock title="🍺 Alcohol" series={alc.data} goodWhenDown unit="units" />}
      {workouts.data && (
        <TrendBlock
          title="🏋️ Workout days"
          series={workouts.data}
          goodWhenDown={false}
          unit="days"
        />
      )}
    </Screen>
  );
}
