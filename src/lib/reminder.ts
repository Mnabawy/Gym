// Workout reminder notifications (settings → تذكير التمرين). The next week's reminders are scheduled ahead as one-off
// notifications naming the workout that's due, and rescheduled whenever the app opens, the settings change or you log a set.
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { dayFor } from '../data/program';
import { dateKey } from './logic';
import { after, currentWorkout, reminderTimes } from './schedule';
import { useSettings } from './settings';
import { storage } from './storage';

const native = Platform.OS !== 'web';
const KIND = 'workout-reminder';

/** Asks for notification permission (when turning the reminder on). */
export async function allowReminders(): Promise<boolean> {
  if (!native) return false;
  try {
    if (Platform.OS === 'android') {
      // eslint-disable-next-line import/namespace -- exported via export * (tsc resolves it)
      await Notifications.setNotificationChannelAsync('reminder', { name: 'Workout reminder', importance: Notifications.AndroidImportance.DEFAULT });
    }
    if ((await Notifications.getPermissionsAsync()).granted) return true;
    return (await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } })).granted;
  } catch {
    return false;
  }
}

let running: Promise<void> | null = null;

/** Cancels our scheduled reminders and schedules the next ones from the current settings and log. */
export function syncReminders(): Promise<void> {
  if (!native) return Promise.resolve();
  const go = async () => {
    try {
      for (const n of await Notifications.getAllScheduledNotificationsAsync()) {
        if (n.content.data?.kind === KIND) await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
      const st = useSettings.getState();
      if (!st.reminder || !(await Notifications.getPermissionsAsync()).granted) return;
      const today = dateKey();
      const cur = currentWorkout(storage.trainedDays(), today);
      // Trained today: the reminders are for the workout after today's.
      const title = dayFor(cur.started ? after(cur.id) : cur.id)?.titleAr ?? '';
      for (const date of reminderTimes(new Date(), st.reminderTime, st.reminderDays, cur.started)) {
        await Notifications.scheduleNotificationAsync({
          content: { title: 'وقت التمرين', body: `الدور على: ${title}`, sound: true, data: { kind: KIND } },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: 'reminder' },
        });
      }
    } catch {}
  };
  // One sync at a time; a change while one runs queues another after it.
  running = (running ?? Promise.resolve()).then(go);
  return running;
}
