// Weekly dashboard (top of /week): one score for the week, a ring per day, and each metric against the same days of the
// week before. Pure — unit tested in __tests__/weekDash.test.ts.
// The score only counts what has a target: training (sessions vs the plan, pro rata in a week in progress), meals,
// water, steps (when the phone syncs them) and «أهم ٣» (the share of the day's three picks done, on days you picked
// them: يومي, src/lib/dayPlan.ts). Tasks, focus and volume have no target, so they're compared, not scored.
// `boost` = the one thing today that would raise the score most (the hero card's advice).
import { addDays, daysBetween } from './dates';
import { STEPS_GOAL } from './cardio';
import { minutesOn, type Session } from './focus';
import { doneOn, type Task } from './tasks';
import type { MealCheck, SetRow } from './storage.types';

export type DashInput = {
  rows: readonly SetRow[];
  checks: readonly MealCheck[];
  /** ml per date. */
  water: Record<string, number>;
  /** ml that counts as a full water day on `date`. */
  waterGoal: (date: string) => number;
  mealsPerDay: number;
  /** Planned sessions per week. */
  target: number;
  tasks?: readonly Task[];
  focus?: readonly Session[];
  steps?: Record<string, number>;
};

export type MetricKey = 'workouts' | 'volume' | 'meals' | 'water' | 'tasks' | 'focus' | 'steps';

export type Metric = {
  key: MetricKey;
  /** This week so far: sessions, kg, meal share 0–1, average ml a day, tasks, minutes, average steps a day. */
  value: number;
  /** The same days of the week before, worked out the same way (null: nothing to compare with). */
  prev: number | null;
  /** Change against `prev`: points for the meal share, percent for the rest. null when there's nothing to compare. */
  delta: number | null;
  trend: 'up' | 'down' | 'flat' | null;
  /** One number per day, Saturday → Friday (sets, kg, meals, ml, tasks, minutes, steps); null = still to come. */
  days: (number | null)[];
  /** What a full day is, per day (meals per day, that day's water goal, the step goal). */
  dayGoal?: number[];
  /** Last week's daily average over the same days: the line across the bars. */
  prevAvg: number | null;
};

export type DayRing = {
  date: string;
  /** How full the day was, 0–1 (meals, water, steps; a workout counts as a full part). null = still to come. */
  share: number | null;
  trained: boolean;
};

export type Pillar = { key: 'workouts' | 'meals' | 'water' | 'steps' | 'top'; share: number };

export type WeekDash = {
  from: string;
  to: string;
  /** Last day counted: today in a week in progress, else Friday. */
  end: string;
  score: number | null;
  /** Score of the same days of the week before. */
  prevScore: number | null;
  pillars: Pillar[];
  rings: DayRing[];
  /** Only metrics with something in this week or the one before. */
  metrics: Metric[];
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const mean = (xs: readonly number[]) => (xs.length ? sum(xs) / xs.length : null);

/** Per-day numbers for one span (from … end), and the week's figures worked out from them. */
function span(from: string, end: string, x: DashInput) {
  const n = daysBetween(from, end) + 1;
  const dates = Array.from({ length: n }, (_, i) => addDays(from, i));
  const done = x.rows.filter((r) => r.done && r.date >= from && r.date <= end);
  const sets = dates.map((d) => done.filter((r) => r.date === d).length);
  const kg = dates.map((d) => Math.round(done.filter((r) => r.date === d).reduce((a, r) => a + (r.kg ?? 0) * (r.reps ?? 0), 0)));
  const meals = dates.map((d) => Math.min(x.mealsPerDay, new Set(x.checks.filter((c) => c.date === d).map((c) => c.meal)).size));
  const ml = dates.map((d) => x.water[d] ?? 0);
  const waterGoals = dates.map((d) => x.waterGoal(d));
  const tasks = dates.map((d) => (x.tasks ? doneOn(x.tasks, d).length : 0));
  const focus = dates.map((d) => (x.focus ? minutesOn(x.focus, d) : 0));
  // «أهم ٣»: picks for each day and how many of them were done that day.
  const picks = dates.map((d) => (x.tasks ? x.tasks.filter((t) => t.top === d) : []));
  const topDone = picks.map((ps, i) => ps.filter((t) => t.done === dates[i]).length);
  const stepsRaw = dates.map((d) => x.steps?.[d]);
  const steps = stepsRaw.map((s) => s ?? 0);

  // The last day is still going: it counts once something is logged, so an empty morning doesn't drag the week down.
  const last = n - 1;
  const counts = (i: number, logged: boolean) => i < last || logged;
  const mealDays = meals.filter((m, i) => counts(i, m > 0));
  const waterDays = ml.map((v, i) => ({ v, g: waterGoals[i], i })).filter((d) => counts(d.i, d.v >= d.g));
  const topDays = picks.map((ps, i) => ({ n: ps.length, d: topDone[i], i })).filter((x) => x.n > 0 && counts(x.i, x.d > 0));
  const stepDays = stepsRaw.map((v, i) => ({ v, i })).filter((d) => d.v != null && counts(d.i, (d.v ?? 0) >= STEPS_GOAL));

  const sessions = sets.filter((s) => s > 0).length;
  // Nothing ticked all span = not tracked (no score part), not a zero.
  const mealShare = sum(meals) > 0 && mealDays.length ? sum(mealDays) / (mealDays.length * x.mealsPerDay) : null;
  const waterShare = sum(ml) > 0 && waterDays.length ? waterDays.filter((d) => d.v >= d.g).length / waterDays.length : null;
  const topShare = topDays.length ? sum(topDays.map((x) => x.d)) / sum(topDays.map((x) => x.n)) : null;
  const stepShare = stepDays.length ? stepDays.filter((d) => (d.v ?? 0) >= STEPS_GOAL).length / stepDays.length : null;
  // Sessions the plan expects by now (a whole week: the full target).
  const expected = Math.max(1, Math.ceil((x.target * n) / 7));

  const pillars: Pillar[] = [{ key: 'workouts', share: clamp01(sessions / expected) }];
  if (mealShare != null) pillars.push({ key: 'meals', share: mealShare });
  if (waterShare != null) pillars.push({ key: 'water', share: waterShare });
  if (stepShare != null) pillars.push({ key: 'steps', share: stepShare });
  if (topShare != null) pillars.push({ key: 'top', share: topShare });
  const anything = sessions > 0 || mealShare != null || sum(ml) > 0 || stepShare != null || topShare != null;
  const score = anything ? Math.round((mean(pillars.map((p) => p.share)) ?? 0) * 100) : null;

  const stepsLogged = stepsRaw.filter((s): s is number => s != null);
  return {
    dates,
    score,
    pillars,
    series: {
      workouts: { value: sessions, days: sets },
      volume: { value: sum(kg), days: kg },
      meals: { value: mealShare, days: meals },
      water: { value: ml.some((v) => v > 0) ? sum(ml) / n : null, days: ml },
      tasks: { value: sum(tasks), days: tasks },
      focus: { value: sum(focus), days: focus },
      steps: { value: stepsLogged.length ? Math.round(sum(stepsLogged) / stepsLogged.length) : null, days: steps },
    } as Record<MetricKey, { value: number | null; days: number[] }>,
    waterGoals,
    picks: picks.map((ps) => ps.length),
    topDone,
  };
}

const ORDER: MetricKey[] = ['workouts', 'volume', 'meals', 'water', 'steps', 'tasks', 'focus'];

/** Change against last week: meal share in points, everything else in percent. */
function change(key: MetricKey, value: number, prev: number | null): number | null {
  if (prev == null) return null;
  if (key === 'meals') return Math.round((value - prev) * 100);
  if (prev === 0) return null;
  return Math.round(((value - prev) / prev) * 100);
}

/** Dashboard for the week starting `from` (a Saturday), as of `today`. */
export function weekDash(from: string, today: string, x: DashInput): WeekDash {
  const to = addDays(from, 6);
  const end = to < today ? to : today;
  const cur = span(from, end, x);
  // The same days of the week before, so a week in progress compares like for like.
  const prevFrom = addDays(from, -7);
  const prevEnd = addDays(end, -7);
  const before = x.rows.some((r) => r.date <= prevEnd) || x.checks.some((c) => c.date <= prevEnd) || Object.keys(x.water).some((d) => d <= prevEnd);
  const old = before ? span(prevFrom, prevEnd, x) : null;

  const pad = (days: number[]): (number | null)[] => [...days, ...Array<null>(7 - days.length).fill(null)];
  const metrics: Metric[] = [];
  for (const key of ORDER) {
    const c = cur.series[key];
    const p = old?.series[key];
    const value = c.value;
    const prev = p?.value ?? null;
    const has = (value ?? 0) > 0 || (prev ?? 0) > 0;
    if (!has) continue;
    const v = value ?? 0;
    const delta = change(key, v, prev);
    const trend = delta == null ? null : delta >= 5 ? 'up' : delta <= -5 ? 'down' : 'flat';
    const dayGoal =
      key === 'meals' ? cur.dates.map(() => x.mealsPerDay) : key === 'water' ? cur.waterGoals : key === 'steps' ? cur.dates.map(() => STEPS_GOAL) : undefined;
    metrics.push({ key, value: v, prev, delta, trend, days: pad(c.days), dayGoal, prevAvg: p ? mean(p.days) : null });
  }

  const rings: DayRing[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(from, i);
    if (date > end) return { date, share: null, trained: false };
    const s = cur.series;
    const trained = s.workouts.days[i] > 0;
    const parts = [s.meals.days[i] / x.mealsPerDay, clamp01(s.water.days[i] / cur.waterGoals[i])];
    if (x.steps?.[date] != null) parts.push(clamp01(s.steps.days[i] / STEPS_GOAL));
    if (cur.picks[i]) parts.push(cur.topDone[i] / cur.picks[i]);
    if (trained) parts.push(1);
    return { date, share: mean(parts) ?? 0, trained };
  });

  return { from, to, end, score: cur.score, prevScore: old?.score ?? null, pillars: cur.pillars, rings, metrics };
}

export type BoostKey = 'workouts' | 'meals' | 'water' | 'top';
export type Boost = { key: BoostKey; gain: number };

/**
 * The one thing left today that would raise the week's score most, and by how many points: train (when today is a
 * planned day you haven't trained), tick all of today's meals, drink the day's water, or finish today's «أهم ٣».
 * Each is tried on a copy of the inputs; null when nothing would add a point. Only for the week in progress.
 */
export function boost(from: string, today: string, x: DashInput, opts: { trainToday: boolean; meals: readonly string[] }): Boost | null {
  const to = addDays(from, 6);
  if (today < from || today > to) return null;
  const base = weekDash(from, today, x).score ?? 0;
  const tries: [BoostKey, DashInput][] = [];
  if (opts.trainToday && !x.rows.some((r) => r.date === today && r.done))
    tries.push(['workouts', { ...x, rows: [...x.rows, { date: today, weekday: 0, exId: '~', idx: 0, kg: 0, reps: 0, done: 1 } satisfies SetRow] }]);
  const ticked = new Set(x.checks.filter((c) => c.date === today).map((c) => c.meal));
  if (opts.meals.some((m) => !ticked.has(m))) tries.push(['meals', { ...x, checks: [...x.checks, ...opts.meals.filter((m) => !ticked.has(m)).map((meal) => ({ date: today, meal }) satisfies MealCheck)] }]);
  if ((x.water[today] ?? 0) < x.waterGoal(today)) tries.push(['water', { ...x, water: { ...x.water, [today]: x.waterGoal(today) } }]);
  const open = (x.tasks ?? []).filter((t) => t.top === today && !t.done);
  if (open.length) tries.push(['top', { ...x, tasks: (x.tasks ?? []).map((t) => (t.top === today && !t.done ? { ...t, done: today } : t)) }]);
  let best: Boost | null = null;
  for (const [key, input] of tries) {
    const gain = (weekDash(from, today, input).score ?? 0) - base;
    if (gain > 0 && (!best || gain > best.gain)) best = { key, gain };
  }
  return best;
}

/** A word for the score. */
export function scoreLabel(score: number): string {
  if (score >= 85) return 'أسبوع ممتاز';
  if (score >= 70) return 'أسبوع كويس';
  if (score >= 50) return 'أسبوع نص نص';
  return 'محتاج تشد حيلك';
}
