import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () =>
    ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }) as any,
});

const SCHEDULED_KEY = 'comeback-daily-reminders';

const DAILY = [
  { hour: 8, minute: 0, title: '☀️ Morning', body: 'Log your morning weight. Set the tone.' },
  {
    hour: 12,
    minute: 30,
    title: '💧 Midday check',
    body: 'Water break. How you doing? Log a cig if you had one.',
  },
  {
    hour: 18,
    minute: 0,
    title: '🏋️ Gym window',
    body: 'If you\u2019re training today, now is the hour.',
  },
  {
    hour: 22,
    minute: 0,
    title: '🌙 Wrap the day',
    body: 'Log tonight\u2019s cigs / drinks before bed. Honest data → real progress.',
  },
];

export async function requestNotificationPermission(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  if (status === 'granted') return true;
  const res = await Notifications.requestPermissionsAsync();
  return res.status === 'granted';
}

export async function scheduleDailyReminders(): Promise<number> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  let count = 0;
  for (const d of DAILY) {
    await Notifications.scheduleNotificationAsync({
      content: { title: d.title, body: d.body, data: { type: SCHEDULED_KEY } },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: d.hour,
        minute: d.minute,
      } as any,
    });
    count++;
  }
  return count;
}

export async function clearAllReminders(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export async function listReminders() {
  return Notifications.getAllScheduledNotificationsAsync();
}

export function isReminderCapable() {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}
