// Supabase sync, the pure part (tested in __tests__/cloudSync.test.ts): what a synced record looks like, merging what
// came from the server with what changed here, and what to send. Runtime (sign-in, when to sync): src/lib/cloud.ts.
// Change log on every write: src/lib/track.ts. Server table and its upsert: supabase/schema.sql.
//
// Every record is one row: a set (`date|exId|idx`), a ticked meal (`date|meal`), a shopping tick (`week|item`) or a
// meta key. A list kept under one meta key (`SPLIT_META`, e.g. the to-do list) goes as one row per record
// (`tasks/<id>`), so edits to different tasks on two phones both survive. The newest edit of each row wins (`updated_at`, ms). Deletes travel as rows with `deleted`.
// Photos aren't synced (they stay in the backup file).
import type { Dump, SetRow } from './storage.types';

export type Kind = 'set' | 'meal' | 'shop' | 'meta';
export type CloudRow = { kind: Kind; key: string; data: unknown; deleted: boolean; updated_at: number };
export type Pulled = CloudRow & { rev: number };
/** Changed here and not yet on the server, by `kind:key`. Sets, meals and shop ticks keep the row; meta is read when sent. */
export type Dirty = Record<string, { t: number; row?: CloudRow }>;

/** Meta keys that belong to this phone, never synced: the Google link, sync state, backup bookkeeping, small UI state. */
const LOCAL_META = new Set(['driveUser', 'driveName', 'drivePhoto', 'driveFileId', 'driveAt', 'driveAtMs', 'driveSig', 'driveError', 'welcomeDone', 'lastBackup', 'autoBackupAt', 'autoBackupError', 'verse.last', 'section']);
export const SYNC_PREFIX = 'sync.';
export const isLocalMeta = (k: string) => k.startsWith(SYNC_PREFIX) || LOCAL_META.has(k);

export const rowId = (kind: Kind, key: string) => `${kind}:${key}`;

/** Meta keys holding a JSON list of records with an `id`: synced one record per row, keyed `key/id`. */
export const SPLIT_META: ReadonlySet<string> = new Set(['tasks']);
const SEP = '/';
type Item = { id: string } & Record<string, unknown>;
export const itemKey = (key: string, id: string) => `${key}${SEP}${id}`;
/** `tasks/t1` → { key: 'tasks', id: 't1' }; null for any other key. */
export function splitKey(k: string): { key: string; id: string } | null {
  const i = k.indexOf(SEP);
  if (i < 0) return null;
  const key = k.slice(0, i);
  return SPLIT_META.has(key) && i < k.length - 1 ? { key, id: k.slice(i + 1) } : null;
}
const isItem = (x: unknown): x is Item => !!x && typeof x === 'object' && !Array.isArray(x) && typeof (x as Item).id === 'string';
export function listItems(v: string | null | undefined): Item[] {
  try {
    const a: unknown = JSON.parse(v || '[]');
    return Array.isArray(a) ? a.filter(isItem) : [];
  } catch {
    return [];
  }
}
const itemRow = (key: string, it: Item, deleted: boolean, t: number): CloudRow => ({ kind: 'meta', key: itemKey(key, it.id), data: deleted ? null : it, deleted, updated_at: t });
const itemRows = (key: string, v: string | null | undefined, t: number) => listItems(v).map((it) => itemRow(key, it, false, t));

/** The rows for the records that changed between two values of a split meta key (added, edited, removed). */
export function itemChanges(key: string, before: string | null | undefined, after: string | null | undefined, t: number): CloudRow[] {
  const old = new Map(listItems(before).map((it) => [it.id, JSON.stringify(it)]));
  const out: CloudRow[] = [];
  const now = new Set<string>();
  for (const it of listItems(after)) {
    now.add(it.id);
    if (old.get(it.id) !== JSON.stringify(it)) out.push(itemRow(key, it, false, t));
  }
  for (const id of old.keys()) if (!now.has(id)) out.push(itemRow(key, { id }, true, t));
  return out;
}
/** A change-log entry for a row: plain meta keys are read when sent; everything else keeps the row. */
export const entry = (r: CloudRow) => (r.kind === 'meta' && !splitKey(r.key) ? { t: r.updated_at } : { t: r.updated_at, row: r });

/** Puts one pulled record into its list (null = removed). False when nothing changed. */
function applyItem(s: Target, key: string, id: string, data: unknown): boolean {
  const list = listItems(s.getMeta(key));
  const i = list.findIndex((x) => x.id === id);
  if (data == null) {
    if (i < 0) return false;
    list.splice(i, 1);
  } else {
    if (!isItem(data) || data.id !== id) return false;
    if (i >= 0 && JSON.stringify(list[i]) === JSON.stringify(data)) return false;
    if (i >= 0) list[i] = data;
    else list.push(data);
  }
  s.setMeta(key, JSON.stringify(list));
  return true;
}

export function setRow(r: SetRow, deleted: boolean, t: number): CloudRow {
  const data = { date: r.date, weekday: r.weekday, exId: r.exId, idx: r.idx, kg: r.kg, reps: r.reps, done: r.done, rir: r.rir ?? null, at: r.at ?? null };
  return { kind: 'set', key: `${r.date}|${r.exId}|${r.idx}`, data, deleted, updated_at: t };
}
export const mealRow = (date: string, meal: string, deleted: boolean, t: number): CloudRow => ({ kind: 'meal', key: `${date}|${meal}`, data: { date, meal }, deleted, updated_at: t });
export const shopRow = (week: string, item: string, deleted: boolean, t: number): CloudRow => ({ kind: 'shop', key: `${week}|${item}`, data: { week, item }, deleted, updated_at: t });

/** The writes a pulled row needs (untracked: the server already has it). */
export interface Target {
  saveSet(r: SetRow): void;
  deleteSet(date: string, exId: string, idx: number): void;
  setMealCheck(date: string, meal: string, on: boolean): void;
  setShopCheck(week: string, item: string, on: boolean): void;
  getMeta(key: string): string | null;
  setMeta(key: string, value: string): void;
}

const str = (x: unknown): x is string => typeof x === 'string';
const num = (x: unknown) => (typeof x === 'number' && isFinite(x) ? x : null);

function toSet(d: unknown): SetRow | null {
  const o = d as Record<string, unknown> | null;
  if (!o || !str(o.date) || !str(o.exId) || typeof o.idx !== 'number') return null;
  return { date: o.date, weekday: num(o.weekday) ?? 0, exId: o.exId, idx: o.idx, kg: num(o.kg), reps: num(o.reps), done: o.done ? 1 : 0, rir: num(o.rir), at: num(o.at) };
}

/**
 * Puts pulled rows on the phone. A row changed here more recently than the server's edit is left alone (ours goes up
 * next); otherwise the server's wins and our pending change for it is dropped. Returns which meta keys changed and
 * whether anything did. `dirty` is updated in place.
 */
export function applyRows(rows: readonly Pulled[], dirty: Dirty, s: Target): { changed: boolean; meta: string[] } {
  let changed = false;
  const meta: string[] = [];
  for (const r of rows) {
    if (r.kind === 'meta' && isLocalMeta(r.key)) continue;
    const id = rowId(r.kind, r.key);
    const mine = dirty[id];
    if (mine && mine.t > r.updated_at) continue;
    delete dirty[id];
    const d = r.data as Record<string, unknown> | null;
    if (r.kind === 'set') {
      const x = toSet(d);
      if (!x) continue;
      if (r.deleted) s.deleteSet(x.date, x.exId, x.idx);
      else s.saveSet(x);
    } else if (r.kind === 'meal') {
      if (!d || !str(d.date) || !str(d.meal)) continue;
      s.setMealCheck(d.date, d.meal, !r.deleted);
    } else if (r.kind === 'shop') {
      if (!d || !str(d.week) || !str(d.item)) continue;
      s.setShopCheck(d.week, d.item, !r.deleted);
    } else if (r.kind === 'meta' && splitKey(r.key)) {
      const sp = splitKey(r.key)!;
      if (!applyItem(s, sp.key, sp.id, r.deleted ? null : r.data)) continue;
      if (!meta.includes(sp.key)) meta.push(sp.key);
    } else if (r.kind === 'meta' && SPLIT_META.has(r.key)) {
      // The whole list, sent before records went one by one: only adds the ones missing here.
      const have = new Set(listItems(s.getMeta(r.key)).map((x) => x.id));
      const add = r.deleted || !str(r.data) ? [] : listItems(r.data).filter((x) => !have.has(x.id));
      if (!add.length) continue;
      s.setMeta(r.key, JSON.stringify([...listItems(s.getMeta(r.key)), ...add]));
      if (!meta.includes(r.key)) meta.push(r.key);
    } else if (r.kind === 'meta') {
      const v = r.deleted || !str(r.data) ? '' : r.data;
      if ((s.getMeta(r.key) ?? '') === v) continue;
      s.setMeta(r.key, v);
      meta.push(r.key);
    } else continue;
    changed = true;
  }
  return { changed, meta };
}

/** What to send for the pending changes: the saved row, or the meta key's value now (empty = deleted). */
export function pushItems(dirty: Dirty, getMeta: (k: string) => string | null): { id: string; t: number; row: CloudRow }[] {
  const out: { id: string; t: number; row: CloudRow }[] = [];
  for (const [id, e] of Object.entries(dirty)) {
    if (e.row) out.push({ id, t: e.t, row: e.row });
    else if (id.startsWith('meta:')) {
      const key = id.slice(5);
      if (isLocalMeta(key)) continue;
      const v = getMeta(key);
      if (SPLIT_META.has(key)) {
        // Noted as a whole (before this version): send every record now.
        for (const row of itemRows(key, v, e.t)) out.push({ id, t: e.t, row });
        continue;
      }
      out.push({ id, t: e.t, row: { kind: 'meta', key, data: v || null, deleted: !v, updated_at: e.t } });
    }
  }
  return out;
}

/** Every record on the phone as rows (first sync: whatever the server doesn't have yet goes up). Empty meta is skipped. */
export function localRows(d: Dump, t: number): CloudRow[] {
  const out: CloudRow[] = [];
  for (const r of d.sets) out.push(setRow(r, false, t));
  for (const m of d.meals) out.push(mealRow(m.date, m.meal, false, t));
  for (const x of d.shop) out.push(shopRow(x.week, x.item, false, t));
  for (const [k, v] of Object.entries(d.meta)) {
    if (!v || isLocalMeta(k)) continue;
    if (SPLIT_META.has(k)) out.push(...itemRows(k, v, t));
    else out.push({ kind: 'meta', key: k, data: v, deleted: false, updated_at: t });
  }
  return out;
}

/** The changes between what was saved and a backup put in its place (restoring a file): the new rows, the old ones as deletes. */
export function diffRows(before: Dump, after: Dump, t: number): CloudRow[] {
  const now = new Map(localRows(after, t).map((r) => [rowId(r.kind, r.key), r]));
  for (const r of localRows(before, t)) {
    const id = rowId(r.kind, r.key);
    if (!now.has(id)) now.set(id, { ...r, data: r.kind === 'meta' && !splitKey(r.key) ? null : r.data, deleted: true });
  }
  return [...now.values()];
}
