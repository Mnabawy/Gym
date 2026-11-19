// يومي's own things beyond tasks: «نيّة النهارده» (one line for the day, meta `intents`: date → text) and أفكار
// (ideas for outings, visits, hobbies, rest you'd like to do some day; meta `ideas`: id → "kind|title"). Both are maps,
// synced one row per entry (SPLIT_META in cloudSync.ts) and in backups. Plans themselves are tasks with a `kind`
// (src/lib/tasks.ts PLAN_KINDS), so they show in مهامي too.
import { readEntry, readStrings, restoreEntry, writeEntry } from './meta';
import { isPlanKind, type PlanKindKey } from './tasks';

export const INTENTS_KEY = 'intents';
export const IDEAS_KEY = 'ideas';

export type Idea = { id: string; kind: PlanKindKey; title: string };

/** "kind|title" → an idea (a broken entry is skipped). */
export function parseIdeas(m: Record<string, string>): Idea[] {
  const out: Idea[] = [];
  for (const [id, v] of Object.entries(m)) {
    const bar = v.indexOf('|');
    const kind = v.slice(0, bar);
    const title = v.slice(bar + 1).trim();
    if (bar > 0 && isPlanKind(kind) && title) out.push({ id, kind, title });
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : 1));
}

/**
 * An idea to offer for free time: of a kind, when given; turns over by day (`seed`, e.g. the day number), so the same
 * one isn't offered every time. Null when there's none.
 */
export function ideaFor(ideas: readonly Idea[], seed: number, kind?: PlanKindKey): Idea | null {
  const pool = kind ? ideas.filter((i) => i.kind === kind) : ideas;
  return pool.length ? pool[((seed % pool.length) + pool.length) % pool.length] : null;
}

// ---- storage

export const readIntent = (date: string): string => readStrings(INTENTS_KEY)[date] ?? '';

/** Sets the day's intention ('' clears it); returns its undo. */
export function setIntent(date: string, text: string): () => void {
  const was = readEntry(INTENTS_KEY, date);
  writeEntry(INTENTS_KEY, 'string', date, text.trim() || undefined);
  return () => restoreEntry(INTENTS_KEY, date, was);
}

export const readIdeas = (): Idea[] => parseIdeas(readStrings(IDEAS_KEY));

export const ideaId = (now: number = Date.now()) => `i${now.toString(36)}`;

export function addIdea(kind: PlanKindKey, title: string): () => void {
  const id = ideaId();
  writeEntry(IDEAS_KEY, 'string', id, `${kind}|${title.trim()}`);
  return () => restoreEntry(IDEAS_KEY, id, undefined);
}

export function removeIdea(id: string): () => void {
  const was = readEntry(IDEAS_KEY, id);
  writeEntry(IDEAS_KEY, 'string', id, undefined);
  return () => restoreEntry(IDEAS_KEY, id, was);
}
