// Reading and writing habits in storage meta (src/lib/habits.ts), with a data-version bump so screens re-read.
import { useDataVersion } from './bus';
import { HABIT_LOG_KEY, HABIT_PARTS_KEY, HABITS_KEY, logKey, parseHabits, parseLog, parsePartsLog, togglePart, type Habit, type Mark } from './habits';
import { storage } from './storage';

export const readHabits = () => parseHabits(storage.getMeta(HABITS_KEY));
export const readHabitLog = () => parseLog(storage.getMeta(HABIT_LOG_KEY));

export function saveHabit(h: Habit) {
  const list = readHabits();
  const i = list.findIndex((x) => x.id === h.id);
  if (i >= 0) list[i] = h;
  else list.push(h);
  storage.setMeta(HABITS_KEY, JSON.stringify(list));
  useDataVersion.getState().bump();
}

/** Deletes a habit and everything logged for it. */
export function deleteHabit(id: string) {
  storage.setMeta(HABITS_KEY, JSON.stringify(readHabits().filter((h) => h.id !== id)));
  const log = readHabitLog();
  for (const k of Object.keys(log)) if (k.startsWith(`${id}|`)) delete log[k];
  storage.setMeta(HABIT_LOG_KEY, JSON.stringify(log));
  const parts = readHabitParts();
  for (const k of Object.keys(parts)) if (k.startsWith(`${id}|`)) delete parts[k];
  storage.setMeta(HABIT_PARTS_KEY, JSON.stringify(parts));
  useDataVersion.getState().bump();
}

export function setMark(id: string, date: string, m: Mark | undefined) {
  const log = readHabitLog();
  if (m) log[logKey(id, date)] = m;
  else delete log[logKey(id, date)];
  storage.setMeta(HABIT_LOG_KEY, JSON.stringify(log));
  // A whole-day mark replaces the day's parts (done = all of them, skip or nothing = none).
  const parts = readHabitParts();
  if (parts[logKey(id, date)]) {
    delete parts[logKey(id, date)];
    storage.setMeta(HABIT_PARTS_KEY, JSON.stringify(parts));
  }
  useDataVersion.getState().bump();
}

/** Moves a habit up or down in the list. */
export function moveHabit(id: string, by: number) {
  const list = readHabits();
  const i = list.findIndex((h) => h.id === id);
  const j = Math.max(0, Math.min(list.length - 1, i + by));
  if (i < 0 || i === j) return;
  const [h] = list.splice(i, 1);
  list.splice(j, 0, h);
  storage.setMeta(HABITS_KEY, JSON.stringify(list));
  useDataVersion.getState().bump();
}

export const readHabitParts = () => parsePartsLog(storage.getMeta(HABIT_PARTS_KEY));

/** Ticks or unticks one part of a habit on a date (the day is done once all parts are). */
export function setPart(h: Habit, date: string, i: number) {
  const log = readHabitLog();
  const parts = readHabitParts();
  const r = togglePart(h, log, parts, date, i);
  if (r.mark) log[logKey(h.id, date)] = r.mark;
  else delete log[logKey(h.id, date)];
  if (r.done.length) parts[logKey(h.id, date)] = r.done;
  else delete parts[logKey(h.id, date)];
  storage.setMeta(HABIT_LOG_KEY, JSON.stringify(log));
  storage.setMeta(HABIT_PARTS_KEY, JSON.stringify(parts));
  useDataVersion.getState().bump();
}

/** Adds several habits at once (the ready-made ones), skipping any whose name you already have. Returns how many. */
export function addHabits(list: readonly Omit<Habit, 'id' | 'start'>[], today: string): number {
  const cur = readHabits();
  const names = new Set(cur.map((h) => h.name));
  let n = 0;
  const now = Date.now();
  for (const t of list) {
    if (names.has(t.name)) continue;
    cur.push({ ...t, id: `h${(now + n).toString(36)}`, start: today });
    n++;
  }
  storage.setMeta(HABITS_KEY, JSON.stringify(cur));
  useDataVersion.getState().bump();
  return n;
}
