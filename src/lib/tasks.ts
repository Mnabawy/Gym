// مهامي (the to-do section): tasks with a due day and time, a priority (1 = most important … 4 = someday), a tag,
// sub-steps, repeat and a reminder. Views like the best to-do apps: Today (overdue + today + this evening, as in
// Things 3), Upcoming (by day), Anytime (no date), and the Eisenhower matrix (urgent × important, as in TickTick).
// Quick add reads Egyptian Arabic the way Todoist reads English: "كلّم المحاسب بكره 5 العصر !1 #فلوس".
// Saved as JSON in storage meta `tasks`. Pure — unit tested in __tests__/tasks.test.ts.
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
  /** Put under "بالليل" on the day. */
  evening?: boolean;
  priority: Priority;
  tag?: string;
  subs: Sub[];
  repeat: Repeat | null;
  /** A notification at the day + time. */
  remind: boolean;
  /** Day it was done, or null. */
  done: string | null;
  created: string;
  /** Matrix override: urgent or not, whatever the date says. */
  urgent?: boolean;
  /** A done copy of a repeating task: the task it came from, and the day it was for (to undo). */
  from?: string;
  wasDue?: string | null;
};

export const PRIORITY = {
  1: { label: 'مهم جدًا', color: '#D93B3B' },
  2: { label: 'مهم', color: '#E8902A' },
  3: { label: 'عادي', color: '#3B7BE0' },
  4: { label: 'بعدين', color: '#B4ADA2' },
} as const;
export const REPEAT_AR: Record<Repeat, string> = { daily: 'كل يوم', weekdays: 'أيام الشغل', weekly: 'كل أسبوع', monthly: 'كل شهر' };
export const TAG_COLORS = ['#3B7BE0', '#3E9A68', '#7A5CFA', '#E0609B', '#D55E00', '#1BA6A8', '#B9A200'];
/** One color per tag, the same every time. */
export function tagColor(tag: string): string {
  let h = 0;
  for (const c of tag) h = (h * 31 + c.charCodeAt(0)) | 0;
  return TAG_COLORS[Math.abs(h) % TAG_COLORS.length];
}
/** Evening starts at 6 pm. */
export const EVENING = 18 * 60;

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
      ...(o.evening === true ? { evening: true } : {}),
      priority: p === 1 || p === 2 || p === 3 || p === 4 ? p : 3,
      ...(str(o.tag).trim() ? { tag: str(o.tag).trim() } : {}),
      subs: (Array.isArray(o.subs) ? o.subs : [])
        .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object' && typeof (s as Record<string, unknown>).id === 'string' && !!str((s as Record<string, unknown>).title).trim())
        .map((s) => ({ id: s.id as string, title: str(s.title).trim(), done: s.done === true })),
      repeat: o.repeat === 'daily' || o.repeat === 'weekdays' || o.repeat === 'weekly' || o.repeat === 'monthly' ? o.repeat : null,
      remind: o.remind === true && time != null,
      done: isDate(o.done) ? o.done : null,
      created: isDate(o.created) ? o.created : '2026-01-01',
      ...(typeof o.urgent === 'boolean' ? { urgent: o.urgent } : {}),
      ...(typeof o.from === 'string' ? { from: o.from, wasDue: isDate(o.wasDue) ? o.wasDue : null } : {}),
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

const byOrder = (a: Task, b: Task) => (a.time ?? 9999) - (b.time ?? 9999) || a.priority - b.priority || (a.created < b.created ? -1 : 1);

/** Today: what's overdue, what's for today (the day and the evening), and what you finished today. */
export function todayView(list: readonly Task[], today: string) {
  const open = list.filter((t) => !t.done);
  const day = open.filter((t) => t.due === today);
  const isEvening = (t: Task) => t.evening || (t.time != null && t.time >= EVENING);
  return {
    overdue: open.filter((t) => t.due != null && t.due < today).sort((a, b) => (a.due! < b.due! ? -1 : 1) || a.priority - b.priority),
    day: day.filter((t) => !isEvening(t)).sort(byOrder),
    evening: day.filter(isEvening).sort(byOrder),
    done: list.filter((t) => t.done === today).sort((a, b) => a.priority - b.priority),
  };
}

/** Upcoming: open tasks after today, by day. */
export function upcoming(list: readonly Task[], today: string): { date: string; tasks: Task[] }[] {
  const days = new Map<string, Task[]>();
  for (const t of list) if (!t.done && t.due && t.due > today) days.set(t.due, [...(days.get(t.due) ?? []), t]);
  return [...days.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, tasks]) => ({ date, tasks: tasks.sort(byOrder) }));
}

/** Anytime: open tasks with no day, most important first. */
export const anytime = (list: readonly Task[]) => list.filter((t) => !t.done && !t.due).sort((a, b) => a.priority - b.priority || (a.created < b.created ? -1 : 1));

export type Quadrant = 'do' | 'plan' | 'quick' | 'drop';
export const QUADRANTS: { key: Quadrant; title: string; sub: string; color: string; urgent: boolean; important: boolean }[] = [
  { key: 'do', title: 'اعملها دلوقتي', sub: 'عاجل ومهم', color: '#D93B3B', urgent: true, important: true },
  { key: 'plan', title: 'حدّدلها ميعاد', sub: 'مهم مش عاجل', color: '#3B7BE0', urgent: false, important: true },
  { key: 'quick', title: 'خلّصها بسرعة', sub: 'عاجل مش مهم', color: '#E8902A', urgent: true, important: false },
  { key: 'drop', title: 'سيبها', sub: 'لا عاجل ولا مهم', color: '#B4ADA2', urgent: false, important: false },
];

/** Urgent: due by tomorrow (or overdue), unless you said otherwise. Important: priority 1 or 2. */
export function quadrantOf(t: Task, today: string): Quadrant {
  const urgent = t.urgent ?? (t.due != null && t.due <= addDays(today, 1));
  const important = t.priority <= 2;
  return QUADRANTS.find((q) => q.urgent === urgent && q.important === important)!.key;
}

/** Moving a task to a quadrant: sets "urgent" and raises or lowers the priority across the important line. */
export function moveToQuadrant(t: Task, q: Quadrant): Task {
  const target = QUADRANTS.find((x) => x.key === q)!;
  const priority: Priority = target.important ? (t.priority <= 2 ? t.priority : 2) : t.priority >= 3 ? t.priority : 3;
  return { ...t, urgent: target.urgent, priority };
}

export const counts = (list: readonly Task[], today: string) => {
  const v = todayView(list, today);
  return { today: v.overdue.length + v.day.length + v.evening.length, doneToday: v.done.length, upcoming: upcoming(list, today).reduce((a, d) => a + d.tasks.length, 0), anytime: anytime(list).length };
};

/** Tasks done between two days (the weekly report). */
export const doneBetween = (list: readonly Task[], from: string, to: string) => list.filter((t) => t.done && t.done >= from && t.done <= to).length;

// ——— Quick add ———

export type Span = { start: number; end: number; kind: 'date' | 'time' | 'priority' | 'tag' | 'repeat' };
export type Parsed = { title: string; due: string | null; time: number | null; evening: boolean; priority: Priority | null; tag: string | null; repeat: Repeat | null; spans: Span[] };

/** Weekday names without "ال" (0 = Sunday). */
const DAYS: [string, number][] = [
  ['أحد|احد|حد', 0],
  ['اتنين|إثنين|اثنين', 1],
  ['تلات|ثلاثاء|تلاتاء', 2],
  ['أربعاء|اربعاء|أربع|اربع', 3],
  ['خميس', 4],
  ['جمعة|جمعه', 5],
  ['سبت', 6],
];
const PM = /^(?:العصر|المغرب|بالليل|بليل|مساء|مساءً|م)$/;
const AM = /^(?:الصبح|صباحا|صباحًا|ص|بدري)$/;

const toLatin = (s: string) => s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660));

/**
 * Reads a quick-add line: the day (النهارده، بكره، بعد بكره، امبارح، a weekday, الأسبوع الجاي، كمان 3 أيام), the time
 * (5 العصر، 9:30 الصبح، الساعة 7، الضهر، بالليل), priority (!1–!4, or !!! / !!), a #tag and repeat (كل يوم/أسبوع/شهر،
 * كل خميس، أيام الشغل). What's left is the title. `spans` mark the parts it understood, to color them as you type.
 */
export function parseQuick(input: string, today: string): Parsed {
  const text = toLatin(input);
  const spans: Span[] = [];
  let due: string | null = null;
  let time: number | null = null;
  let evening = false;
  let priority: Priority | null = null;
  let tag: string | null = null;
  let repeat: Repeat | null = null;
  const take = (re: RegExp, kind: Span['kind'], f: (m: RegExpExecArray) => void) => {
    const m = re.exec(text);
    if (!m || spans.some((s) => m.index < s.end && m.index + m[0].length > s.start)) return false;
    spans.push({ start: m.index, end: m.index + m[0].length, kind });
    f(m);
    return true;
  };
  const nextWeekday = (wd: number, includeToday: boolean) => {
    for (let i = includeToday ? 0 : 1; i <= 7; i++) if (weekdayOf(addDays(today, i)) === wd) return addDays(today, i);
    return today;
  };

  // Repeat first ("كل خميس" is a repeat and a day; "كل يوم الخميس" too, before "كل يوم").
  for (const [stem, wd] of DAYS) {
    if (take(new RegExp(`(?:^|\\s)(كل\\s+(?:يوم\\s+)?(?:ال)?(?:${stem}))(?=\\s|$)`), 'repeat', () => {
      repeat = 'weekly';
      due = nextWeekday(wd, true);
    })) break;
  }

  take(/(?:^|\s)(كل\s+(?:يوم|أسبوع|اسبوع|شهر)|أيام الشغل|ايام الشغل)(?=\s|$)/, 'repeat', (m) => {
    const w = m[1];
    repeat = /يوم/.test(w) ? 'daily' : /شهر/.test(w) ? 'monthly' : /الشغل/.test(w) ? 'weekdays' : 'weekly';
  });
  // Day.
  take(/(?:^|\s)(بعد\s+بكر[هة])(?=\s|$)/, 'date', () => (due = addDays(today, 2))) ||
    take(/(?:^|\s)(النهارده|النهاردة|اليوم)(?=\s|$)/, 'date', () => (due = today)) ||
    take(/(?:^|\s)(امبارح|إمبارح|امس|أمس)(?=\s|$)/, 'date', () => (due = addDays(today, -1))) ||
    take(/(?:^|\s)(بكر[هة])(?=\s|$)/, 'date', () => (due = addDays(today, 1))) ||
    take(/(?:^|\s)(الأسبوع الجاي|الاسبوع الجاي)(?=\s|$)/, 'date', () => (due = addDays(today, 7))) ||
    take(/(?:^|\s)(كمان|بعد)\s+(\d+)\s+(?:يوم|أيام|ايام)(?=\s|$)/, 'date', (m) => (due = addDays(today, Number(m[2])))) ||
    DAYS.some(([stem, wd]) => take(new RegExp(`(?:^|\\s)((?:يوم\\s+)?ال(?:${stem}))(?=\\s|$)`), 'date', () => (due = nextWeekday(wd, false))));

  // Time.
  const hm = (h: number, mi: number, period: string | undefined) => {
    let hh = h % 12;
    if (period && PM.test(period)) hh += 12;
    else if (period === 'الضهر' || period === 'الظهر') hh = h === 12 ? 12 : h < 6 ? h + 12 : h;
    else if (!period || !AM.test(period)) hh = h === 12 ? 12 : h < 7 ? h + 12 : h; // no period: 1–6 is afternoon
    return hh * 60 + mi;
  };
  take(/(?:^|\s)(?:الساعة\s+|الساعه\s+)?(\d{1,2})(?::(\d{2}))?\s*(الصبح|صباحا|صباحًا|ص|بدري|الضهر|الظهر|العصر|المغرب|بالليل|بليل|مساء|مساءً|م)(?=\s|$)/, 'time', (m) => {
    time = hm(Number(m[1]), Number(m[2] ?? 0), m[3]);
  }) ||
    take(/(?:^|\s)(?:الساعة|الساعه)\s+(\d{1,2})(?::(\d{2}))?(?=\s|$)/, 'time', (m) => (time = hm(Number(m[1]), Number(m[2] ?? 0), undefined))) ||
    take(/(?:^|\s)(\d{1,2}):(\d{2})(?=\s|$)/, 'time', (m) => (time = hm(Number(m[1]), Number(m[2]), undefined))) ||
    take(/(?:^|\s)(الضهر|الظهر)(?=\s|$)/, 'time', () => (time = 13 * 60)) ||
    take(/(?:^|\s)(بالليل)(?=\s|$)/, 'time', () => (evening = true));
  if (time != null && time >= 24 * 60) time = null;

  // Priority and tag.
  take(/(?:^|\s)(!([1-4])|!{2,3})(?=\s|$)/, 'priority', (m) => {
    priority = (m[2] ? Number(m[2]) : m[1] === '!!!' ? 1 : 2) as Priority;
  });
  take(/(?:^|\s)#([\p{L}\p{M}\p{N}_]+)/u, 'tag', (m) => (tag = m[1]));

  // A time with no day means today (or tomorrow if it's already past is up to you: we keep today).
  if (time != null && !due) due = today;
  if (evening && !due) due = today;

  spans.sort((a, b) => a.start - b.start);
  let title = '';
  let at = 0;
  for (const s of spans) {
    title += input.slice(at, s.start);
    at = s.end;
  }
  title += input.slice(at);
  return { title: title.replace(/\s+/g, ' ').trim(), due, time, evening, priority, tag, repeat, spans };
}

/** "5 العصر" / "9:30 الصبح" */
export function timeAr(m: number): string {
  const h = Math.floor(m / 60);
  const mi = m % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const part = h < 12 ? 'الصبح' : h < 15 ? 'الضهر' : h < 18 ? 'العصر' : 'بالليل';
  return `${h12}${mi ? `:${String(mi).padStart(2, '0')}` : ''} ${part}`;
}
