import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Tabs } from 'expo-router';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';

function TabIcon({ name, color }: { name: SymbolViewProps['name']; color: SymbolViewProps['tintColor'] }) {
  return <SymbolView name={name} tintColor={color} size={26} />;
}

export default function TabLayout() {
  const scheme = useColorScheme();
  const theme = Colors[scheme];

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.tint,
        tabBarInactiveTintColor: theme.tabIconDefault,
        tabBarStyle: { backgroundColor: theme.card, borderTopColor: theme.border },
        headerStyle: { backgroundColor: theme.background },
        headerTitleStyle: { color: theme.text, fontWeight: '700' },
        headerShown: useClientOnlyValue(false, true),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          tabBarIcon: ({ color }) => <TabIcon name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="workout"
        options={{
          title: 'Workout',
          tabBarIcon: ({ color }) => <TabIcon name="dumbbell.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="habits"
        options={{
          title: 'Habits',
          tabBarIcon: ({ color }) => <TabIcon name="chart.bar.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="intimacy"
        options={{
          title: 'Intimacy',
          tabBarIcon: ({ color }) => <TabIcon name="lock.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="guru"
        options={{
          title: 'Guru',
          tabBarIcon: ({ color }) => <TabIcon name="figure.strengthtraining.traditional" color={color} />,
        }}
      />
      <Tabs.Screen
        name="coach"
        options={{
          title: 'Coach',
          tabBarIcon: ({ color }) => <TabIcon name="brain.head.profile" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <TabIcon name="gearshape.fill" color={color} />,
        }}
      />
      {/* Hide the old template screen */}
      <Tabs.Screen name="two" options={{ href: null }} />
    </Tabs>
  );
}
