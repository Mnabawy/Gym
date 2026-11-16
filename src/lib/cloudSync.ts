// Supabase sync, the pure part (tested in __tests__/cloudSync.test.ts): what a synced record looks like, merging what
// came from the server with what changed here, and what to send. Runtime (sign-in, when to sync): src/lib/cloud.ts.
// Change log on every write: src/lib/track.ts. Server table and its upsert: supabase/schema.sql.
//
// Every record is one row: a set (`date|exId|idx`), a ticked meal (`date|meal`), a shopping tick (`week|item`) or a
// meta key. Lists and maps kept under one meta key (`SPLIT_META`: tasks, goals, quits, habits and their log, the food and
// body logs, settings…) go as one row per record (`tasks/<id>`, `habitLog/<id|date>`, `water/<date>`, `settings/<field>`),
// so edits to different records on two phones both survive and a first sync merges instead of replacing. The newest
// edit of each row wins (`updated_at`, ms). Deletes travel as rows with `deleted`. A whole value an older build sent for
// a split key (`water`, `settings`…) only adds the records missing here (`mergeWhole`), never removes or replaces any.
// Photos aren't synced (they stay in the backup file).
import type { Dump, SetRow } from './storage.types';

export type Kind = 'set' | 'meal' | 'shop' | 'meta';
export type CloudRow = { kind: Kind; key: string; data: unknown; deleted: boolean; updated_at: number };
export type Pulled = CloudRow & { rev: number };
/** Changed here and not yet on the server, by `kind:key`. Sets, meals and shop ticks keep the row; meta is read when sent. */
export type Dirty = Record<string, { t: number; row?: CloudRow }>;

/** Meta keys that belong to this phone, never synced: the Google link, sync state, backup bookkeeping, small UI state. */
const LOCAL_META = new Set(['device', 'driveUser', 'driveName', 'drivePhoto', 'driveFileId', 'driveAt', 'driveAtMs', 'driveSig', 'driveError', 'welcomeDone', 'lastBackup', 'autoBackupAt', 'autoBackupError', 'verse.last', 'section', 'focusState', 'taskSpace', 'calendar.source', 'dbRecovered', 'errLog', 'reminders.applied']);
export const SYNC_PREFIX = 'sync.';
export const isLocalMeta = (k: string) => k.startsWith(SYNC_PREFIX) || LOCAL_META.has(k);
/**
 * Settings that belong to one phone (a folder URI only valid there, the app lock, screen and buzz, the location, Health
 * Connect): saved under the phone-only meta `device` (settings.ts), never sent, and ignored in a pulled `settings` row.
 */
export const DEVICE_SETTINGS = ['backupDir', 'appLock', 'keepAwake', 'haptics', 'place', 'stepsSync'] as const;
/** Fields of a split key that never leave the phone. */
const LOCAL_FIELDS: Readonly<Record<string, ReadonlySet<string>>> = { settings: new Set(DEVICE_SETTINGS) };

export const rowId = (kind: Kind, key: string) => `${kind}:${key}`;

/**
 * Meta keys synced one record per row (`key/id`) instead of as one value, so edits to different records on two phones
 * both survive. `list`: a JSON list of records with an `id`; `ordered`: the same, plus the order as one more row
 * (`key/~order`); `map`: a JSON object, one row per entry (e.g. a habit's day `id|date`, a day's water, a settings
 * field); `dated`: a JSON list of records with a `date`, one row per date, kept in date order (weights, measures).
 * Not split: `program` (one document: which exercises each day has and in what order, ids checked against each other
 * and against the sets overrides; edited on one phone at a time), `focusCfg`, `restDay`, `dataVersion` (single values).
 * Adding a key here re-pulls everything once and sends each of its records once (cloud.ts, meta `sync.split`).
 */
export const SPLIT_META: Readonly<Record<string, 'list' | 'ordered' | 'map' | 'dated'>> = {
  tasks: 'list',
  focus: 'list',
  goals: 'ordered',
  quits: 'ordered',
  habits: 'ordered',
  habitLog: 'map',
  habitParts: 'map',
  taskTrash: 'list',
  dump: 'ordered',
  // Day logs: date (or `date|thing`) → value.
  water: 'map',
  swaps: 'map',
  mealPicks: 'map',
  supps: 'map',
  extras: 'map',
  cardio: 'map',
  steps: 'map',
  adhkar: 'map',
  // Per exercise: id → note / name and muscle.
  notes: 'map',
  pastExercises: 'map',
  weights: 'dated',
  measures: 'dated',
  // One row per field; the phone-only ones (DEVICE_SETTINGS) stay out.
  settings: 'map',
};
export const isSplit = (k: string) => Object.prototype.hasOwnProperty.call(SPLIT_META, k);
const SEP = '/';
export const ORDER = '~order';
export const itemKey = (key: string, id: string) => `${key}${SEP}${id}`;
/** `tasks/t1` → { key: 'tasks', id: 't1' }; null for any other key. */
export function splitKey(k: string): { key: string; id: string } | null {
  const i = k.indexOf(SEP);
  if (i < 0) return null;
  const key = k.slice(0, i);
  return isSplit(key) && i < k.length - 1 ? { key, id: k.slice(i + 1) } : null;
}
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const isIds = (x: unknown): x is string[] => Array.isArray(x) && x.every(str);
const localField = (key: string, id: string) => !!LOCAL_FIELDS[key]?.has(id);
function okEntry(key: string, id: string, data: unknown): boolean {
  const mode = SPLIT_META[key];
  if (localField(key, id)) return false;
  if (mode === 'map') return data != null;
  if (mode === 'dated') return isObj(data) && data.date === id;
  return id === ORDER ? mode === 'ordered' && isIds(data) : isObj(data) && data.id === id;
}

/** A split key's value as its records, by id (a list's order kept as the `~order` record). */
export function entriesOf(key: string, v: string | null | undefined): Map<string, unknown> {
  const out = new Map<string, unknown>();
  let a: unknown;
  try {
    a = JSON.parse(v || 'null');
  } catch {
    return out;
  }
  const mode = SPLIT_META[key];
  if (mode === 'map') {
    if (isObj(a)) for (const [k, x] of Object.entries(a)) if (x != null && !localField(key, k)) out.set(k, x);
  } else if (mode === 'dated') {
    // A repeated date: the last one wins (as the parsers read it).
    if (Array.isArray(a)) for (const x of a) if (isObj(x) && typeof x.date === 'string' && x.date) out.set(x.date, x);
  } else if (Array.isArray(a)) {
    for (const x of a) if (isObj(x) && typeof x.id === 'string' && x.id !== ORDER) out.set(x.id, x);
    if (SPLIT_META[key] === 'ordered' && out.size > 1) out.set(ORDER, [...out.keys()]);
  }
  return out;
}
/**
 * Back to the stored value: a map as an object; a dated list in date order; a list in its `~order` (records it doesn't
 * name go last). `keep`: the stored value's phone-only fields (a split settings value keeps this phone's own).
 */
function valueOf(key: string, m: Map<string, unknown>, keep?: string | null): string {
  if (SPLIT_META[key] === 'map') return JSON.stringify({ ...localPart(key, keep), ...Object.fromEntries(m) });
  if (SPLIT_META[key] === 'dated') return JSON.stringify([...m.entries()].sort(([p], [q]) => (p < q ? -1 : p > q ? 1 : 0)).map(([, x]) => x));
  const order = m.get(ORDER);
  const items = [...m.entries()].filter(([k]) => k !== ORDER).map(([, x]) => x as { id: string });
  if (isIds(order)) {
    const at = new Map(order.map((id, i) => [id, i]));
    const pos = (x: { id: string }) => at.get(x.id) ?? order.length;
    items.sort((p, q) => pos(p) - pos(q));
  }
  return JSON.stringify(items);
}
/** The phone-only fields in a stored map value (kept when pulled records rewrite it). */
function localPart(key: string, v: string | null | undefined): Record<string, unknown> {
  if (!LOCAL_FIELDS[key] || !v) return {};
  try {
    const o: unknown = JSON.parse(v);
    return isObj(o) ? Object.fromEntries(Object.entries(o).filter(([k]) => localField(key, k))) : {};
  } catch {
    return {};
  }
}
const entryRow = (key: string, id: string, data: unknown, t: number): CloudRow => ({ kind: 'meta', key: itemKey(key, id), data: data ?? null, deleted: data == null, updated_at: t });
const allRows = (key: string, v: string | null | undefined, t: number) => [...entriesOf(key, v)].map(([id, x]) => entryRow(key, id, x, t));

/** The rows for the records that changed between two values of a split meta key (added, edited, removed). */
export function itemChanges(key: string, before: string | null | undefined, after: string | null | undefined, t: number): CloudRow[] {
  const old = entriesOf(key, before);
  const now = entriesOf(key, after);
  const out: CloudRow[] = [];
  for (const [id, x] of now) if (JSON.stringify(old.get(id)) !== JSON.stringify(x)) out.push(entryRow(key, id, x, t));
  for (const id of old.keys()) if (!now.has(id)) out.push(entryRow(key, id, null, t));
  return out;
}
/** A change-log entry for a row: plain meta keys are read when sent; everything else keeps the row. */
export const entry = (r: CloudRow) => (r.kind === 'meta' && !splitKey(r.key) ? { t: r.updated_at } : { t: r.updated_at, row: r });

/**
 * A split key's value while a batch of pulled rows is applied: read and parsed once, changed record by record, written
 * once at the end (one parse and one write per key, not per record: a first sync pulls thousands of `habitLog/…` rows).
 */
type OpenKey = { cur: string | null; m: Map<string, unknown>; changed: boolean };

/** Puts one pulled record into its key's value (null = removed). False when nothing changed. */
function applyEntry(o: OpenKey, key: string, id: string, data: unknown): boolean {
  if (localField(key, id)) return false;
  const m = o.m;
  if (data == null) {
    if (!m.has(id)) return false;
    m.delete(id);
  } else {
    if (!okEntry(key, id, data) || JSON.stringify(m.get(id)) === JSON.stringify(data)) return false;
    m.set(id, data);
  }
  o.changed = true;
  return true;
}
/**
 * Records deleted one by one (`water/2026-11-01` → when, ms), phone-only meta `sync.tombs`: a whole value an older
 * build keeps sending (it doesn't know the record was deleted) must not bring them back (`mergeWhole`). Noted for every
 * record delete made here (track.ts) or pulled (applyRows), dropped when the record comes back, kept TOMB_DAYS.
 */
export const TOMBS = 'sync.tombs';
export const TOMB_DAYS = 90;
export type Tombs = Record<string, number>;
export function readTombs(raw: string | null | undefined): Tombs {
  try {
    const v: unknown = JSON.parse(raw || '{}');
    return isObj(v) ? (Object.fromEntries(Object.entries(v).filter(([, t]) => typeof t === 'number')) as Tombs) : {};
  } catch {
    return {};
  }
}
/** Notes one row: a record delete is remembered, a record written again is forgotten. True when changed. */
function tombRow(tombs: Tombs, r: CloudRow): boolean {
  if (r.kind !== 'meta' || !splitKey(r.key)) return false;
  if (r.deleted) {
    if (tombs[r.key] === r.updated_at) return false;
    tombs[r.key] = r.updated_at;
    return true;
  }
  if (tombs[r.key] == null) return false;
  delete tombs[r.key];
  return true;
}
/** Drops the ones older than TOMB_DAYS. True when changed. */
function pruneTombs(tombs: Tombs, now: number): boolean {
  let changed = false;
  const old = now - TOMB_DAYS * 86400000;
  for (const [k, t] of Object.entries(tombs)) if (t < old) (delete tombs[k]), (changed = true);
  return changed;
}
/** Notes the record deletes in `rows` (and forgets records written again); old ones are dropped. True when changed. */
export function noteTombs(tombs: Tombs, rows: readonly CloudRow[], now: number): boolean {
  let changed = false;
  for (const r of rows) changed = tombRow(tombs, r) || changed;
  return pruneTombs(tombs, now) || changed;
}

/**
 * A whole value sent before records went one by one (or by an older build): only adds the records missing here, never
 * removes or replaces one; a record with a change waiting here (deleted here, not sent yet) is not brought back.
 */
function mergeWhole(o: OpenKey, key: string, v: string, dirty: Dirty, tombs: Tombs): boolean {
  const m = o.m;
  let added = false;
  for (const [id, x] of entriesOf(key, v)) {
    const k = itemKey(key, id);
    if (id === ORDER || m.has(id) || dirty[rowId('meta', k)] || tombs[k] != null || !okEntry(key, id, x)) continue;
    m.set(id, x);
    added = true;
  }
  if (added) o.changed = true;
  return added;
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
export function applyRows(rows: readonly Pulled[], dirty: Dirty, s: Target, now = Date.now()): { changed: boolean; meta: string[] } {
  let changed = false;
  const meta: string[] = [];
  const tombs = readTombs(s.getMeta(TOMBS));
  let tombed = false;
  let anySplit = false;
  // Each split key touched by the batch is read once and written once (after the loop).
  const open = new Map<string, OpenKey>();
  const load = (key: string): OpenKey => {
    let o = open.get(key);
    if (!o) {
      const cur = s.getMeta(key);
      o = { cur, m: entriesOf(key, cur), changed: false };
      open.set(key, o);
    }
    return o;
  };
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
      anySplit = true;
      tombed = tombRow(tombs, r) || tombed;
      if (!applyEntry(load(sp.key), sp.key, sp.id, r.deleted ? null : r.data)) continue;
      if (!meta.includes(sp.key)) meta.push(sp.key);
    } else if (r.kind === 'meta' && isSplit(r.key)) {
      if (r.deleted || !str(r.data) || !mergeWhole(load(r.key), r.key, r.data, dirty, tombs)) continue;
      if (!meta.includes(r.key)) meta.push(r.key);
    } else if (r.kind === 'meta') {
      const v = r.deleted || !str(r.data) ? '' : r.data;
      if ((s.getMeta(r.key) ?? '') === v) continue;
      s.setMeta(r.key, v);
      meta.push(r.key);
    } else continue;
    changed = true;
  }
  for (const [key, o] of open) if (o.changed) s.setMeta(key, valueOf(key, o.m, o.cur));
  if (anySplit) tombed = pruneTombs(tombs, now) || tombed;
  if (tombed) s.setMeta(TOMBS, JSON.stringify(tombs));
  return { changed, meta };
}

/** A split key's value as it was when an older build noted it as a whole (`meta:water` with no row), by key. */
export type WholeSnap = Record<string, { t: number; v: string | null }>;
/** Taken before the pull: the pull may overwrite those records with the server's (older) ones. */
export function snapWhole(dirty: Dirty, getMeta: (k: string) => string | null): WholeSnap {
  const out: WholeSnap = {};
  for (const [id, e] of Object.entries(dirty)) {
    if (!e.row && id.startsWith('meta:') && isSplit(id.slice(5))) out[id.slice(5)] = { t: e.t, v: getMeta(id.slice(5)) };
  }
  return out;
}

/**
 * After the pull, for each key an older build noted as a whole: its edits and deletes are worked out against `base`
 * (the last whole value an older build sent, pulled for that key; none = every record counts as an edit): a record that
 * differs is an edit, a record of `base` it doesn't have is a delete. Each goes back on the phone and into the log with
 * the whole edit's time, unless the server has that record newer (`newer`: pulled `updated_at` by row id) or it has its
 * own entry. A `base` newer than the edit means the edit is the older one: nothing comes back. Returns the keys changed.
 */
export function settleWhole(snap: WholeSnap, base: Record<string, { v: string; at: number }>, newer: Record<string, number>, dirty: Dirty, s: Target): string[] {
  const keys: string[] = [];
  for (const [key, { t, v }] of Object.entries(snap)) {
    const id0 = rowId('meta', key);
    const e = dirty[id0];
    if (!e || e.row || e.t !== t) continue;
    delete dirty[id0];
    const b = base[key];
    if (b && b.at > t) continue;
    const mine = entriesOf(key, v);
    const was = entriesOf(key, b?.v);
    const now = s.getMeta(key);
    const cur = entriesOf(key, now);
    let changed = false;
    const put = (id: string, x: unknown) => {
      const rid = rowId('meta', itemKey(key, id));
      if (dirty[rid] || (newer[rid] ?? -Infinity) > t) return;
      dirty[rid] = { t, row: entryRow(key, id, x, t) };
      if (x == null ? cur.has(id) : JSON.stringify(cur.get(id)) !== JSON.stringify(x)) {
        if (x == null) cur.delete(id);
        else cur.set(id, x);
        changed = true;
      }
    };
    for (const [id, x] of mine) if (JSON.stringify(x) !== JSON.stringify(was.get(id))) put(id, x);
    for (const id of was.keys()) if (!mine.has(id)) put(id, null);
    if (changed) {
      s.setMeta(key, valueOf(key, cur, now));
      keys.push(key);
    }
  }
  return keys;
}

/**
 * A split key noted as a whole (by a build before it was split: `meta:water` with no row) becomes one entry per record
 * it holds, each with that time, unless the record has its own entry already. Run after the pull, so a record the
 * server has newer is already here. True when the log changed.
 */
export function expandWhole(dirty: Dirty, getMeta: (k: string) => string | null): boolean {
  let changed = false;
  for (const [id, e] of Object.entries(dirty)) {
    if (e.row || !id.startsWith('meta:') || !isSplit(id.slice(5))) continue;
    const key = id.slice(5);
    delete dirty[id];
    changed = true;
    for (const row of allRows(key, getMeta(key), e.t)) {
      const rid = rowId('meta', row.key);
      if (!dirty[rid]) dirty[rid] = { t: e.t, row };
    }
  }
  return changed;
}

/** What to send for the pending changes: the saved row, or the meta key's value now (empty = deleted). One row per key. */
export function pushItems(dirty: Dirty, getMeta: (k: string) => string | null): { id: string; t: number; row: CloudRow }[] {
  const out: { id: string; t: number; row: CloudRow }[] = [];
  const sent = new Set<string>(); // the server refuses a batch with the same row twice
  const add = (id: string, t: number, row: CloudRow) => {
    const k = rowId(row.kind, row.key);
    if (sent.has(k)) return;
    sent.add(k);
    out.push({ id, t, row });
  };
  const whole: [string, number][] = [];
  for (const [id, e] of Object.entries(dirty)) {
    if (e.row) add(id, e.t, e.row);
    else if (id.startsWith('meta:')) {
      const key = id.slice(5);
      if (isLocalMeta(key)) continue;
      if (isSplit(key)) {
        whole.push([id, e.t]);
        continue;
      }
      const v = getMeta(key);
      add(id, e.t, { kind: 'meta', key, data: v || null, deleted: !v, updated_at: e.t });
    }
  }
  // Noted as a whole (before the key was split; expandWhole normally turned these into records): every record now,
  // after the records that have their own (newer) entry.
  for (const [id, t] of whole) {
    const key = id.slice(5);
    for (const row of allRows(key, getMeta(key), t)) add(id, t, row);
  }
  return out;
}

/**
 * After a batch was accepted by the server: drops the entries it carried from the log, unless edited again meanwhile
 * (`t` changed). `left` counts the rows still to send per entry: an entry that goes as several rows (a split key an
 * older build noted as a whole) is dropped only with its last row, so a later batch that fails keeps it.
 */
export function ackBatch(dirty: Dirty, part: readonly { id: string; t: number }[], left: Map<string, number>): void {
  for (const x of part) {
    const n = (left.get(x.id) ?? 1) - 1;
    left.set(x.id, n);
    if (n <= 0 && dirty[x.id]?.t === x.t) delete dirty[x.id];
  }
}
/** How many rows each entry goes as (for ackBatch). */
export function rowsPerEntry(items: readonly { id: string }[]): Map<string, number> {
  const left = new Map<string, number>();
  for (const x of items) left.set(x.id, (left.get(x.id) ?? 0) + 1);
  return left;
}

/** Every record on the phone as rows (first sync: whatever the server doesn't have yet goes up). Empty meta is skipped. */
export function localRows(d: Dump, t: number): CloudRow[] {
  const out: CloudRow[] = [];
  for (const r of d.sets) out.push(setRow(r, false, t));
  for (const m of d.meals) out.push(mealRow(m.date, m.meal, false, t));
  for (const x of d.shop) out.push(shopRow(x.week, x.item, false, t));
  for (const [k, v] of Object.entries(d.meta)) {
    // A stray `water/2026-11-01` key (an older build stored a pulled record row as a plain key) is never sent: it would
    // overwrite the real record.
    if (!v || isLocalMeta(k) || splitKey(k)) continue;
    if (isSplit(k)) out.push(...allRows(k, v, t));
    else out.push({ kind: 'meta', key: k, data: v, deleted: false, updated_at: t });
  }
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

/** The saved pull cursor (meta `sync.cursor`): a whole rev ≥ 0; anything else (empty, garbage, NaN) is 0 = pull everything. */
export function readCursor(raw: string | null | undefined): number {
  const s = (raw ?? '').trim();
  if (!/^\d+$/.test(s)) return 0;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : 0;
}

/**
 * Re-reading behind the cursor. On the server `rev` comes from a sequence when a push *starts* (schema.sql), not when it
 * commits, so a slow push can become visible after a faster one with higher revs was pulled: "rev > cursor" alone would
 * skip it forever. So each pull starts from `safe`, a rev below which every row has been seen, and re-reads what's
 * between it and the cursor; rows whose rev was already applied (`revs`) are not applied again (an unchanged rev is an
 * unchanged row: any write gives a new rev). `safe` moves up to a rev seen at least SETTLE_MS before this pull started
 * (`marks`: [phone time, cursor] after each page; any rev at or below it was handed out before that time, and a push is
 * one statement that ends within seconds, so it has committed or failed by now), and never lags more than
 * OVERLAP_REVS behind the cursor (a cap on what's re-read; two full push batches). Phone-only meta `sync.window`.
 */
export type PullWindow = { safe: number; marks: [number, number][]; revs: number[] };
export const SETTLE_MS = 2 * 60_000;
export const OVERLAP_REVS = 1000;
const MAX_MARKS = 64;
const whole = (x: unknown): x is number => typeof x === 'number' && Number.isSafeInteger(x) && x >= 0;
export const emptyWindow = (): PullWindow => ({ safe: 0, marks: [], revs: [] });
/** The saved window, checked against the cursor (missing or broken: re-read the last OVERLAP_REVS once). */
export function readWindow(raw: string | null | undefined, cursor: number): PullWindow {
  const fallback = { safe: Math.max(0, cursor - OVERLAP_REVS), marks: [], revs: [] };
  let v: unknown;
  try {
    v = JSON.parse(raw || 'null');
  } catch {
    return fallback;
  }
  if (!isObj(v) || !whole(v.safe) || v.safe > cursor || !Array.isArray(v.marks) || !Array.isArray(v.revs)) return fallback;
  const marks = v.marks.filter((m): m is [number, number] => Array.isArray(m) && m.length === 2 && typeof m[0] === 'number' && isFinite(m[0]) && whole(m[1]));
  const revs = v.revs.filter((r): r is number => whole(r) && r > (v as PullWindow).safe && r <= cursor);
  return { safe: v.safe, marks, revs };
}
/**
 * After a page: `revs` the page's revs, `cursor` the highest rev ever pulled, `covered` the highest rev this pull has
 * read up to (the cursor once the last page came), `at` the phone's time now, `start` when this pull began.
 */
export function advanceWindow(w: PullWindow, revs: readonly number[], o: { cursor: number; covered: number; at: number; start: number }): PullWindow {
  const marks = [...w.marks, [o.at, o.cursor] as [number, number]].slice(-MAX_MARKS);
  let safe = w.safe;
  for (const [t, r] of marks) if (t <= o.start - SETTLE_MS) safe = Math.max(safe, Math.min(r, o.covered));
  safe = Math.min(o.cursor, Math.max(safe, o.cursor - OVERLAP_REVS));
  const all = new Set([...w.revs, ...revs].filter((r) => r > safe));
  return { safe, marks: marks.filter(([, r]) => r > safe), revs: [...all].sort((p, q) => p - q) };
}

/**
 * A phone whose clock runs ahead would win every conflict (the newer `updated_at` wins). Once the server's time is known
 * (the Date header of a pull), pending changes stamped later than the server's now + SKEW_MARGIN_MS are stamped at that
 * limit instead (returns a new log; entries are not changed in place). A correct clock is never touched.
 */
export const SKEW_MARGIN_MS = 30_000;
export function clampDirty(d: Dirty, limit: number): { dirty: Dirty; changed: boolean } {
  let changed = false;
  const out: Dirty = {};
  for (const [id, e] of Object.entries(d)) {
    if (e.t > limit) {
      out[id] = e.row ? { t: limit, row: { ...e.row, updated_at: limit } } : { t: limit };
      changed = true;
    } else out[id] = e;
  }
  return { dirty: changed ? out : d, changed };
}
