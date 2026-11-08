// The change log for Supabase sync: wraps the phone's storage so every write (a set, a meal tick, a meta key...) is
// noted as "changed here" until src/lib/cloud.ts has sent it. Only while sync is on (meta `sync.on`); before that, the
// first sync compares everything. The log is meta `sync.dirty`. `sync.*` keys stay on this phone: they're left out of
// dump() (backups) and survive restore().
import { diffRows, entry, isLocalMeta, itemChanges, mealRow, rowId, setRow, shopRow, isSplit, SYNC_PREFIX, type CloudRow, type Dirty } from './cloudSync';
import type { Dump, Storage } from './storage.types';

const ON = 'sync.on';
const DIRTY = 'sync.dirty';

let raw: Storage;
let D: Dirty | null = null;
let paused = 0;
const listeners = new Set<() => void>();

/** The storage without the change log (putting pulled rows on the phone). */
export const rawStorage = (): Storage => raw;
export const trackingOn = () => raw.getMeta(ON) === '1';
export function setTracking(on: boolean) {
  raw.setMeta(ON, on ? '1' : '');
  if (!on) {
    D = {};
    saveDirty();
  }
}

export function dirty(): Dirty {
  if (!D) {
    try {
      D = JSON.parse(raw.getMeta(DIRTY) || '{}') as Dirty;
    } catch {
      D = {};
    }
  }
  return D;
}
export function saveDirty() {
  raw.setMeta(DIRTY, JSON.stringify(dirty()));
}
/** Called after each tracked change (the sync waits a few seconds, then sends). */
export function onDirty(f: () => void) {
  listeners.add(f);
  return () => void listeners.delete(f);
}

/** Runs writes without noting them (wiping the phone on sign-out must not send deletes). */
export function untracked<T>(f: () => T): T {
  paused++;
  try {
    return f();
  } finally {
    paused--;
  }
}

function note(rows: { id: string; t: number; row?: CloudRow }[]) {
  if (paused || !rows.length || !trackingOn()) return;
  const d = dirty();
  for (const r of rows) d[r.id] = r.row ? { t: r.t, row: r.row } : { t: r.t };
  saveDirty();
  for (const f of listeners) f();
}
const row = (r: CloudRow) => ({ id: rowId(r.kind, r.key), t: r.updated_at, row: r });

const localKeys = (meta: Record<string, string>) => Object.entries(meta).filter(([k]) => k.startsWith(SYNC_PREFIX));

export function track(base: Storage): Storage {
  raw = base;
  return {
    ...base,
    saveSet(r) {
      base.saveSet(r);
      note([row(setRow(r, false, Date.now()))]);
    },
    clearDay(date, exIds) {
      const t = Date.now();
      const gone = exIds.flatMap((exId) => base.setsFor(date, exId).map((_, idx) => row(setRow({ date, weekday: 0, exId, idx, kg: null, reps: null, done: 0 }, true, t))));
      base.clearDay(date, exIds);
      note(gone);
    },
    setMealCheck(date, meal, on) {
      base.setMealCheck(date, meal, on);
      note([row(mealRow(date, meal, !on, Date.now()))]);
    },
    setShopCheck(week, item, on) {
      base.setShopCheck(week, item, on);
      note([row(shopRow(week, item, !on, Date.now()))]);
    },
    clearShop(week) {
      const t = Date.now();
      const gone = base.shopChecks(week).map((item) => row(shopRow(week, item, true, t)));
      base.clearShop(week);
      note(gone);
    },
    setMeta(key, value) {
      if (isSplit(key)) {
        // Synced one record per row: note only the records that changed.
        const before = base.getMeta(key);
        base.setMeta(key, value);
        if (!paused && trackingOn()) note(itemChanges(key, before, value, Date.now()).map(row));
        return;
      }
      base.setMeta(key, value);
      if (!isLocalMeta(key)) note([{ id: rowId('meta', key), t: Date.now() }]);
    },
    dump(): Dump {
      const d = base.dump();
      for (const [k] of localKeys(d.meta)) delete d.meta[k];
      return d;
    },
    restore(d) {
      const before = base.dump();
      const keep = localKeys(before.meta);
      base.restore({ ...d, meta: Object.fromEntries(Object.entries(d.meta).filter(([k]) => !k.startsWith(SYNC_PREFIX))) });
      for (const [k, v] of keep) base.setMeta(k, v);
      if (paused || !trackingOn()) return;
      note(diffRows(before, d, Date.now()).map((r) => ({ id: rowId(r.kind, r.key), ...entry(r) })));
    },
  };
}
