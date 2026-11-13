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
import { readGoals } from './goalStore';
import { readQuits } from './quitStore';
import { readTasks } from './taskStore';
import { timeAr } from './tasks';
import { clean, DAY_MS, milestone } from './quit';
import { MEAL_PICKS_KEY } from './journal';
import { readNumbers } from './meta';
import { energyFor } from './energy';
import { parseWeights, WEIGHTS_KEY } from './weight';
import { HABITS_OFF } from './hidden';
import { isDue, logKey, partsDone, pausedNow, prayerTime, type Habit } from './habits';
import { ADHKAR_AR, adhkarOf } from './adhkar';
import { readHabitLog, readHabitParts, readHabits } from './habitStore';
import { addDays } from './gaps';

const native = Platform.OS !== 'web';
const KIND = 'workout-reminder';
const BRIEF = 'morning-brief';
const DUMP = 'brain-dump';
const HABIT = 'habit-reminder';
const QUIT = 'quit-milestone';
const TASK = 'task-reminder';

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
    habits: HABITS_OFF ? [] : readHabits(),
    goals: readGoals(),
    quits: readQuits(),
    tasks: readTasks(),
  };
}

let running: Promise<void> | null = null;

/** Cancels our scheduled reminders and schedules the next ones from the current settings and log. */
export function syncReminders(): Promise<void> {
  if (!native) return Promise.resolve();
  const go = async () => {
    try {
      for (const n of await Notifications.getAllScheduledNotificationsAsync()) {
        const k = n.content.data?.kind;
        if (k === KIND || k === BRIEF || k === HABIT || k === QUIT || k === TASK || k === DUMP) await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
      const st = useSettings.getState();
      // Each quit's next milestone, as a quiet "well done" without the habit's name.
      if ((await Notifications.getPermissionsAsync()).granted) {
        const nowMs = Date.now();
        // Tasks with a reminder: at their day and time (the next 30 of them).
        const due = readTasks()
          .filter((x) => x.remind && !x.done && x.due && x.time != null)
          .map((x) => ({ x, at: new Date(`${x.due}T${String(Math.floor(x.time! / 60)).padStart(2, '0')}:${String(x.time! % 60).padStart(2, '0')}:00`) }))
          .filter((y) => y.at.getTime() > nowMs)
          .sort((a, b) => a.at.getTime() - b.at.getTime())
          .slice(0, 30);
        for (const { x, at } of due) {
          await Notifications.scheduleNotificationAsync({
            content: { title: x.title, body: `مهامي · ${timeAr(x.time!)}${x.subs.length ? ` · ${x.subs.length} خطوات` : ''}`, sound: true, data: { kind: TASK } },
            trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: 'reminder' },
          });
        }
        // فضّي دماغك before bed: every night at its time, opening the page on tap.
        if (st.dumpRemind) {
          for (const date of reminderTimes(new Date(), st.dumpTime, [0, 1, 2, 3, 4, 5, 6], false)) {
            await Notifications.scheduleNotificationAsync({
              content: { title: 'فضّي دماغك 🧠', body: 'خمس دقايق: اكتب كل اللي في دماغك وحدد لبكرة، وتنام أهدى', sound: true, data: { kind: DUMP, url: '/dump' } },
              trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: 'reminder' },
            });
          }
        }
        for (const q of readQuits()) {
          const c = clean(q, nowMs);
          const m = milestone(c.ms);
          const date = new Date(nowMs + m.next * DAY_MS - c.ms);
          await Notifications.scheduleNotificationAsync({
            content: { title: `${m.next === 1 ? 'أول يوم' : `${m.next} يوم`} نضيف 🏅`, body: 'وصلت محطة جديدة. كمّل، انت أقوى من الرغبة', sound: true, data: { kind: QUIT } },
            trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: 'reminder' },
          });
        }
      }
      const habits = (HABITS_OFF ? [] : readHabits()).filter((h) => !pausedNow(h) && (h.remind != null || h.at || h.parts?.some((p) => p.at)));
      if ((!st.reminder && !st.brief && !habits.length) || !(await Notifications.getPermissionsAsync()).granted) return;
      const today = dateKey();
      // Each habit with a reminder: its next due days at its time; not today once it's ticked (done or excused).
      const hlog = readHabitLog();
      const hparts = readHabitParts();
      const body = (h: Habit) => (h.app ? `${h.cue ? `${h.cue} · ` : ''}دوس تفتح التطبيق` : h.cue ? `${h.cue} · علّم عليها لما تعملها` : 'عادة النهارده: علّم عليها لما تعملها');
      // `url`: a page to open on tap; `app`: an app to open on tap (the habit's, e.g. the Quran app).
      const at = async (title: string, text: string, date: Date, url?: string, app?: string) =>
        Notifications.scheduleNotificationAsync({
          content: { title, body: text, sound: true, data: { kind: HABIT, ...(url ? { url } : null), ...(app ? { app } : null) } },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: 'reminder' },
        });
      // Prayer-linked times need the location from the prayer times settings.
      const place = st.place;
      const now = new Date();
      for (const h of habits) {
        const marked = !!hlog[logKey(h.id, today)];
        if (h.remind != null) {
          for (const date of reminderTimes(now, h.remind, h.days, marked, 5)) if (dateKey(date) >= h.start) await at(h.name, body(h), date, undefined, h.app);
        }
        if (!place) continue;
        // The next 5 days it's due, at the prayer time + offset; today only if not done yet and still ahead.
        const days: string[] = [];
        for (let i = 0; i < 14 && days.length < 5; i++) {
          const d = addDays(today, i);
          if (isDue(h, d)) days.push(d);
        }
        for (const d of days) {
          if (h.at && !(d === today && marked)) {
            const t = prayerTime(h.at, d, place, st.prayerMethod);
            if (t && t > now) await at(h.name, body(h), t, undefined, h.app);
          }
          const doneParts = d === today ? partsDone(h, hlog, hparts, today) : [];
          for (const [i, p] of (h.parts ?? []).entries()) {
            if (!p.at || doneParts.includes(i) || (d === today && marked)) continue;
            const t = prayerTime(p.at, d, place, st.prayerMethod);
            const ad = adhkarOf(h, i);
            // An adhkar part opens its list on tap (handled in the root layout).
            if (t && t > now) await (ad ? at(`أذكار ${ADHKAR_AR[ad]}`, 'دوس تفتحها وتعدّ', t, `/adhkar?time=${ad}`) : at(`${h.name}: ${p.name}`, 'علّم عليها لما تعملها', t));
          }
        }
      }
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
