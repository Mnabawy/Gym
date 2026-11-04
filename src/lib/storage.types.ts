import type { SetEntry } from './logic';

export type TrainedDay = { date: string; weekdays: number[]; sets: number };
export type SetRow = { date: string; weekday: number; exId: string; idx: number; kg: number | null; reps: number | null; done: number };

export interface Storage {
  setsFor(date: string, exId: string): SetEntry[];
  saveSet(row: SetRow): void;
  /** Most recent session for this exercise strictly before `date`. */
  lastSession(exId: string, date: string): SetEntry[] | undefined;
  clearDay(date: string, exIds: string[]): void;
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
  setMealCheck(date: string, meal: string, on: boolean): void;

  shopChecks(week: string): string[];
  setShopCheck(week: string, item: string, on: boolean): void;
  clearShop(week: string): void;

  /** Small key/value app state (e.g. the last Quran verse shown). */
  getMeta(key: string): string | null;
  setMeta(key: string, value: string): void;
}

export function rowsToSets(rows: { idx: number; kg: number | null; reps: number | null; done: number }[]): SetEntry[] {
  const out: SetEntry[] = [];
  for (const r of rows) out[r.idx] = { kg: r.kg, reps: r.reps, done: !!r.done };
  for (let i = 0; i < out.length; i++) if (!out[i]) out[i] = { kg: null, reps: null, done: false };
  return out;
}
