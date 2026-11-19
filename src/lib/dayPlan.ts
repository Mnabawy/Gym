// يومي (the first tab's day view): the day as one timeline. What the app already knows sits on it by itself — prayer
// times (when they're on), the meals at their plan times, the workout at the reminder time on a training day — with
// the tasks that have a time as blocks (`Task.time` + `Task.mins`). The gaps between them are free slots to put a
// task in. «أهم ٣» are tasks marked for a day (`Task.top`). Pure: unit tested in __tests__/dayPlan.test.ts.
import { MEAL_ORDER, MEAL_TIME, MEALS, WEEK_MENU, type MealKey } from '../data/nutrition';
import { weekdayOf } from './dates';
import { dayKey } from './journal';
import type { Task } from './tasks';

export type PlanKind = 'prayer' | 'work' | 'meal' | 'gym' | 'task' | 'free';

/** Something with a fixed time that the app knows about (a prayer, a meal, the workout). */
export type Fixed = { kind: 'prayer' | 'work' | 'meal' | 'gym'; id: string; at: number; mins: number; title: string; sub?: string; done?: boolean };

/** One line on the timeline. `at` / `end` are minutes after midnight. */
export type PlanItem = { kind: PlanKind; id: string; at: number; end: number; title: string; sub?: string; done: boolean; task?: Task };

/** A task block with no length set takes this long. */
export const DEFAULT_MINS = 30;
/** A prayer holds this long (for finding free time; it's drawn as a thin line). */
export const PRAYER_MINS = 15;
/** Meals hold this long. */
export const MEAL_MINS = 30;
/** Shorter gaps aren't offered as free time. */
export const MIN_FREE = 30;
/** The day the timeline looks at: 8 in the morning to half past 11 at night. */
export const DAY_START = 8 * 60;
export const DAY_END = 23 * 60 + 30;
/** «أهم ٣». */
export const TOP_MAX = 3;
/** Lengths offered for a block. */
export const BLOCK_MINS = [25, 50, 90, 120] as const;

const ORDER: Record<PlanKind, number> = { prayer: 0, work: 1, meal: 2, gym: 3, task: 4, free: 5 };
/** Free time starts on a quarter hour (12:15, not 12:01 after a prayer). */
const ceil15 = (m: number) => Math.ceil(m / 15) * 15;

/** A task's block: from its time for its length (or `DEFAULT_MINS`). */
export const taskEnd = (t: Pick<Task, 'time' | 'mins'>) => (t.time ?? 0) + (t.mins ?? DEFAULT_MINS);

/**
 * The plan's meal times are words («8 الصبح», «بعد التمرين», «قبل التمرين بساعة»…): their minutes on a day, from the
 * workout when there is one. «أي وقت» has no time and stays off the timeline.
 */
export function mealAt(meal: MealKey, training: boolean, gym: { at: number; end: number } | null): number | null {
  const text = training ? MEAL_TIME[meal].training : MEAL_TIME[meal].rest;
  if (text.includes('قبل التمرين')) return gym ? Math.max(0, gym.at - 60) : null;
  if (text.includes('بعد التمرين')) return gym ? gym.end : null;
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(الصبح|الضهر|العصر|بالليل)?/.exec(text);
  if (m) {
    const h = Number(m[1]) % 12;
    const pm = m[3] === 'الضهر' ? h < 11 : m[3] === 'العصر' || m[3] === 'بالليل';
    return (h + (pm ? 12 : 0)) * 60 + Number(m[2] ?? 0);
  }
  if (text === 'بالليل') return meal === 'السناك' ? 22 * 60 : 20 * 60;
  return null;
}

/** Each meal's dish that day: the one you picked (meta mealPicks), else the week menu's (same as the morning brief). */
export function mealNames(date: string, picks: Record<string, number>): Partial<Record<MealKey, string>> {
  const menu = WEEK_MENU.find((d) => d.weekday === weekdayOf(date));
  const out: Partial<Record<MealKey, string>> = {};
  for (const m of MEAL_ORDER) {
    const opts = MEALS.find((o) => o.meal === m)?.options ?? [];
    const i = picks[dayKey(date, m)];
    const opt = opts[i != null && opts[i] ? i : (menu?.picks[m] ?? 0)];
    if (opt) out[m] = opt.name;
  }
  return out;
}

/** The meals with a time that day, in order, with whether they're ticked. */
export function mealsOn(training: boolean, gym: { at: number; end: number } | null, names: Partial<Record<MealKey, string>>, ticked: ReadonlySet<string>): Fixed[] {
  const out: Fixed[] = [];
  for (const meal of MEAL_ORDER) {
    const at = mealAt(meal, training, gym);
    if (at == null) continue;
    out.push({ kind: 'meal', id: `meal:${meal}`, at, mins: MEAL_MINS, title: meal, sub: names[meal], done: ticked.has(meal) });
  }
  return out;
}

/**
 * The day's timeline: the fixed things, that day's tasks with a time (open, or finished that day), and the free gaps
 * of at least `MIN_FREE` between `DAY_START` and `DAY_END` — from now on, when `now` is given (today).
 */
export function buildDay(x: { date: string; fixed: readonly Fixed[]; tasks: readonly Task[]; now: number | null; start?: number; end?: number }): PlanItem[] {
  const start = x.start ?? DAY_START;
  const end = x.end ?? DAY_END;
  const items: PlanItem[] = x.fixed.map((f) => ({ kind: f.kind, id: f.id, at: f.at, end: f.at + f.mins, title: f.title, sub: f.sub, done: !!f.done }));
  for (const t of x.tasks) {
    if (t.time == null || t.due !== x.date || (t.done && t.done !== x.date)) continue;
    items.push({ kind: 'task', id: t.id, at: t.time, end: taskEnd(t), title: t.title, done: !!t.done, task: t });
  }
  // Free time: walk the busy spans in order and keep the gaps (work hours are busy too: their own row opens a slot).
  const busy = items.map((i) => [i.at, i.kind === 'prayer' ? i.at + PRAYER_MINS : i.end] as const).sort((a, b) => a[0] - b[0]);
  let from = x.now != null ? Math.max(start, x.now) : start;
  for (const [a, b] of [...busy, [end, end] as const]) {
    const to = Math.min(a, end);
    const at = ceil15(from);
    if (to - at >= MIN_FREE) items.push({ kind: 'free', id: `free:${at}`, at, end: to, title: '', done: false });
    from = Math.max(from, b);
    if (from >= end) break;
  }
  return items.sort((a, b) => a.at - b.at || ORDER[a.kind] - ORDER[b.kind]);
}

/** What's on now (a block, the workout or a meal you haven't ticked; work hours only when nothing else is), or null. */
export function nowItem(items: readonly PlanItem[], now: number): PlanItem | null {
  const on = items.filter((i) => i.kind !== 'prayer' && i.kind !== 'free' && !i.done && i.at <= now && now < i.end);
  return on.find((i) => i.kind !== 'work') ?? on[0] ?? null;
}

/** Past lines folded under «فات»: prayers, work hours, and what's done. A meal not ticked or a task not done stays. */
export function splitPast(items: readonly PlanItem[], now: number): { past: PlanItem[]; rest: PlanItem[] } {
  const past: PlanItem[] = [];
  const rest: PlanItem[] = [];
  for (const i of items) {
    const over = (i.kind === 'prayer' ? i.at + PRAYER_MINS : i.end) <= now;
    if (over && (i.kind === 'prayer' || i.kind === 'work' || i.done)) past.push(i);
    else rest.push(i);
  }
  return { past, rest };
}

/** The first free slot that fits `mins` (else the first long enough to start in), for «حط وقت». */
export function firstFree(items: readonly PlanItem[], mins: number): { at: number; end: number } | null {
  const free = items.filter((i) => i.kind === 'free');
  const fit = free.find((i) => i.end - i.at >= mins) ?? free[0];
  return fit ? { at: fit.at, end: fit.end } : null;
}

/**
 * What to do with the time you have now: when nothing is on (or only work hours) and there's a free stretch of at
 * least 25 min starting within a quarter hour, the first open «أهم ٣» pick that has no time yet (a work one first
 * during work hours). Null otherwise.
 */
export function suggest(items: readonly PlanItem[], top: readonly Task[], now: number, date: string): { task: Task; at: number; end: number } | null {
  const cur = nowItem(items, now);
  if (cur && cur.kind !== 'work') return null;
  const slot = cur ? { at: now, end: cur.end } : items.find((i) => i.kind === 'free' && i.at <= now + 15 && i.end - Math.max(i.at, now) >= 25);
  if (!slot) return null;
  const open = top.filter((t) => !t.done && (t.time == null || t.due !== date));
  const task = (cur ? open.find((t) => t.space === 'work') : null) ?? open[0];
  return task ? { task, at: Math.max(slot.at, now), end: slot.end } : null;
}

/** The next thing that starts after now (free time doesn't count). */
export const nextItem = (items: readonly PlanItem[], now: number) => items.find((i) => i.kind !== 'free' && i.at > now) ?? null;

/** «أهم ٣» for a day: the tasks marked for it, open first, then by priority. */
export const topFor = (tasks: readonly Task[], date: string) =>
  tasks.filter((t) => t.top === date && (!t.done || t.done === date)).sort((a, b) => Number(!!a.done) - Number(!!b.done) || a.priority - b.priority).slice(0, TOP_MAX);

/** Tasks that could go in a free slot: open, with no time, for that day, late, or with no day (top picks first). */
export function unscheduled(tasks: readonly Task[], date: string): Task[] {
  return tasks
    .filter((t) => !t.done && (t.due == null || t.due < date || (t.due === date && t.time == null)))
    .sort((a, b) => Number(b.top === date) - Number(a.top === date) || Number(b.due === date) - Number(a.due === date) || Number(b.due != null) - Number(a.due != null) || a.priority - b.priority);
}

/** What's still open from a day or before (the evening plan asks about each: بكرة or بعدين). */
export const leftovers = (tasks: readonly Task[], date: string) => tasks.filter((t) => !t.done && t.due != null && t.due <= date);

/** Moving a task to another day drops its time and its «أهم ٣» mark (they were for that day). */
export function moveTo(t: Task, day: string | null): Task {
  const { top: _top, ...rest } = t;
  return { ...rest, due: day, time: null, remind: false };
}

/**
 * Marks a task as one of «أهم ٣» for a day. A task from before that day moves to it; its time and reminder were for
 * the old day, so they go (you set a new time on يومي).
 */
export function pickFor(t: Task, date: string): Task {
  if (t.due != null && t.due >= date) return { ...t, top: date };
  return { ...t, top: date, due: date, time: null, remind: false };
}

/** Puts a task in a slot: that day, at that time, for that long. */
export const placeAt = (t: Task, date: string, at: number, mins: number): Task => ({ ...t, due: date, time: at, mins });

/** Start times offered for a free slot: its start, then every half hour while there's room for a short block. */
export function slotStarts(at: number, end: number): number[] {
  const out = [at];
  for (let m = Math.ceil((at + 1) / 30) * 30; m <= end - 25 && out.length < 3; m += 30) out.push(m);
  return out;
}

/** «ساعتين» / «ساعة ونص» / «45 د» */
export function spanAr(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (!h) return `${m} د`;
  const hs = h === 1 ? 'ساعة' : h === 2 ? 'ساعتين' : `${h} ساعات`;
  if (!m) return hs;
  if (m === 30) return `${hs} ونص`;
  if (m === 15) return `${hs} وربع`;
  return `${hs} و${m} د`;
}

/** 12-hour clock without the part of day: «2:40», «12:00». */
export function hm(m: number): string {
  const h = Math.floor(m / 60) % 12 || 12;
  return `${h}:${String(m % 60).padStart(2, '0')}`;
}
