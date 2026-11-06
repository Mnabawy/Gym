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
import { PRAYERS, timesFor, type Method, type PrayerKey } from './prayer';

export const HABITS_KEY = 'habits';
export const HABIT_LOG_KEY = 'habitLog';
/** Parts ticked per day (meta `habitParts`): `id|date` → indexes of the habit's parts done. */
export const HABIT_PARTS_KEY = 'habitParts';
export const FORM_DAYS = 66;
export const STRENGTH_HALF_LIFE = 13;

/** The way to FORM_DAYS in three equal stretches, each with its own color (Okabe–Ito: orange, blue, green). */
export const PHASES = [
  { label: 'البداية', from: 1, to: 22, color: '#E69F00' },
  { label: 'التثبيت', from: 23, to: 44, color: '#0072B2' },
  { label: 'قربت', from: 45, to: 66, color: '#009E73' },
] as const;

/** Which stretch you're in (0–2) for a number of done days; 3 once past FORM_DAYS. */
export const phaseOf = (formed: number) => (formed >= FORM_DAYS ? 3 : Math.max(0, PHASES.findIndex((p) => formed < p.to)));
/** How full each stretch is (0–1). */
export const phaseFill = (formed: number) => PHASES.map((p) => Math.max(0, Math.min(1, (formed - (p.from - 1)) / (p.to - p.from + 1))));
export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

/** A reminder tied to a prayer time: minutes after it (negative = before). */
export type PrayerRef = { prayer: PrayerKey; offset: number };
/** One sub-check of a habit (e.g. الفجر in الصلوات الخمس), with its own optional prayer-linked reminder. */
export type Part = { name: string; at?: PrayerRef };

export type Habit = {
  id: string;
  /** Section on the habits tab (e.g. الصلاة, العلم); none = "عادات تانية". */
  group?: string;
  /** Sub-checks: the day is done when all of them are. */
  parts?: Part[];
  /** Reminder tied to a prayer instead of a clock time. */
  at?: PrayerRef;
  name: string;
  icon: string;
  color: string;
  /** Weekdays it's due (0 = Sunday). All seven = every day. */
  days: number[];
  /** Reminder time (minutes after midnight), or null. */
  remind: number | null;
  /** When and where: "بعد الفجر في أوضتي" (optional). */
  cue?: string;
  /** Paused stretches (Ramadan, travel…): those days count as neither done nor missed. `to` null = paused now. */
  pauses?: { from: string; to: string | null }[];
  /** Date it was added: days before it don't count. */
  start: string;
};
export type Mark = 'done' | 'skip';
export type Log = Record<string, Mark>;
export type DayState = 'done' | 'skip' | 'missed' | 'today' | 'off' | 'before' | 'future' | 'paused';

/** Icons and colors to pick from when adding a habit. Colors follow the app's colorblind-safe palette. */
export const HABIT_ICONS = ['book', 'moon', 'sunny', 'partly-sunny', 'cloudy-night', 'sparkles', 'school', 'library', 'bulb', 'walk', 'water', 'leaf', 'bed', 'heart', 'phone-portrait', 'cafe', 'pencil', 'star'] as const;
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
      ...(typeof o.group === 'string' && o.group.trim() ? { group: o.group.trim().slice(0, 30) } : null),
      ...(parseRef(o.at) ? { at: parseRef(o.at)! } : null),
      ...(Array.isArray(o.parts)
        ? {
            parts: o.parts
              .filter((p): p is { name: string; at?: unknown } => !!p && typeof p === 'object' && typeof (p as { name?: unknown }).name === 'string' && !!(p as { name: string }).name.trim())
              .slice(0, 12)
              .map((p) => ({ name: p.name.trim().slice(0, 30), ...(parseRef(p.at) ? { at: parseRef(p.at)! } : null) })),
          }
        : null),
      ...(Array.isArray(o.pauses)
        ? {
            pauses: o.pauses.filter(
              (p): p is { from: string; to: string | null } => !!p && typeof p.from === 'string' && DATE.test(p.from) && (p.to === null || (typeof p.to === 'string' && DATE.test(p.to) && p.to >= p.from)),
            ),
          }
        : null),
    });
  }
  return out;
}

function parseRef(v: unknown): PrayerRef | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  return typeof o.prayer === 'string' && (PRAYERS as string[]).includes(o.prayer) && typeof o.offset === 'number' && Math.abs(o.offset) <= 240
    ? { prayer: o.prayer as PrayerKey, offset: Math.round(o.offset) }
    : null;
}

export type PartsLog = Record<string, number[]>;

export function parsePartsLog(raw: string | null): PartsLog {
  const out: PartsLog = {};
  let v: unknown;
  try {
    v = raw ? JSON.parse(raw) : null;
  } catch {
    return out;
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (!DATE.test(k.slice(-10)) || !Array.isArray(x)) continue;
    const idx = [...new Set(x.filter((i): i is number => Number.isInteger(i) && i >= 0 && i < 12))].sort((a, b) => a - b);
    if (idx.length) out[k] = idx;
  }
  return out;
}

/** Parts done on a date (indexes). A day marked done as a whole counts as all of them. */
export function partsDone(h: Habit, log: Log, parts: PartsLog, date: string): number[] {
  const n = h.parts?.length ?? 0;
  if (log[logKey(h.id, date)] === 'done') return Array.from({ length: n }, (_, i) => i);
  return (parts[logKey(h.id, date)] ?? []).filter((i) => i < n);
}

/**
 * Ticks or unticks one part. The day becomes done when every part is, and stops being done when one is taken back.
 * Returns the new day mark and parts.
 */
export function togglePart(h: Habit, log: Log, parts: PartsLog, date: string, i: number): { mark: Mark | undefined; done: number[] } {
  const n = h.parts?.length ?? 0;
  const cur = new Set(partsDone(h, log, parts, date));
  if (cur.has(i)) cur.delete(i);
  else cur.add(i);
  const done = [...cur].sort((a, b) => a - b);
  const prev = log[logKey(h.id, date)];
  const mark: Mark | undefined = n > 0 && done.length === n ? 'done' : prev === 'skip' ? 'skip' : undefined;
  return { mark, done };
}

/** Share of due days each part was done, over the last `days` days (only days that counted: done or missed). */
export function partRates(h: Habit, log: Log, parts: PartsLog, today: string, days = 30): number[] {
  const n = h.parts?.length ?? 0;
  const hits = Array(n).fill(0);
  let due = 0;
  for (let d = addDays(today, -(days - 1)); d < today; d = addDays(d, 1)) {
    const s = dayState(h, log, d, today);
    if (s !== 'done' && s !== 'missed') continue;
    due++;
    for (const i of partsDone(h, log, parts, d)) hits[i]++;
  }
  return due ? hits.map((x) => x / due) : Array(n).fill(null);
}

/** When a prayer-linked reminder goes off on a date (local time), or null if it can't be worked out. */
export function prayerTime(ref: PrayerRef, date: string, place: { lat: number; lng: number }, method: Method): Date | null {
  try {
    const t = timesFor(place, new Date(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), 12), method)[ref.prayer];
    return new Date(t.getTime() + ref.offset * 60000);
  } catch {
    return null;
  }
}

/** "بعد العصر بربع ساعة" style label for a prayer-linked time. */
export function refAr(ref: PrayerRef, prayerAr: Record<PrayerKey, string>): string {
  const p = prayerAr[ref.prayer];
  if (!ref.offset) return `مع ${p}`;
  const m = Math.abs(ref.offset);
  return `${ref.offset > 0 ? 'بعد' : 'قبل'} ${p} بـ ${m} دقيقة`;
}

/** Habits in sections, in list order: each group in the order its first habit appears, ungrouped last. */
export function groupHabits<T extends Pick<Habit, 'group'>>(list: readonly T[]): { group: string | null; items: T[] }[] {
  const out: { group: string | null; items: T[] }[] = [];
  for (const h of list) {
    const g = h.group ?? null;
    const sec = out.find((x) => x.group === g);
    if (sec) sec.items.push(h);
    else out.push({ group: g, items: [h] });
  }
  return out.sort((a, b) => (a.group === null ? 1 : 0) - (b.group === null ? 1 : 0));
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
/** Paused on that date (inside a pause stretch, or an open one that started by then). */
export const isPaused = (h: Habit, date: string) => (h.pauses ?? []).some((p) => date >= p.from && (p.to === null || date <= p.to));
/** Paused right now (an open pause). */
export const pausedNow = (h: Habit) => (h.pauses ?? []).some((p) => p.to === null);
export const isDue = (h: Habit, date: string) => date >= h.start && h.days.includes(weekdayOf(date)) && !isPaused(h, date);

/** Pause from `today` on, or resume (the pause ends yesterday; a pause that started today just goes away). */
export function togglePause(h: Habit, today: string): Habit {
  const pauses = [...(h.pauses ?? [])];
  const open = pauses.findIndex((p) => p.to === null);
  if (open < 0) return { ...h, pauses: [...pauses, { from: today, to: null }] };
  const p = pauses[open];
  if (p.from >= today) pauses.splice(open, 1);
  else pauses[open] = { from: p.from, to: addDays(today, -1) };
  return { ...h, pauses };
}

/** What a day looks like for a habit. */
export function dayState(h: Habit, log: Log, date: string, today: string): DayState {
  if (date > today) return 'future';
  if (date < h.start) return 'before';
  const m = log[logKey(h.id, date)];
  if (m) return m; // a done mark counts even on a day it wasn't due
  if (isPaused(h, date)) return 'paused';
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
