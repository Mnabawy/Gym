// What's missing from the plan: skipped days, under-trained muscles, stalled or dropping lifts.
// Pure — unit tested in __tests__/gaps.test.ts.
//
// Rules of thumb behind the thresholds:
// - Target volume = the program's own sets. Under ~4 hard sets a week a muscle barely grows;
//   5–10 is the most efficient range (Pelland et al. 2025 meta-analysis, 67 studies).
// - One flat session is noise. No new best e1RM for 3 sessions = a plateau; the best of the
//   last two sessions 5%+ under your best = going down (usually fatigue → deload).
// - A light week every 6–8 weeks (see TRAINING_RULES).
import { ALL_EXERCISES, MUSCLE_AR, PLAN_WEEKDAYS, PROGRAM, dayFor, exerciseById, type Muscle } from '../data/program';
import type { SetRow } from './storage.types';
import { dateKey, epley, weekdayOf, type DayStatus } from './logic';

export const MUSCLES = Object.keys(MUSCLE_AR) as Muscle[];
export const WINDOW_DAYS = 28;
export const STALL_SESSIONS = 3;
export const DROP = 0.05;
export const LOW = 0.8;
export const VERY_LOW = 0.5;
export const MEV = 4;
export const DELOAD_WEEKS = 6;
/** A trained day under this share of its planned sets shows as "ناقص". */
export const PARTIAL = 0.8;

export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return dateKey(new Date(y, m - 1, d + n));
}

/** Days from a to b (b − a). */
export function daysBetween(a: string, b: string): number {
  const p = (k: string) => {
    const [y, m, d] = k.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((p(b) - p(a)) / 86_400_000);
}

/** Saturday that starts the week containing `key`. */
export const weekStart = (key: string) => addDays(key, -((weekdayOf(key) + 1) % 7));

/**
 * One exercise on one date. done = sets ticked; e1rm = best Epley over sets with weight and reps (ticked or not, like the progress chart).
 * `swapped` (`date|exId`, src/lib/journal.ts): days you did an alternative instead; they count as done sets but have no e1rm,
 * so another exercise's weights never look like a record or a drop.
 */
export type Session = { date: string; weekday: number; exId: string; done: number; e1rm: number };

export function toSessions(rows: readonly SetRow[], swapped: ReadonlySet<string> = new Set()): Session[] {
  const m = new Map<string, Session>();
  for (const r of rows) {
    const k = `${r.date}|${r.exId}`;
    let s = m.get(k);
    if (!s) m.set(k, (s = { date: r.date, weekday: r.weekday, exId: r.exId, done: 0, e1rm: 0 }));
    if (r.done) s.done++;
    if (!swapped.has(k)) s.e1rm = Math.max(s.e1rm, epley(r.kg ?? 0, r.reps ?? 0));
  }
  return [...m.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Planned sets on a program weekday, total or for one muscle. */
export function planSets(weekday: number, muscle?: Muscle): number {
  return (dayFor(weekday)?.exercises ?? []).reduce((a, e) => a + (!muscle || e.muscle === muscle ? e.sets : 0), 0);
}

/** today, first session date, and every date with a ticked set. */
export type Ctx = { today: string; since: string | undefined; trained: ReadonlySet<string> };

export function ctxOf(sess: readonly Session[], today: string): Ctx {
  const trained = new Set(sess.filter((s) => s.done > 0).map((s) => s.date));
  return { today, since: [...trained].sort()[0], trained };
}

/** Training dates you owe in [from, to]: plan weekdays from your first session up to yesterday — today too once you've trained. */
export function dueDates(from: string, to: string, c: Ctx): string[] {
  const out: string[] = [];
  if (!c.since) return out;
  const end = to < c.today ? to : c.today;
  for (let d = from < c.since ? c.since : from; d <= end; d = addDays(d, 1)) {
    if (!PLAN_WEEKDAYS.includes(weekdayOf(d))) continue;
    if (d === c.today && !c.trained.has(d)) continue;
    out.push(d);
  }
  return out;
}

export type Vol = { done: number; planned: number };

/** Ticked sets per muscle in [from, to] against the sets owed on those dates. */
export function muscleVolume(sess: readonly Session[], from: string, to: string, c: Ctx): Record<Muscle, Vol> {
  const out = Object.fromEntries(MUSCLES.map((m) => [m, { done: 0, planned: 0 }])) as Record<Muscle, Vol>;
  for (const d of dueDates(from, to, c)) for (const e of dayFor(weekdayOf(d))?.exercises ?? []) out[e.muscle].planned += e.sets;
  for (const s of sess) {
    if (s.date < from || s.date > to) continue;
    const e = exerciseById(s.exId);
    if (e) out[e.muscle].done += s.done;
  }
  return out;
}

/** Last `weeks` Saturday-weeks, oldest first; the current week counts only what's due so far. */
export function weekGrid(sess: readonly Session[], weeks: number, c: Ctx) {
  const cur = weekStart(c.today);
  return Array.from({ length: weeks }, (_, i) => {
    const start = addDays(cur, -7 * (weeks - 1 - i));
    return { start, vol: muscleVolume(sess, start, addDays(start, 6), c) };
  });
}

export type Trend = 'up' | 'steady' | 'stalled' | 'down' | 'new' | 'none';
export type TrendInfo = { trend: Trend; best: number; last: number; sinceBest: number; drop: number; points: { date: string; v: number }[] };

/** Trend of an e1RM series, oldest first. sinceBest = sessions since the last new best. */
export function trendOf(values: readonly number[]): Omit<TrendInfo, 'points'> {
  const n = values.length;
  if (!n) return { trend: 'none', best: 0, last: 0, sinceBest: 0, drop: 0 };
  let best = -Infinity;
  let at = 0;
  values.forEach((v, i) => {
    if (v > best) {
      best = v;
      at = i;
    }
  });
  const sinceBest = n - 1 - at;
  const drop = Math.max(0, 1 - Math.max(...values.slice(-2)) / best);
  const trend: Trend =
    n < 3 ? 'new' : sinceBest >= 2 && drop >= DROP ? 'down' : sinceBest >= STALL_SESSIONS ? 'stalled' : sinceBest === 0 ? 'up' : 'steady';
  return { trend, best, last: values[n - 1], sinceBest, drop };
}

export function exerciseTrends(sess: readonly Session[]): Record<string, TrendInfo> {
  const out: Record<string, TrendInfo> = {};
  for (const e of ALL_EXERCISES) {
    const points = sess.filter((s) => s.exId === e.id && s.e1rm > 0).map((s) => ({ date: s.date, v: s.e1rm }));
    out[e.id] = { ...trendOf(points.map((p) => p.v)), points };
  }
  return out;
}

/**
 * Sessions owed vs trained in [from, to]. Workouts run in one sequence (src/lib/schedule.ts), so a missed day doesn't
 * skip a particular workout — it delays the whole cycle. Any date you trained counts, rest days included.
 */
export function attendance(sess: readonly Session[], from: string, to: string, c: Ctx): { due: number; done: number } {
  return {
    due: dueDates(from, to, c).length,
    done: new Set(sess.filter((s) => s.done > 0 && s.date >= from && s.date <= to).map((s) => s.date)).size,
  };
}

/** For each exercise, the last `n` times its program day was logged: how often it was skipped, and the average sets ticked when it wasn't. */
export function exerciseAdherence(sess: readonly Session[], n = 3) {
  const logged = new Map<number, string[]>();
  const done = new Map<string, number>();
  for (const s of sess) {
    done.set(`${s.date}|${s.exId}`, s.done);
    if (s.done > 0) {
      const l = logged.get(s.weekday) ?? [];
      if (l[l.length - 1] !== s.date) l.push(s.date); // sessions are date-sorted
      logged.set(s.weekday, l);
    }
  }
  const out: Record<string, { times: number; skipped: number; avg: number }> = {};
  for (const d of PROGRAM) {
    const dates = (logged.get(d.weekday) ?? []).slice(-n);
    for (const e of d.exercises) {
      const counts = dates.map((dt) => done.get(`${dt}|${e.id}`) ?? 0);
      const played = counts.filter((x) => x > 0);
      out[e.id] = {
        times: dates.length,
        skipped: counts.length - played.length,
        avg: played.length ? played.reduce((a, b) => a + b, 0) / played.length : 0,
      };
    }
  }
  return out;
}

/** Full weeks in a row, ending last week, with at least 60% of the planned sets — i.e. weeks since the last light or missed week. */
export function weeksSinceLight(sess: readonly Session[], c: Ctx): number {
  let n = 0;
  for (let start = addDays(weekStart(c.today), -7); n < 104; start = addDays(start, -7)) {
    const v = Object.values(muscleVolume(sess, start, addDays(start, 6), c));
    const planned = v.reduce((a, x) => a + x.planned, 0);
    if (!planned || v.reduce((a, x) => a + x.done, 0) / planned < 0.6) break;
    n++;
  }
  return n;
}

/**
 * One calendar day, overall or for one muscle. done/planned = ticked vs planned sets
 * (planned from the program days you logged that date, or the date's own plan if you didn't train).
 * partial: trained, but under PARTIAL of the plan.
 */
export function dayInfo(key: string, onDay: readonly Session[], c: Ctx, muscle?: Muscle): { status: DayStatus; done: number; planned: number; partial: boolean } {
  const done = onDay.reduce((a, s) => a + (!muscle || exerciseById(s.exId)?.muscle === muscle ? s.done : 0), 0);
  if (done > 0) {
    const days = [...new Set(onDay.filter((s) => s.done > 0).map((s) => s.weekday))];
    const planned = days.reduce((a, wd) => a + planSets(wd, muscle), 0);
    return { status: 'done', done, planned, partial: planned > 0 && done < PARTIAL * planned };
  }
  const planned = planSets(weekdayOf(key), muscle);
  const status: DayStatus = !planned ? 'off' : key >= c.today ? 'upcoming' : c.since && key >= c.since ? 'missed' : 'off';
  return { status, done: 0, planned, partial: false };
}

/** `date|exId` of every session that beat all earlier sessions of that exercise (not counting the first). */
export function prSet(sess: readonly Session[]): Set<string> {
  const best = new Map<string, number>();
  const out = new Set<string>();
  for (const s of sess) {
    if (s.e1rm <= 0) continue;
    const b = best.get(s.exId);
    if (b !== undefined && s.e1rm > b) out.add(`${s.date}|${s.exId}`);
    if (b === undefined || s.e1rm > b) best.set(s.exId, s.e1rm);
  }
  return out;
}

export type Level = 1 | 2;
export type Gap =
  | { kind: 'day'; level: Level; missed: number; due: number }
  | { kind: 'down'; level: Level; exId: string; drop: number }
  | { kind: 'skipped'; level: Level; exId: string; times: number }
  | { kind: 'volume'; level: Level; muscle: Muscle; done: number; planned: number }
  | { kind: 'stalled'; level: Level; exIds: string[] }
  | { kind: 'short'; level: Level; exId: string; avg: number; sets: number }
  | { kind: 'deload'; level: Level; weeks: number };

const KIND_ORDER: Gap['kind'][] = ['day', 'down', 'skipped', 'volume', 'stalled', 'short', 'deload'];

export type Report = ReturnType<typeof analyze>;

/** Everything the gaps dashboard shows, over the last WINDOW_DAYS ending today. */
export function analyze(rows: readonly SetRow[], today: string = dateKey(), weeks = 6, swapped: ReadonlySet<string> = new Set()) {
  const sess = toSessions(rows, swapped);
  const c = ctxOf(sess, today);
  const from = addDays(today, -(WINDOW_DAYS - 1));
  const volume = muscleVolume(sess, from, today, c);
  const att = attendance(sess, from, today, c);
  const trends = exerciseTrends(sess);
  const exAdh = exerciseAdherence(sess);
  const lightWeeks = weeksSinceLight(sess, c);
  const recent = new Set(sess.filter((s) => s.date >= from).map((s) => s.exId));

  const gaps: Gap[] = [];
  // Missed sessions in the window; a quarter or more of them is a pattern, not a bad week.
  const missed = Math.max(0, att.due - att.done);
  if (missed) gaps.push({ kind: 'day', level: missed / att.due >= 0.25 ? 2 : 1, missed, due: att.due });
  for (const m of MUSCLES) {
    const { done, planned } = volume[m];
    if (planned && done / planned < LOW) gaps.push({ kind: 'volume', level: done / planned < VERY_LOW ? 2 : 1, muscle: m, done, planned });
  }
  for (const e of ALL_EXERCISES) {
    if (recent.has(e.id) && trends[e.id].trend === 'down') gaps.push({ kind: 'down', level: 2, exId: e.id, drop: trends[e.id].drop });
    const a = exAdh[e.id];
    // One skip is noise; skipped 2 of the last 3 times is a habit.
    if (a.times >= 2 && a.skipped >= 2) gaps.push({ kind: 'skipped', level: a.skipped === a.times ? 2 : 1, exId: e.id, times: a.skipped });
    else if (a.times - a.skipped >= 2 && a.avg / e.sets < 0.75) gaps.push({ kind: 'short', level: 1, exId: e.id, avg: a.avg, sets: e.sets });
  }
  // Stalled lifts go in one item, longest stall first: many at once usually means fatigue, not the exercises.
  const stalled = ALL_EXERCISES.filter((e) => recent.has(e.id) && trends[e.id].trend === 'stalled')
    .map((e) => e.id)
    .sort((a, b) => trends[b].sinceBest - trends[a].sinceBest);
  if (stalled.length) gaps.push({ kind: 'stalled', level: 1, exIds: stalled });
  if (lightWeeks >= DELOAD_WEEKS) gaps.push({ kind: 'deload', level: lightWeeks >= 8 ? 2 : 1, weeks: lightWeeks });

  const size = (g: Gap) =>
    g.kind === 'day' ? g.missed / g.due : g.kind === 'volume' ? 1 - g.done / g.planned : g.kind === 'down' ? g.drop : 0;
  gaps.sort((a, b) => b.level - a.level || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || size(b) - size(a));

  const planned = MUSCLES.reduce((a, m) => a + volume[m].planned, 0);
  const capped = MUSCLES.reduce((a, m) => a + Math.min(volume[m].done, volume[m].planned), 0);
  const tracked = c.since ? daysBetween(c.since > from ? c.since : from, today) + 1 : 0;

  return {
    from,
    today,
    since: c.since,
    /** Days of the window since you started logging. */
    tracked,
    /** Share of planned sets done in the window (extra sets on one muscle don't cover another). */
    score: planned ? capped / planned : null,
    volume,
    grid: weekGrid(sess, weeks, c),
    /** Sessions owed vs trained in the window. */
    attendance: att,
    trends,
    exAdh,
    lightWeeks,
    gaps,
  };
}
