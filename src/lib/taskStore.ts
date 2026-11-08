// Reading and writing tasks in storage meta (src/lib/tasks.ts), with a data-version bump so screens re-read.
import { useDataVersion } from './bus';
import { parseTasks, TASKS_KEY, type Task } from './tasks';
import { storage } from './storage';

export const readTasks = () => parseTasks(storage.getMeta(TASKS_KEY));

export function writeTasks(list: readonly Task[]) {
  storage.setMeta(TASKS_KEY, JSON.stringify(list));
  useDataVersion.getState().bump();
}

export function saveTask(t: Task) {
  const list = readTasks();
  const i = list.findIndex((x) => x.id === t.id);
  if (i >= 0) list[i] = t;
  else list.push(t);
  writeTasks(list);
}

export const deleteTask = (id: string) => writeTasks(readTasks().filter((t) => t.id !== id));

/** Clears tasks done more than 30 days ago, so the list doesn't grow forever (the weekly report only looks back a week or so). */
export function pruneDone(today: string) {
  const cut = new Date(`${today}T12:00:00`);
  cut.setDate(cut.getDate() - 30);
  const k = cut.toISOString().slice(0, 10);
  const list = readTasks();
  const kept = list.filter((t) => !t.done || t.done >= k);
  if (kept.length !== list.length) writeTasks(kept);
}
