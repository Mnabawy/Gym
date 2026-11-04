// Pure logic — unit tested in __tests__/logic.test.ts
import type { Exercise } from '../data/program';
import { FOODS } from '../data/nutrition';

export type SetEntry = { kg: number | null; reps: number | null; done: boolean };

/** Local calendar date as YYYY-MM-DD. */
export function dateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Weekday (0 = Sunday) of a YYYY-MM-DD key, local time. */
export function weekdayOf(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

/** Month `delta` months away; month is 0-based. */
export function addMonths(year: number, month: number, delta: number): { y: number; m: number } {
  const d = new Date(year, month + delta, 1);
  return { y: d.getFullYear(), m: d.getMonth() };
}

/** Calendar grid for a month, weeks starting Saturday; null cells pad the first and last week. */
export function monthCells(year: number, month: number): (string | null)[] {
  const pad = (new Date(year, month, 1).getDay() + 1) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = Array(pad).fill(null);
  for (let d = 1; d <= days; d++) cells.push(dateKey(new Date(year, month, d)));
  while (cells.length % 7) cells.push(null);
  return cells;
}

/**
 * done: trained that day (any day, rest days too).
 * missed: a past training day with nothing done, on or after the first ever session.
 * upcoming: a training day from today on (today isn't missed until it's over).
 * off: rest day, or before tracking started.
 */
export type DayStatus = 'done' | 'missed' | 'upcoming' | 'off';
export function dayStatus(key: string, trained: ReadonlySet<string>, plan: readonly number[], today: string, since: string | undefined): DayStatus {
  if (trained.has(key)) return 'done';
  if (!plan.includes(weekdayOf(key))) return 'off';
  if (key >= today) return 'upcoming';
  return since && key >= since ? 'missed' : 'off';
}

/** Attendance for one month's cells. rate = done / (done + missed), null when there's nothing to judge yet. */
export function monthStats(cells: (string | null)[], trained: ReadonlySet<string>, plan: readonly number[], today: string, since: string | undefined) {
  let done = 0, missed = 0, left = 0;
  for (const k of cells) {
    if (!k) continue;
    const st = dayStatus(k, trained, plan, today, since);
    if (st === 'done') done++;
    else if (st === 'missed') missed++;
    else if (st === 'upcoming') left++;
  }
  return { done, missed, left, rate: done + missed ? done / (done + missed) : null };
}

/** Friday that starts the shopping week containing d (shopping resets every Friday). */
export function shopWeekKey(d: Date = new Date()): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const back = (x.getDay() - 5 + 7) % 7; // days since last Friday
  x.setDate(x.getDate() - back);
  return dateKey(x);
}

/** Suggest adding weight when every set of the last session hit the top of the rep range. */
export function shouldIncrease(ex: Exercise, last: SetEntry[] | undefined): boolean {
  if (!last || last.length < ex.sets) return false;
  return last.slice(0, ex.sets).every((s) => (s.reps ?? 0) >= ex.repHigh && (s.kg ?? 0) > 0);
}

/** Epley estimated 1RM. */
export function epley(kg: number, reps: number): number {
  if (kg <= 0 || reps <= 0) return 0;
  if (reps === 1) return kg;
  return Math.round(kg * (1 + reps / 30) * 10) / 10;
}

export function bestE1rm(sets: SetEntry[]): number {
  return sets.reduce((m, s) => Math.max(m, epley(s.kg ?? 0, s.reps ?? 0)), 0);
}

/** Parse a user-typed number ("82,5" → 82.5). Empty or invalid → null. */
export function parseNum(v: string): number | null {
  const t = v.replace(',', '.').trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function mealMacros(items: string[]) {
  return items.reduce(
    (a, it) => {
      const f = FOODS[it];
      if (!f) return a;
      return { kcal: a.kcal + f.kcal, p: a.p + f.p, c: a.c + f.c, f: a.f + f.f };
    },
    { kcal: 0, p: 0, c: 0, f: 0 },
  );
}

export function formatClock(ms: number): string {
  const over = ms < 0;
  const s = Math.round(Math.abs(ms) / 1000);
  return `${over ? '+' : ''}${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Arabic count phrase: 1 → "مرة", 2 → "مرتين", 3–10 → "3 مرات", 11+ → "11 مرة".
 * forms = [one, two, plural (3–10), singular for 11+].
 */
export function countAr(n: number, [one, two, few, many]: readonly [string, string, string, string]): string {
  if (n === 1) return one;
  if (n === 2) return two;
  return n >= 3 && n <= 10 ? `${n} ${few}` : `${n} ${many}`;
}
export const TIMES: [string, string, string, string] = ['مرة', 'مرتين', 'مرات', 'مرة'];
export const SETS: [string, string, string, string] = ['مجموعة', 'مجموعتين', 'مجموعات', 'مجموعة'];
export const WEEKS: [string, string, string, string] = ['أسبوع', 'أسبوعين', 'أسابيع', 'أسبوع'];
export const DAYS: [string, string, string, string] = ['يوم', 'يومين', 'أيام', 'يوم'];

/**
 * Which verse to show next: walks the list in order so every verse comes up once before any repeats.
 * No (or a stale) previous index → start somewhere random.
 */
export function nextVerseIndex(last: number | null, count: number, rand: () => number = Math.random): number {
  if (last == null || !Number.isInteger(last) || last < 0 || last >= count) return Math.floor(rand() * count);
  return (last + 1) % count;
}

/** 286 → "٢٨٦" (verse references use Arabic-Indic digits). */
export function arabicDigits(v: number | string): string {
  return String(v).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
}
