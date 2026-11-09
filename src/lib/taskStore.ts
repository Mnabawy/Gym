// Reading and writing tasks in storage meta (src/lib/tasks.ts), with a data-version bump so screens re-read.
import { useDataVersion } from './bus';
import { parseTasks, parseTrash, pruneTrash, toTrash, TASKS_KEY, TRASH_KEY, type Task, type Trashed } from './tasks';
import { dateKey } from './logic';
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

/** Deleting keeps a copy in the trash (المحذوفة) for 30 days. */
export function deleteTask(id: string) {
  const list = readTasks();
  const gone = list.find((t) => t.id === id);
  if (gone) storage.setMeta(TRASH_KEY, JSON.stringify(toTrash(readTrash(), gone, dateKey())));
  writeTasks(list.filter((t) => t.id !== id));
}

/** The trash, without what's been put back (undo) or is older than 30 days. */
export const readTrash = (): Trashed[] => pruneTrash(parseTrash(storage.getMeta(TRASH_KEY)), readTasks(), dateKey());

function writeTrash(list: readonly Trashed[]) {
  storage.setMeta(TRASH_KEY, JSON.stringify(list));
  useDataVersion.getState().bump();
}

/** Puts a deleted task back in the list. */
export function restoreTask(id: string) {
  const x = readTrash().find((y) => y.task.id === id);
  if (!x) return;
  saveTask(x.task);
  writeTrash(readTrash());
}

/** Deletes one for good, or the whole trash. */
export const purgeTask = (id: string) => writeTrash(readTrash().filter((y) => y.task.id !== id));
export const emptyTrash = () => writeTrash([]);

/** Clears tasks done more than 30 days ago, so the list doesn't grow forever (the weekly report only looks back a week or so). */
export function pruneDone(today: string) {
  const cut = new Date(`${today}T12:00:00`);
  cut.setDate(cut.getDate() - 30);
  const k = cut.toISOString().slice(0, 10);
  const list = readTasks();
  const kept = list.filter((t) => !t.done || t.done >= k);
  if (kept.length !== list.length) writeTasks(kept);
}
