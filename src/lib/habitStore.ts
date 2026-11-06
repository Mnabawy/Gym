// Reading and writing habits in storage meta (src/lib/habits.ts), with a data-version bump so screens re-read.
import { useDataVersion } from './bus';
import { HABIT_LOG_KEY, HABITS_KEY, logKey, parseHabits, parseLog, type Habit, type Mark } from './habits';
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
  useDataVersion.getState().bump();
}

export function setMark(id: string, date: string, m: Mark | undefined) {
  const log = readHabitLog();
  if (m) log[logKey(id, date)] = m;
  else delete log[logKey(id, date)];
  storage.setMeta(HABIT_LOG_KEY, JSON.stringify(log));
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
