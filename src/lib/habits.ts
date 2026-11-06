// Habits (the العادات tab): yes/no habits you write yourself, each on the weekdays you choose, with its own results page
// and calendar. Saved as JSON in storage meta: `habits` (the list) and `habitLog` (`habitId|date` → 'done' | 'skip').
// Pure — unit tested in __tests__/habits.test.ts.
//
// What the numbers rest on:
// - Time to automaticity: Lally et al. 2010 (Eur J Soc Psychol) found 66 days on average (18–254); Singh et al. 2024
//   (Healthcare, systematic review) found medians of 59–66 days, means of 106–154 and a range of 4–335, simple habits
//   faster than diet or exercise. So 66 is shown as the typical milestone, not a finish line.
// - Missing a single day didn't hurt habit formation (Lally 2010), so one miss doesn't end a streak; two scheduled days
//   in a row do ("never miss twice"), and after one miss the app says today matters. "skip" (excused) counts as neither.
// - Strength: a moving average over due days (half-life STRENGTH_HALF_LIFE due days), the idea Loop Habit Tracker uses:
//   every repetition raises it, a miss lowers it a little instead of wiping it out.
// - Cue ("امتى وفين؟"): an if-then plan of when and where (implementation intention; Gollwitzer & Sheeran 2006
//   meta-analysis) makes the situation itself the reminder.
import { addDays, daysBetween } from './gaps';
import { weekdayOf } from './logic';

export const HABITS_KEY = 'habits';
export const HABIT_LOG_KEY = 'habitLog';
export const FORM_DAYS = 66;
export const STRENGTH_HALF_LIFE = 13;
export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

export type Habit = {
  id: string;
  name: string;
  icon: string;
  color: string;
  /** Weekdays it's due (0 = Sunday). All seven = every day. */
  days: number[];
  /** Reminder time (minutes after midnight), or null. */
  remind: number | null;
  /** When and where: "بعد الفجر في أوضتي" (optional). */
  cue?: string;
  /** Date it was added: days before it don't count. */
  start: string;
};
export type Mark = 'done' | 'skip';
export type Log = Record<string, Mark>;
export type DayState = 'done' | 'skip' | 'missed' | 'today' | 'off' | 'before' | 'future';

/** Icons and colors to pick from when adding a habit. Colors follow the app's colorblind-safe palette. */
export const HABIT_ICONS = ['book', 'moon', 'walk', 'water', 'leaf', 'bed', 'heart', 'sunny', 'phone-portrait', 'cafe', 'pencil', 'star'] as const;
export const HABIT_COLORS = ['#1BA6A8', '#0072B2', '#D55E00', '#CC79A7', '#E69F00', '#009E73', '#7A5CFA', '#C62828'] as const;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const hex = /^#[0-9A-Fa-f]{6}$/;

export function parseHabits(raw: string | null): Habit[] {
  let v: unknown;
  try {
    v = raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
  if (!Array.isArray(v)) return [];
  const out: Habit[] = [];
  const seen = new Set<string>();
  for (const x of v) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    if (typeof o.id !== 'string' || !o.id || seen.has(o.id) || typeof o.name !== 'string' || !o.name.trim()) continue;
    if (typeof o.start !== 'string' || !DATE.test(o.start)) continue;
    const days = Array.isArray(o.days) ? [...new Set(o.days.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : [];
    if (!days.length) continue;
    seen.add(o.id);
    out.push({
      id: o.id,
      name: o.name.trim(),
      icon: typeof o.icon === 'string' ? o.icon : 'star',
      color: typeof o.color === 'string' && hex.test(o.color) ? o.color : HABIT_COLORS[0],
      days,
      remind: typeof o.remind === 'number' && o.remind >= 0 && o.remind < 1440 ? o.remind : null,
      start: o.start,
      ...(typeof o.cue === 'string' && o.cue.trim() ? { cue: o.cue.trim().slice(0, 60) } : null),
    });
  }
  return out;
}

export function parseLog(raw: string | null): Log {
  const out: Log = {};
  let v: unknown;
  try {
    v = raw ? JSON.parse(raw) : null;
  } catch {
    return out;
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [k, m] of Object.entries(v as Record<string, unknown>)) if ((m === 'done' || m === 'skip') && DATE.test(k.slice(-10))) out[k] = m;
  return out;
}

export const logKey = (id: string, date: string) => `${id}|${date}`;
export const isDue = (h: Habit, date: string) => date >= h.start && h.days.includes(weekdayOf(date));

/** What a day looks like for a habit. */
export function dayState(h: Habit, log: Log, date: string, today: string): DayState {
  if (date > today) return 'future';
  if (date < h.start) return 'before';
  const m = log[logKey(h.id, date)];
  if (m) return m; // a done mark counts even on a day it wasn't due
  if (!h.days.includes(weekdayOf(date))) return 'off';
  return date === today ? 'today' : 'missed';
}

export type HabitStats = {
  /** Done days in a row, not broken by one miss (only by two scheduled misses in a row); skips are neutral. */
  streak: number;
  best: number;
  /** Done ÷ due over the last 30 days and since the start; skips and today (until done) don't count. Null with nothing due yet. */
  rate30: number | null;
  rateAll: number | null;
  done: number;
  /** Done days toward FORM_DAYS (capped). */
  formed: number;
  /** The last due day before today was missed and today isn't done yet: don't miss twice. */
  atRisk: boolean;
  /** Share done per weekday (0 = Sunday), null for weekdays it's never due. */
  byWeekday: (number | null)[];
  /** Habit strength 0–1: rises with each repetition, a miss lowers it a little (see STRENGTH_HALF_LIFE). */
  strength: number;
};

export function habitStats(h: Habit, log: Log, today: string): HabitStats {
  const states: { date: string; s: DayState }[] = [];
  for (let d = h.start; d <= today; d = addDays(d, 1)) states.push({ date: d, s: dayState(h, log, d, today) });

  // Streaks: walk forward; a done adds one; a miss is forgiven once (the streak goes on), a second miss in a row ends it.
  let run = 0, best = 0, misses = 0;
  for (const { s } of states) {
    if (s === 'done') {
      run++;
      misses = 0;
    } else if (s === 'missed') {
      misses++;
      if (misses >= 2) run = 0;
    }
    best = Math.max(best, run);
  }

  const rate = (from: string) => {
    let due = 0, done = 0;
    for (const { date, s } of states) {
      if (date < from) continue;
      if (s === 'done') {
        due++;
        done++;
      } else if (s === 'missed') due++;
    }
    return due ? done / due : null;
  };
  const done = states.filter((x) => x.s === 'done').length;

  const lastDue = [...states].reverse().find((x) => x.date < today && (x.s === 'done' || x.s === 'missed'));
  const todayState = states[states.length - 1]?.s;

  const byWeekday = ALL_DAYS.map((wd) => {
    const on = states.filter((x) => weekdayOf(x.date) === wd && (x.s === 'done' || x.s === 'missed'));
    return on.length ? on.filter((x) => x.s === 'done').length / on.length : null;
  });

  // Strength: each due day (done or missed) pulls it toward 1 or 0; a done day off-schedule counts as a repetition too.
  const keep = 0.5 ** (1 / STRENGTH_HALF_LIFE);
  let strength = 0;
  for (const { s } of states) {
    if (s === 'done') strength = strength * keep + (1 - keep);
    else if (s === 'missed') strength *= keep;
  }

  return {
    streak: run,
    strength,
    best,
    rate30: rate(addDays(today, -29)),
    rateAll: rate(h.start),
    done,
    formed: Math.min(FORM_DAYS, done),
    atRisk: lastDue?.s === 'missed' && todayState === 'today',
    byWeekday,
  };
}

/** Next mark when you tap a day: nothing → done → skip (excused) → nothing. */
export const nextMark = (m: Mark | undefined): Mark | undefined => (m === undefined ? 'done' : m === 'done' ? 'skip' : undefined);

/** New id for a habit (time-based, never reused). */
export const habitId = (now: number = Date.now()) => `h${now.toString(36)}`;

/** Days since the habit started (for "بدأتها من …"). */
export const ageDays = (h: Habit, today: string) => Math.max(0, daysBetween(h.start, today)) + 1;
