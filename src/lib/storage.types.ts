import type { SetEntry } from './logic';

export type TrainedDay = { date: string; weekdays: number[]; sets: number };
export type SetRow = { date: string; weekday: number; exId: string; idx: number; kg: number | null; reps: number | null; done: number; rir?: number | null; at?: number | null };
export type MealCheck = { date: string; meal: string };
export type ShopCheck = { week: string; item: string };
/** Everything the app saved, for the backup file (src/lib/backup.ts). */
export type Dump = { sets: SetRow[]; meals: MealCheck[]; shop: ShopCheck[]; meta: Record<string, string> };

export interface Storage {
  setsFor(date: string, exId: string): SetEntry[];
  saveSet(row: SetRow): void;
  /** Most recent session for this exercise strictly before `date`. */
  lastSession(exId: string, date: string): SetEntry[] | undefined;
  clearDay(date: string, exIds: string[]): void;
  /** One set row gone (a delete that came from another phone). */
  deleteSet(date: string, exId: string, idx: number): void;
  /** Many writes at once (one SQLite transaction). */
  transaction(f: () => void): void;
  /** All sessions for an exercise, oldest first. */
  history(exId: string): { date: string; sets: SetEntry[] }[];
  /** Done sets per exercise between two dates (inclusive). */
  doneSetsBetween(from: string, to: string): { exId: string; n: number }[];
  sessionDates(from: string, to: string): string[];
  /** Every date with at least one done set, oldest first: which program days were logged and how many sets. */
  trainedDays(): TrainedDay[];
  /** Every logged set, sorted by date then exercise. Feeds the gaps dashboard. */
  allSets(): SetRow[];

  mealChecks(date: string): string[];
  /** Every ticked meal, oldest first (food history on the food tab). */
  allMealChecks(): MealCheck[];
  setMealCheck(date: string, meal: string, on: boolean): void;

  shopChecks(week: string): string[];
  setShopCheck(week: string, item: string, on: boolean): void;
  clearShop(week: string): void;

  /** Small key/value app state (e.g. the last backup day). */
  getMeta(key: string): string | null;
  setMeta(key: string, value: string): void;

  /** Everything saved, for a backup. */
  dump(): Dump;
  /** Replaces everything saved with a backup's data. */
  restore(d: Dump): void;
}

/** Rows of one exercise sorted by date → one entry per date, oldest first, each day as `rowsToSets` (Storage.history). */
export function groupByDate<R extends { date: string; idx: number; kg: number | null; reps: number | null; done: number; rir?: number | null; at?: number | null }>(
  rows: R[],
): { date: string; sets: SetEntry[] }[] {
  const out: { date: string; sets: SetEntry[] }[] = [];
  let start = 0;
  for (let i = 1; i <= rows.length; i++) {
    if (i === rows.length || rows[i].date !== rows[start].date) {
      out.push({ date: rows[start].date, sets: rowsToSets(rows.slice(start, i)) });
      start = i;
    }
  }
  return out;
}

export function rowsToSets(rows: { idx: number; kg: number | null; reps: number | null; done: number; rir?: number | null; at?: number | null }[]): SetEntry[] {
  const out: SetEntry[] = [];
  for (const r of rows) out[r.idx] = { kg: r.kg, reps: r.reps, done: !!r.done, rir: r.rir ?? null, at: r.at ?? null };
  for (let i = 0; i < out.length; i++) if (!out[i]) out[i] = { kg: null, reps: null, done: false };
  return out;
}
