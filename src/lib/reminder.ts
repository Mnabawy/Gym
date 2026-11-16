// Workout reminder and morning brief notifications (settings → تذكير التمرين / ملخص الصبح). The next week's are
// scheduled ahead as one-off notifications (the workout that's due; the day's plan from src/lib/brief.ts), and
// re-planned whenever the app opens, the settings change or you log something; only rescheduled when the plan changed,
// the OS lost some of ours, or the day changed (meta `reminders.applied`).
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
import { report } from './errlog';

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

/** One notification to schedule, as plain data: what the phone would be asked to show, and when. */
export type Planned = { block: string; at: number; title: string; body: string; data: Record<string, unknown> };

/** Meta key (phone-only, cloudSync `isLocalMeta`): JSON `Applied`, the plan last handed to the OS. */
export const REMINDERS_KEY = 'reminders.applied';
/** `h`: hash of the plan; `day`: the day it was scheduled (redone at least once a day); `n`: how many of ours the OS took. */
type Applied = { h: string; day: string; n: number };

const OURS = new Set([KIND, BRIEF, HABIT, QUIT, TASK, DUMP]);
const isOurs = (n: Notifications.NotificationRequest) => OURS.has(n.content.data?.kind as string);

/** Runs one block of the plan; a failure is logged and the other blocks are still planned. */
function block(name: string, fn: () => void): void {
  try {
    fn();
  } catch (e) {
    report(e, `reminders:${name}`);
  }
}

/** JSON with object keys sorted, so the same plan always gives the same text. */
export function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .filter((k) => o[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

/** A short hash of a string (cyrb53: two 32-bit lanes). */
export function hashText(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${(h2 >>> 0).toString(36)}.${(h1 >>> 0).toString(36)}.${s.length.toString(36)}`;
}

function readApplied(): Applied | null {
  try {
    const a = JSON.parse(storage.getMeta(REMINDERS_KEY) ?? 'null') as Applied | null;
    return a && typeof a.h === 'string' && typeof a.day === 'string' && typeof a.n === 'number' ? a : null;
  } catch {
    return null;
  }
}
const writeApplied = (a: Applied | null) => storage.setMeta(REMINDERS_KEY, a ? JSON.stringify(a) : '');

/** Every reminder the current settings and log ask for, in order, as plain data (nothing is scheduled here). */
export function planReminders(now = new Date()): Planned[] {
  const out: Planned[] = [];
  const add = (blockName: string, title: string, body: string, date: Date, data: Record<string, unknown>) =>
    out.push({ block: blockName, at: date.getTime(), title, body, data });
  const st = useSettings.getState();
  const nowMs = now.getTime();
  const today = dateKey(now);
  // Each block on its own: one that throws (a broken task, quit or habit) never drops the others.
  // Tasks with a reminder: at their day and time (the next 30 of them).
  block('tasks', () => {
    const due = readTasks()
      .filter((x) => x.remind && !x.done && x.due && x.time != null)
      .map((x) => ({ x, at: new Date(`${x.due}T${String(Math.floor(x.time! / 60)).padStart(2, '0')}:${String(x.time! % 60).padStart(2, '0')}:00`) }))
      .filter((y) => y.at.getTime() > nowMs)
      .sort((a, b) => a.at.getTime() - b.at.getTime())
      .slice(0, 30);
    for (const { x, at } of due) {
      add('tasks', x.title, `مهامي · ${timeAr(x.time!)}${x.subs.length ? ` · ${x.subs.length} خطوات` : ''}`, at, { kind: TASK });
    }
  });
  // فضّي دماغك before bed: every night at its time, opening the page on tap.
  if (st.dumpRemind) {
    block('dump', () => {
      for (const date of reminderTimes(now, st.dumpTime, [0, 1, 2, 3, 4, 5, 6], false)) {
        add('dump', 'فضّي دماغك 🧠', 'خمس دقايق: اكتب كل اللي في دماغك وحدد لبكرة، وتنام أهدى', date, { kind: DUMP, url: '/dump' });
      }
    });
  }
  // Each quit's next milestone, as a quiet "well done" without the habit's name.
  block('quits', () => {
    for (const q of readQuits()) {
      const c = clean(q, nowMs);
      const m = milestone(c.ms);
      const date = new Date(nowMs + m.next * DAY_MS - c.ms);
      add('quits', `${m.next === 1 ? 'أول يوم' : `${m.next} يوم`} نضيف 🏅`, 'وصلت محطة جديدة. كمّل، انت أقوى من الرغبة', date, { kind: QUIT });
    }
  });
  if (!HABITS_OFF) block('habits', () => planHabits(today, now, add));
  if (st.brief) {
    block('brief', () => {
      const input = briefInput(today);
      // Every day, training or not (all 7 weekdays).
      for (const date of reminderTimes(now, st.briefTime, [0, 1, 2, 3, 4, 5, 6], false)) {
        const b = morningBrief(dateKey(date), input);
        add('brief', b.title, b.body, date, { kind: BRIEF });
      }
    });
  }
  if (st.reminder) {
    block('workout', () => {
      const cur = currentWorkout(storage.trainedDays(), today);
      // Trained today: the reminders are for the workout after today's.
      const title = dayFor(cur.started ? after(cur.id) : cur.id)?.titleAr ?? '';
      for (const date of reminderTimes(now, st.reminderTime, st.reminderDays, cur.started)) {
        add('workout', 'وقت التمرين', `الدور على: ${title}`, date, { kind: KIND });
      }
    });
  }
  return out;
}

const schedule = (p: Planned) =>
  Notifications.scheduleNotificationAsync({
    content: { title: p.title, body: p.body, sound: true, data: p.data },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(p.at), channelId: 'reminder' },
  });

/**
 * Brings our scheduled reminders in line with the current settings and log. The plan is built as data and hashed; when
 * it's the one last handed over today and the OS still holds as many of ours as we scheduled, nothing is touched
 * (a set tick or a water cup no longer cancels and reschedules ~50 notifications). Otherwise ours are cancelled and
 * the plan scheduled again.
 */
export function syncReminders(): Promise<void> {
  if (!native) return Promise.resolve();
  const go = async () => {
    const plan = planReminders();
    let granted = false;
    try {
      granted = (await Notifications.getPermissionsAsync()).granted;
    } catch (e) {
      report(e, 'reminders:permission');
    }
    // Without the list we can't tell which are ours, and scheduling again would double them.
    let scheduled: Notifications.NotificationRequest[];
    try {
      scheduled = await Notifications.getAllScheduledNotificationsAsync();
    } catch (e) {
      report(e, 'reminders:list');
      return;
    }
    const ours = scheduled.filter(isOurs);
    const want: Applied = { h: hashText(stableJson(plan)), day: dateKey(), n: 0 };
    const last = readApplied();
    if (granted && last && last.h === want.h && last.day === want.day && last.n === ours.length) return;
    let ok = true;
    for (const n of ours) {
      if (!(await tryBlock('cancel', () => Notifications.cancelScheduledNotificationAsync(n.identifier)))) ok = false;
    }
    if (!granted) {
      if (last) writeApplied(null);
      return;
    }
    // Schedule block by block: a failed call drops the rest of its block only.
    const failed = new Set<string>();
    for (const p of plan) {
      if (failed.has(p.block)) continue;
      if (await tryBlock(p.block, () => schedule(p))) want.n++;
      else failed.add(p.block);
    }
    // Anything that failed: forget the plan so the next sync tries again in full.
    writeApplied(ok && !failed.size ? want : null);
  };
  // One sync at a time; a change while one runs queues another after it.
  running = (running ?? Promise.resolve()).then(go).catch((e) => report(e, 'reminders'));
  return running;
}

/** Runs one native call; a failure is logged under the block's name. */
async function tryBlock(name: string, fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return true;
  } catch (e) {
    report(e, `reminders:${name}`);
    return false;
  }
}

/** Each habit with a reminder: its next due days at its time; not today once it's ticked (done or excused). */
function planHabits(today: string, now: Date, add: (block: string, title: string, body: string, date: Date, data: Record<string, unknown>) => void) {
  const st = useSettings.getState();
  const habits = readHabits().filter((h) => !pausedNow(h) && (h.remind != null || h.at || h.parts?.some((p) => p.at)));
  if (!habits.length) return;
  const hlog = readHabitLog();
  const hparts = readHabitParts();
  const body = (h: Habit) => (h.app ? `${h.cue ? `${h.cue} · ` : ''}دوس تفتح التطبيق` : h.cue ? `${h.cue} · علّم عليها لما تعملها` : 'عادة النهارده: علّم عليها لما تعملها');
  // `url`: a page to open on tap; `app`: an app to open on tap (the habit's, e.g. the Quran app).
  const at = (title: string, text: string, date: Date, url?: string, app?: string) =>
    add('habits', title, text, date, { kind: HABIT, ...(url ? { url } : null), ...(app ? { app } : null) });
  // Prayer-linked times need the location from the prayer times settings.
  const place = st.place;
  for (const h of habits) {
    const marked = !!hlog[logKey(h.id, today)];
    if (h.remind != null) {
      for (const date of reminderTimes(now, h.remind, h.days, marked, 5)) if (dateKey(date) >= h.start) at(h.name, body(h), date, undefined, h.app);
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
        if (t && t > now) at(h.name, body(h), t, undefined, h.app);
      }
      const doneParts = d === today ? partsDone(h, hlog, hparts, today) : [];
      for (const [i, p] of (h.parts ?? []).entries()) {
        if (!p.at || doneParts.includes(i) || (d === today && marked)) continue;
        const t = prayerTime(p.at, d, place, st.prayerMethod);
        const ad = adhkarOf(h, i);
        // An adhkar part opens its list on tap (handled in the root layout).
        if (!t || t <= now) continue;
        if (ad) at(`أذكار ${ADHKAR_AR[ad]}`, 'دوس تفتحها وتعدّ', t, `/adhkar?time=${ad}`);
        else at(`${h.name}: ${p.name}`, 'علّم عليها لما تعملها', t);
      }
    }
  }
}
