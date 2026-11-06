// Weekly report (/week): one Saturday–Friday week of training, records, body weight and food in one place.
// Pure — unit tested in __tests__/report.test.ts.
import { exerciseById, MUSCLE_AR, PLAN_WEEKDAYS, type Muscle } from '../data/program';
import { addDays, daysBetween, prSet, toSessions } from './gaps';
import { adherence, foodHistory, type DayFood } from './journal';
import type { MealCheck, SetRow } from './storage.types';
import type { WeighIn } from './weight';
import { dayState, type Habit, type Log } from './habits';
import { cardioWeek, type Cardio, type CardioWeek } from './cardio';

export type WeekReport = {
  from: string;
  to: string;
  /** Days of the week up to today (7 once it's over). */
  days: number;
  sessions: number;
  target: number;
  sets: number;
  volume: number;
  prevVolume: number | null;
  perMuscle: Record<Muscle, number>;
  prs: { exId: string; date: string }[];
  weight: { end: number | null; change: number | null };
  meals: number | null;
  waterDays: number;
  /** Average session length in minutes (from tick times). */
  minutes: number | null;
  /** Each habit's week: days done, and days that counted (done + missed; excused, paused and off days don't). */
  habits: { id: string; name: string; color: string; done: number; due: number }[];
  cardio: CardioWeek;
};

export type ReportInput = {
  rows: readonly SetRow[];
  swapped: ReadonlySet<string>;
  weights: readonly WeighIn[];
  checks: readonly MealCheck[];
  water: Record<string, number>;
  /** ml that counts as a full water day. */
  waterGoal: number;
  mealsPerDay: number;
  habits?: readonly Habit[];
  habitLog?: Log;
  cardio?: Record<string, Cardio[]>;
  weightKg?: number;
};

const vol = (rows: readonly SetRow[]) => Math.round(rows.reduce((a, r) => a + (r.kg ?? 0) * (r.reps ?? 0), 0));

export function weekReport(from: string, today: string, x: ReportInput): WeekReport {
  const to = addDays(from, 6);
  const end = to < today ? to : today;
  const inWeek = (d: string) => d >= from && d <= end;
  const done = x.rows.filter((r) => r.done && inWeek(r.date));
  const prevFrom = addDays(from, -7);
  const prev = x.rows.filter((r) => r.done && r.date >= prevFrom && r.date < from);

  const perMuscle = Object.fromEntries(Object.keys(MUSCLE_AR).map((m) => [m, 0])) as Record<Muscle, number>;
  for (const r of done) {
    const m = exerciseById(r.exId)?.muscle;
    if (m) perMuscle[m]++;
  }

  const prs = [...prSet(toSessions(x.rows, x.swapped))]
    .map((k) => ({ date: k.slice(0, 10), exId: k.slice(11) }))
    .filter((p) => inWeek(p.date))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const lastIn = [...x.weights].reverse().find((w) => inWeek(w.date));
  const lastBefore = [...x.weights].reverse().find((w) => w.date < from);

  const days: DayFood[] = foodHistory(x.checks, x.water, end, daysBetween(from, end) + 1).filter((d) => d.date >= from);

  const spans: number[] = [];
  for (const d of new Set(done.map((r) => r.date))) {
    const ts = done.filter((r) => r.date === d && typeof r.at === 'number').map((r) => r.at as number);
    if (ts.length >= 2) spans.push((Math.max(...ts) - Math.min(...ts)) / 60000 + 1);
  }

  const habits = (x.habits ?? []).map((h) => {
    let done = 0, due = 0;
    for (let d = from; d <= end; d = addDays(d, 1)) {
      const s = dayState(h, x.habitLog ?? {}, d, today);
      if (s === 'done') {
        done++;
        due++;
      } else if (s === 'missed') due++;
    }
    return { id: h.id, name: h.name, color: h.color, done, due };
  }).filter((h) => h.due > 0 || h.done > 0);

  return {
    habits,
    cardio: cardioWeek(x.cardio ?? {}, from, x.weightKg ?? 0),
    from,
    to,
    days: daysBetween(from, end) + 1,
    sessions: new Set(done.map((r) => r.date)).size,
    target: PLAN_WEEKDAYS.length,
    sets: done.length,
    volume: vol(done),
    prevVolume: prev.length ? vol(prev) : null,
    perMuscle,
    prs,
    weight: { end: lastIn?.kg ?? null, change: lastIn && lastBefore ? Math.round((lastIn.kg - lastBefore.kg) * 10) / 10 : null },
    meals: adherence(days, x.mealsPerDay, today),
    waterDays: days.filter((d) => d.water >= x.waterGoal).length,
    minutes: spans.length ? Math.round(spans.reduce((a, b) => a + b, 0) / spans.length) : null,
  };
}
