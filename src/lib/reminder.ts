// Workout reminder and morning brief notifications (settings → تذكير التمرين / ملخص الصبح). The next week's are
// scheduled ahead as one-off notifications (the workout that's due; the day's plan from src/lib/brief.ts), and
// rescheduled whenever the app opens, the settings change or you log something.
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { dayFor } from '../data/program';
import { dateKey } from './logic';
import { after, currentWorkout, reminderTimes } from './schedule';
import { useSettings } from './settings';
import { storage } from './storage';
import { morningBrief, type BriefInput } from './brief';
import { MEAL_PICKS_KEY } from './journal';
import { readNumbers } from './meta';
import { energyFor } from './energy';
import { parseWeights, WEIGHTS_KEY } from './weight';

const native = Platform.OS !== 'web';
const KIND = 'workout-reminder';
const BRIEF = 'morning-brief';

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

/** What the morning brief is built from, as of `today`. */
function briefInput(today: string): BriefInput {
  const st = useSettings.getState();
  return {
    today,
    cur: currentWorkout(storage.trainedDays(), today),
    days: st.reminderDays,
    workoutAt: st.reminder ? st.reminderTime : null,
    picks: readNumbers(MEAL_PICKS_KEY),
    waterL: energyFor(st.body)?.water ?? null,
    weights: parseWeights(storage.getMeta(WEIGHTS_KEY)),
    shopTrips: st.shopTrips,
    shopMoves: st.shopMoves,
  };
}

let running: Promise<void> | null = null;

/** Cancels our scheduled reminders and schedules the next ones from the current settings and log. */
export function syncReminders(): Promise<void> {
  if (!native) return Promise.resolve();
  const go = async () => {
    try {
      for (const n of await Notifications.getAllScheduledNotificationsAsync()) {
        if (n.content.data?.kind === KIND || n.content.data?.kind === BRIEF) await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
      const st = useSettings.getState();
      if ((!st.reminder && !st.brief) || !(await Notifications.getPermissionsAsync()).granted) return;
      const today = dateKey();
      const cur = currentWorkout(storage.trainedDays(), today);
      if (st.brief) {
        const input = briefInput(today);
        // Every day, training or not (all 7 weekdays).
        for (const date of reminderTimes(new Date(), st.briefTime, [0, 1, 2, 3, 4, 5, 6], false)) {
          const b = morningBrief(dateKey(date), input);
          await Notifications.scheduleNotificationAsync({
            content: { title: b.title, body: b.body, sound: true, data: { kind: BRIEF } },
            trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: 'reminder' },
          });
        }
      }
      if (!st.reminder) return;
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
