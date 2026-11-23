// Every write of the food tab (meals ticked, water, supplements, food outside the plan, meal swaps, today as a rest
// day) in one place. Each action returns its undo: an inverse that puts back only what that action changed, on storage
// as it is when you undo — so whatever a sync (or another tap) changed meanwhile stays.
// Entries are changed one by one in their stored map (meta.ts), so values a newer build wrote ride along untouched.
import { useDataVersion } from './bus';
import { dayKey, EXTRAS_KEY, MEAL_PICKS_KEY, okExtra, SUPPS_KEY, WATER_KEY, type Extra } from './journal';
import { readEntry, readNumbers, restoreEntry, writeEntry } from './meta';
import { isRec } from './records';
import { storage } from './storage';

export type Undo = () => void;
const bump = () => useDataVersion.getState().bump();

/** Meta key: the day you switched today to a rest day ('' = none; src/lib/schedule.ts `isTrainingDay`). */
export const REST_DAY_KEY = 'restDay';

/** Ticks a meal on or off for a date. */
export function tickMeal(date: string, meal: string, on: boolean): Undo {
  const was = storage.mealChecks(date).includes(meal);
  storage.setMealCheck(date, meal, on);
  bump();
  return () => {
    storage.setMealCheck(date, meal, was);
    bump();
  };
}

/** Adds (or with a negative `ml`, takes off) water for a date; never below 0. Undo takes back only what was added. */
export function addWater(date: string, ml: number): Undo {
  const prev = readNumbers(WATER_KEY)[date] ?? 0;
  const next = Math.max(0, prev + ml);
  writeEntry(WATER_KEY, 'number', date, next || undefined);
  const added = next - prev;
  return () => {
    const cur = readNumbers(WATER_KEY)[date] ?? 0;
    writeEntry(WATER_KEY, 'number', date, Math.max(0, cur - added) || undefined);
  };
}

/** Sets one entry, and returns how to put back exactly what was there. */
function swapEntry(key: string, k: string, v: number | undefined): Undo {
  const was = readEntry(key, k);
  writeEntry(key, 'number', k, v);
  return () => restoreEntry(key, k, was);
}

/** Ticks a supplement on or off for a date. */
export const tickSupp = (date: string, name: string, on: boolean): Undo => swapEntry(SUPPS_KEY, dayKey(date, name), on ? 1 : undefined);

/** The option picked for a meal on a date (null = back to the plan's own). */
export const setMealPick = (date: string, meal: string, pick: number | null): Undo => swapEntry(MEAL_PICKS_KEY, dayKey(date, meal), pick ?? undefined);

export const TRAIN_DAY_KEY = 'trainDay';

/** A day picked as a training day or a rest day (يومي's gym card): sets both `restDay` and `trainDay`. */
export function setDayKind(date: string, kind: 'train' | 'rest'): Undo {
  const was = [storage.getMeta(REST_DAY_KEY), storage.getMeta(TRAIN_DAY_KEY)];
  storage.setMeta(REST_DAY_KEY, kind === 'rest' ? date : '');
  storage.setMeta(TRAIN_DAY_KEY, kind === 'train' ? date : '');
  bump();
  return () => {
    storage.setMeta(REST_DAY_KEY, was[0] ?? '');
    storage.setMeta(TRAIN_DAY_KEY, was[1] ?? '');
    bump();
  };
}

/** Today (`date`) as a rest day or a training day. */
export function setRestDay(date: string, rest: boolean): Undo {
  const was = storage.getMeta(REST_DAY_KEY);
  storage.setMeta(REST_DAY_KEY, rest ? date : '');
  bump();
  return () => {
    storage.setMeta(REST_DAY_KEY, was ?? '');
    bump();
  };
}

// ---- food outside the plan (meta `extras`: date → list) ----

function rawExtras(): Record<string, unknown> {
  try {
    const v: unknown = JSON.parse(storage.getMeta(EXTRAS_KEY) || 'null');
    return isRec(v) ? { ...v } : {};
  } catch {
    return {};
  }
}
/** A date's list as stored, items this build can't read included. */
const rawDay = (all: Record<string, unknown>, date: string): unknown[] => (Array.isArray(all[date]) ? [...(all[date] as unknown[])] : []);

/** Writes one date's list (an empty one removes the date); every other date stays byte for byte. */
function writeDay(date: string, list: unknown[]) {
  const all = rawExtras();
  if (list.length) all[date] = list;
  else delete all[date];
  storage.setMeta(EXTRAS_KEY, JSON.stringify(all));
  bump();
}

const sameExtra = (raw: unknown, x: Extra) => okExtra(raw) && raw.name === x.name && Math.round(raw.kcal) === x.kcal && Math.round(raw.p) === x.p;

/** Adds an item to a date's list. Undo takes that item back out (the last one like it; by its fields, not key order, which a sync round trip may change). */
export function addExtra(date: string, x: Extra): Undo {
  const item: Extra = { name: x.name, kcal: x.kcal, p: x.p };
  writeDay(date, [...rawDay(rawExtras(), date), item]);
  return () => {
    const cur = rawDay(rawExtras(), date);
    for (let i = cur.length - 1; i >= 0; i--) {
      if (!sameExtra(cur[i], item)) continue;
      cur.splice(i, 1);
      writeDay(date, cur);
      return;
    }
  };
}

/**
 * Removes the item shown at `index` of a date's list (`parseExtras`' order), checked against `shown` so a list that
 * changed since it was drawn never loses the wrong item. Undo puts that same stored item back where it was.
 * Null when it's no longer there.
 */
export function removeExtra(date: string, index: number, shown: Extra): Undo | null {
  const list = rawDay(rawExtras(), date);
  const readable = list.map((x, i) => (okExtra(x) ? i : -1)).filter((i) => i >= 0);
  let at = readable[index];
  if (at === undefined || !sameExtra(list[at], shown)) at = list.findIndex((x) => sameExtra(x, shown));
  if (at < 0) return null;
  const gone = list[at];
  list.splice(at, 1);
  writeDay(date, list);
  return () => {
    const cur = rawDay(rawExtras(), date);
    cur.splice(Math.min(at, cur.length), 0, gone);
    writeDay(date, cur);
  };
}
