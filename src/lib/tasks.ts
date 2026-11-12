// مهامي (the to-do section): tasks with an optional day and time (picked on a calendar and a clock, never guessed
// from the text), a priority (1 = most important … 4 = someday), a tag, a note, sub-steps, repeat and a reminder.
// Views: Today (overdue + today + done today), Calendar (a month with a dot per busy day, then that day's tasks), and
// All (everything open, by day, then the ones with no day). Saved as JSON in storage meta `tasks`.
// Pure — unit tested in __tests__/tasks.test.ts.
import { addDays } from './gaps';
import { weekdayOf } from './logic';

export const TASKS_KEY = 'tasks';
export type Priority = 1 | 2 | 3 | 4;
export type Repeat = 'daily' | 'weekdays' | 'weekly' | 'monthly';
export type Sub = { id: string; title: string; done: boolean };
export type Task = {
  id: string;
  title: string;
  /** Day it's for (YYYY-MM-DD), or null (any time). */
  due: string | null;
  /** Minutes after midnight, or null. */
  time: number | null;
  priority: Priority;
  tag?: string;
  note?: string;
  subs: Sub[];
  repeat: Repeat | null;
  /** A notification at the day + time. */
  remind: boolean;
  /** Day it was done, or null. */
  done: string | null;
  created: string;
  /** A done copy of a repeating task: the task it came from, and the day it was for (to undo). */
  from?: string;
  wasDue?: string | null;
  /** Which list it's on: «خاص» (personal, the default when missing) or «شغل» (work). */
  space?: Space;
  /** Made from a goal's step (src/lib/goalTasks.ts): ticking one ticks the other. */
  goal?: GoalLink;
};

/** A task that came from a goal's step: the goal's id and the step's id. */
export type GoalLink = { goal: string; step: string };

/** Two separate to-do lists on the same page: personal and work. */
export type Space = 'personal' | 'work';
export const SPACES: Record<Space, string> = { personal: 'خاص', work: 'شغل' };
export const spaceOf = (t: Task): Space => t.space ?? 'personal';
export const inSpace = (list: readonly Task[], s: Space): Task[] => list.filter((t) => spaceOf(t) === s);

export const PRIORITY = {
  1: { label: 'مهم جدًا', color: '#FF3B30' },
  2: { label: 'مهم', color: '#FF9500' },
  3: { label: 'عادي', color: '#007AFF' },
  4: { label: 'بعدين', color: '#8E8E93' },
} as const;
export const REPEAT_AR: Record<Repeat, string> = { daily: 'كل يوم', weekdays: 'أيام الشغل', weekly: 'كل أسبوع', monthly: 'كل شهر' };
export const TAG_COLORS = ['#3B7BE0', '#3E9A68', '#7A5CFA', '#E0609B', '#D55E00', '#1BA6A8', '#B9A200'];
/** One color per tag, the same every time. */
export function tagColor(tag: string): string {
  let h = 0;
  for (const c of tag) h = (h * 31 + c.charCodeAt(0)) | 0;
  return TAG_COLORS[Math.abs(h) % TAG_COLORS.length];
}

const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const str = (s: unknown) => (typeof s === 'string' ? s : '');

export function parseTasks(raw: string | null): Task[] {
  let data: unknown;
  try {
    data = JSON.parse(raw ?? '[]');
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const seen = new Set<string>();
  const out: Task[] = [];
  for (const x of data) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    if (typeof o.id !== 'string' || seen.has(o.id) || !str(o.title).trim()) continue;
    seen.add(o.id);
    const p = o.priority;
    const time = typeof o.time === 'number' && o.time >= 0 && o.time < 1440 ? Math.round(o.time) : null;
    out.push({
      id: o.id,
      title: str(o.title).trim(),
      due: isDate(o.due) ? o.due : null,
      time,
      priority: p === 1 || p === 2 || p === 3 || p === 4 ? p : 3,
      ...(str(o.tag).trim() ? { tag: str(o.tag).trim() } : {}),
      ...(str(o.note).trim() ? { note: str(o.note).trim() } : {}),
      subs: (Array.isArray(o.subs) ? o.subs : [])
        .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object' && typeof (s as Record<string, unknown>).id === 'string' && !!str((s as Record<string, unknown>).title).trim())
        .map((s) => ({ id: s.id as string, title: str(s.title).trim(), done: s.done === true })),
      repeat: o.repeat === 'daily' || o.repeat === 'weekdays' || o.repeat === 'weekly' || o.repeat === 'monthly' ? o.repeat : null,
      remind: o.remind === true && time != null,
      done: isDate(o.done) ? o.done : null,
      created: isDate(o.created) ? o.created : '2026-01-01',
      ...(typeof o.from === 'string' ? { from: o.from, wasDue: isDate(o.wasDue) ? o.wasDue : null } : {}),
      ...(o.space === 'work' ? { space: 'work' as const } : {}),
      ...(o.goal && typeof o.goal === 'object' && typeof (o.goal as Record<string, unknown>).goal === 'string' && typeof (o.goal as Record<string, unknown>).step === 'string'
        ? { goal: { goal: (o.goal as Record<string, string>).goal, step: (o.goal as Record<string, string>).step } }
        : {}),
    });
  }
  return out;
}

export const taskId = (now: number = Date.now(), n = 0) => `t${now.toString(36)}${n ? `-${n}` : ''}`;

/** The next day a repeating task is due after `from`. Work days are Sunday–Thursday (Egypt). */
export function nextDue(from: string, repeat: Repeat): string {
  if (repeat === 'daily') return addDays(from, 1);
  if (repeat === 'weekly') return addDays(from, 7);
  if (repeat === 'weekdays') {
    let d = addDays(from, 1);
    while (weekdayOf(d) === 5 || weekdayOf(d) === 6) d = addDays(d, 1);
    return d;
  }
  const [y, m, day] = from.split('-').map(Number);
  const last = new Date(y, m + 1, 0).getDate(); // days in next month
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
}

/**
 * Ticks a task on or off. A repeating task ticked on leaves a done copy for today and moves on to its next day;
 * unticking that copy puts the task back where it was.
 */
export function toggleTask(list: readonly Task[], id: string, today: string, newId: string): Task[] {
  const t = list.find((x) => x.id === id);
  if (!t) return [...list];
  if (t.done) {
    if (t.from) {
      return list.filter((x) => x.id !== id).map((x) => (x.id === t.from ? { ...x, due: t.wasDue ?? x.due } : x));
    }
    return list.map((x) => (x.id === id ? { ...x, done: null } : x));
  }
  if (t.repeat) {
    const base = t.due ?? today;
    const copy: Task = { ...t, id: newId, repeat: null, remind: false, done: today, from: t.id, wasDue: t.due, subs: t.subs.map((s) => ({ ...s, done: true })) };
    let next = nextDue(base, t.repeat);
    while (next <= today) next = nextDue(next, t.repeat);
    return [...list.map((x) => (x.id === id ? { ...x, due: next, subs: x.subs.map((s) => ({ ...s, done: false })) } : x)), copy];
  }
  return list.map((x) => (x.id === id ? { ...x, done: today } : x));
}

/** Subtasks: tick one on or off, add one at the end, remove one. */
export const toggleSub = (t: Task, subId: string): Task => ({ ...t, subs: t.subs.map((x) => (x.id === subId ? { ...x, done: !x.done } : x)) });
export const addSub = (t: Task, title: string, id: string): Task => (title.trim() ? { ...t, subs: [...t.subs, { id, title: title.trim(), done: false }] } : t);
export const removeSub = (t: Task, subId: string): Task => ({ ...t, subs: t.subs.filter((x) => x.id !== subId) });

const byOrder = (a: Task, b: Task) => (a.time ?? 9999) - (b.time ?? 9999) || a.priority - b.priority || (a.created < b.created ? -1 : 1);

/** Today: what's overdue, what's for today (by time, then priority), and what you finished today. */
export function todayView(list: readonly Task[], today: string) {
  const open = list.filter((t) => !t.done);
  return {
    overdue: open.filter((t) => t.due != null && t.due < today).sort((a, b) => (a.due! < b.due! ? -1 : a.due! > b.due! ? 1 : 0) || a.priority - b.priority),
    day: open.filter((t) => t.due === today).sort(byOrder),
    done: list.filter((t) => t.done === today).sort((a, b) => a.priority - b.priority),
  };
}

/** Open tasks due on one day, by time then priority. */
export const dayTasks = (list: readonly Task[], date: string) => list.filter((t) => !t.done && t.due === date).sort(byOrder);
/** Tasks finished on one day. */
export const doneOn = (list: readonly Task[], date: string) => list.filter((t) => t.done === date).sort((a, b) => a.priority - b.priority);

/** Open tasks per due day (the calendar's dots). */
export function dueCounts(list: readonly Task[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of list) if (!t.done && t.due) out[t.due] = (out[t.due] ?? 0) + 1;
  return out;
}

/** All: everything open — overdue, then by day — and last the ones with no day (most important first). */
export function allView(list: readonly Task[], today: string): { date: string | null; late: boolean; tasks: Task[] }[] {
  const open = list.filter((t) => !t.done);
  const days = [...new Set(open.map((t) => t.due).filter((d): d is string => !!d))].sort();
  const late = days.filter((d) => d < today);
  const out: { date: string | null; late: boolean; tasks: Task[] }[] = [];
  if (late.length) out.push({ date: late[0], late: true, tasks: open.filter((t) => t.due != null && t.due < today).sort((a, b) => (a.due! < b.due! ? -1 : 1) || a.priority - b.priority) });
  for (const d of days) if (d >= today) out.push({ date: d, late: false, tasks: dayTasks(open, d) });
  const none = open.filter((t) => !t.due).sort((a, b) => a.priority - b.priority || (a.created < b.created ? -1 : 1));
  if (none.length) out.push({ date: null, late: false, tasks: none });
  return out;
}

export const counts = (list: readonly Task[], today: string) => {
  const v = todayView(list, today);
  return { today: v.overdue.length + v.day.length, doneToday: v.done.length, open: list.filter((t) => !t.done).length };
};

/** Tasks done between two days (the weekly report). */
export const doneBetween = (list: readonly Task[], from: string, to: string) => list.filter((t) => t.done && t.done >= from && t.done <= to).length;

// ——— Calendar and clock ———

/** The week starts on Saturday (Egypt). */
export const WEEK_START = 6;
const pad = (n: number) => String(n).padStart(2, '0');
/** `2026-11` + n months. */
export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const i = y * 12 + (m - 1) + n;
  return `${Math.floor(i / 12)}-${pad((i % 12) + 1)}`;
}
/** A month as weeks of 7 days from Saturday; days outside the month are null. */
export function monthGrid(ym: string): (string | null)[][] {
  const [y, m] = ym.split('-').map(Number);
  const days = new Date(y, m, 0).getDate();
  const lead = (new Date(y, m - 1, 1).getDay() - WEEK_START + 7) % 7;
  const cells: (string | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${ym}-${pad(i + 1)}`)];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}
/** Minutes after midnight → 12-hour clock. */
export const to12 = (m: number) => ({ h: Math.floor(m / 60) % 12 || 12, min: m % 60, pm: m >= 720 });
/** 12-hour clock → minutes after midnight. */
export const from12 = (h: number, min: number, pm: boolean) => ((h % 12) + (pm ? 12 : 0)) * 60 + min;

/** "5 العصر" / "9:30 الصبح" */
export function timeAr(m: number): string {
  const h = Math.floor(m / 60);
  const mi = m % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const part = h < 12 ? 'الصبح' : h < 15 ? 'الضهر' : h < 18 ? 'العصر' : 'بالليل';
  return `${h12}${mi ? `:${String(mi).padStart(2, '0')}` : ''} ${part}`;
}

// ---- Deleted tasks (المحذوفة): kept 30 days so a delete can be taken back later, not only from the undo bar ----

export const TRASH_KEY = 'taskTrash';
/** `id` = the task's id (so cloud sync can keep one row per deleted task). */
export type Trashed = { id: string; task: Task; at: string };

export function parseTrash(raw: string | null): Trashed[] {
  try {
    const v = JSON.parse(raw ?? '[]');
    if (!Array.isArray(v)) return [];
    return v.flatMap((x) => {
      if (!x || typeof x !== 'object' || typeof x.at !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x.at)) return [];
      const [task] = parseTasks(JSON.stringify([x.task]));
      return task ? [{ id: task.id, task, at: x.at }] : [];
    });
  } catch {
    return [];
  }
}

/** Puts a deleted task first in the trash (replacing an older copy of it). */
export const toTrash = (trash: readonly Trashed[], task: Task, at: string): Trashed[] => [{ id: task.id, task, at }, ...trash.filter((x) => x.task.id !== task.id)];

/** Drops what was deleted more than 30 days before `today` and anything that's back in the list (undo, restore). */
export function pruneTrash(trash: readonly Trashed[], tasks: readonly Task[], today: string): Trashed[] {
  const cut = new Date(`${today}T12:00:00`);
  cut.setDate(cut.getDate() - 30);
  const k = cut.toISOString().slice(0, 10);
  const live = new Set(tasks.map((t) => t.id));
  return trash.filter((x) => x.at >= k && !live.has(x.task.id));
}
