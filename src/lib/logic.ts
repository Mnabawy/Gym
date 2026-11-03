// Pure logic — unit tested in __tests__/logic.test.ts
import type { Exercise } from '../data/program';
import { FOODS } from '../data/nutrition';

export type SetEntry = { kg: number | null; reps: number | null; done: boolean };

/** Local calendar date as YYYY-MM-DD. */
export function dateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
