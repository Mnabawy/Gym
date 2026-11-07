// Supabase sync, the pure part (tested in __tests__/cloudSync.test.ts): what a synced record looks like, merging what
// came from the server with what changed here, and what to send. Runtime (sign-in, when to sync): src/lib/cloud.ts.
// Change log on every write: src/lib/track.ts. Server table and its upsert: supabase/schema.sql.
//
// Every record is one row: a set (`date|exId|idx`), a ticked meal (`date|meal`), a shopping tick (`week|item`) or a
// meta key. The newest edit of each row wins (`updated_at`, ms). Deletes travel as rows with `deleted`.
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
  for (const [k, v] of Object.entries(d.meta)) if (v && !isLocalMeta(k)) out.push({ kind: 'meta', key: k, data: v, deleted: false, updated_at: t });
  return out;
}

/** The changes between what was saved and a backup put in its place (restoring a file): the new rows, the old ones as deletes. */
export function diffRows(before: Dump, after: Dump, t: number): CloudRow[] {
  const now = new Map(localRows(after, t).map((r) => [rowId(r.kind, r.key), r]));
  for (const r of localRows(before, t)) {
    const id = rowId(r.kind, r.key);
    if (!now.has(id)) now.set(id, { ...r, data: r.kind === 'meta' ? null : r.data, deleted: true });
  }
  return [...now.values()];
}
