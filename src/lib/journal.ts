// Small per-day records saved as JSON maps in storage meta: exercise swaps, exercise notes, water, meal swaps.
// Plus the food history (meals ticked per day). Pure — unit tested in __tests__/journal.test.ts; reading and writing
// storage is in src/lib/meta.ts.
import type { SetEntry } from './logic';
import { addDays } from './gaps';
import type { MealCheck } from './storage.types';

export const SWAPS_KEY = 'swaps';
export const NOTES_KEY = 'notes';
export const WATER_KEY = 'water';
export const MEAL_PICKS_KEY = 'mealPicks';

/** Days of water and meal swaps kept (older entries are dropped on the next write). */
export const KEEP_DAYS = 120;
export const CUP_ML = 250;
/** Water goal when the calorie calculator has no data yet: liters on a rest day. */
export const DEFAULT_WATER_L = 3;
export const TRAINING_WATER_L = 0.5;

export function parseMap<V extends string | number>(raw: string | null, kind: 'string' | 'number'): Record<string, V> {
  const out: Record<string, V> = {};
  if (!raw) return out;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return out;
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (kind === 'string' ? typeof x === 'string' && x : typeof x === 'number' && Number.isFinite(x)) out[k] = x as V;
  }
  return out;
}

/** Key for a per-day entry about one thing (an exercise or a meal). Dates sort first, so old ones are easy to drop. */
export const dayKey = (date: string, id: string) => `${date}|${id}`;

/** Drops entries keyed by a date older than KEEP_DAYS before `today`. */
export function prune<V>(m: Record<string, V>, today: string): Record<string, V> {
  const from = addDays(today, -KEEP_DAYS);
  const out: Record<string, V> = {};
  for (const [k, v] of Object.entries(m)) if (k.slice(0, 10) >= from) out[k] = v;
  return out;
}

/** Every `date|exId` you trained a swapped exercise on: those days don't count for the program exercise's records. */
export const swappedSet = (swaps: Record<string, string>): Set<string> => new Set(Object.keys(swaps));

/**
 * The last time you did this exercise *as the same variant*, before `date`: the program exercise (alt = null) skips
 * swapped days; a swap only looks at days with that same swap. Sets prefill and the "+kg" tip come from it.
 */
export function lastFor(history: readonly { date: string; sets: SetEntry[] }[], date: string, exId: string, swaps: Record<string, string>, alt: string | null): SetEntry[] | undefined {
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    if (h.date >= date || !h.sets.some((s) => s.kg != null || s.reps != null)) continue;
    if ((swaps[dayKey(h.date, exId)] ?? null) === alt) return h.sets;
  }
  return undefined;
}

/** Water goal in ml: from the calculator (35 ml/kg) when it has your data, else 3 L; +0.5 L on a training day. */
export function waterGoalMl(liters: number | null, training: boolean): number {
  return Math.round(((liters ?? DEFAULT_WATER_L) + (training ? TRAINING_WATER_L : 0)) * 1000);
}

export type DayFood = { date: string; meals: number; water: number };

/**
 * Food history for the last `n` days up to today, oldest first: meals ticked and water (ml) per day.
 * Days before the first thing you ever logged are left out, so a new app doesn't show a wall of zeros.
 */
export function foodHistory(checks: readonly MealCheck[], water: Record<string, number>, today: string, n = 14): DayFood[] {
  const first = [checks[0]?.date, ...Object.keys(water)].filter(Boolean).sort()[0];
  if (!first) return [];
  const meals = new Map<string, Set<string>>();
  for (const c of checks) meals.set(c.date, (meals.get(c.date) ?? new Set()).add(c.meal));
  const out: DayFood[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = addDays(today, -i);
    if (d < first) continue;
    out.push({ date: d, meals: meals.get(d)?.size ?? 0, water: water[d] ?? 0 });
  }
  return out;
}

/** Share of meals ticked over the days (today only counts once it has a tick, so the morning doesn't pull it down). */
export function adherence(days: readonly DayFood[], perDay: number, today: string): number | null {
  const counted = days.filter((d) => d.date < today || d.meals > 0);
  if (!counted.length) return null;
  return counted.reduce((a, d) => a + Math.min(perDay, d.meals), 0) / (counted.length * perDay);
}
