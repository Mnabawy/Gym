// Reading and writing دفتر الأفكار (src/lib/notebook.ts) in storage meta, with a data-version bump so screens re-read.
import { useDataVersion } from './bus';
import { NOTEBOOK_KEY, parseIdea, parseNotebook, type NoteIdea } from './notebook';
import { keepUnread } from './records';
import { storage } from './storage';


export const readNotebook = () => parseNotebook(storage.getMeta(NOTEBOOK_KEY));
const writeNotebook = (list: readonly NoteIdea[]) => storage.setMeta(NOTEBOOK_KEY, keepUnread(storage.getMeta(NOTEBOOK_KEY), list, parseIdea));

/** Adds or replaces an idea (stamping `updated`); returns its undo. */
export function saveIdea(x: NoteIdea, now: number = Date.now()): () => void {
  const before = storage.getMeta(NOTEBOOK_KEY);
  const list = readNotebook();
  const i = list.findIndex((y) => y.id === x.id);
  const next = { ...x, updated: now };
  if (i >= 0) list[i] = next;
  else list.unshift(next);
  writeNotebook(list);
  useDataVersion.getState().bump();
  return () => {
    storage.setMeta(NOTEBOOK_KEY, before ?? '[]');
    useDataVersion.getState().bump();
  };
}

export function deleteIdea(id: string): () => void {
  const before = storage.getMeta(NOTEBOOK_KEY);
  writeNotebook(readNotebook().filter((y) => y.id !== id));
  useDataVersion.getState().bump();
  return () => {
    storage.setMeta(NOTEBOOK_KEY, before ?? '[]');
    useDataVersion.getState().bump();
  };
}
