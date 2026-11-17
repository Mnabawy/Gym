// The change log for Supabase sync: wraps the phone's storage so every write (a set, a meal tick, a meta key...) is
// noted as "changed here" until src/lib/cloud.ts has sent it. Only while sync is on (meta `sync.on`); before that, the
// first sync compares everything. The log is meta `sync.dirty`. `sync.*` keys stay on this phone: they're left out of
// dump() (backups) and survive restore().
import { diffRows, entry, isLocalMeta, itemChanges, mealRow, noteTombs, readTombs, rowId, setRow, shopRow, isSplit, SYNC_PREFIX, TOMBS, type CloudRow, type Dirty } from './cloudSync';
import type { Dump, Storage } from './storage.types';

const ON = 'sync.on';
const DIRTY = 'sync.dirty';
/** '1': sync is off but writes are still noted (signed out with changes unsent; the same account sends them on sign-in). */
const LOG_ONLY = 'sync.logOnly';
/** When "log only" started (ms): the signed-out log is dropped after LOG_ONLY_DAYS. */
const LOG_SINCE = 'sync.logSince';
/** The account the kept log belongs to (cloud.ts); dropped with the log. */
export const LAST_UID = 'sync.lastUid';
/**
 * A signed-out log is kept at most this long, and at most LOG_ONLY_MAX entries: past that it's dropped (with the account
 * it belongs to), and signing back in runs a full first sync instead (the server's rows win on overlap, phone-only rows
 * go up), so nothing on the phone is lost, only edits to rows the server also has. Keeps sync.dirty from growing forever.
 */
export const LOG_ONLY_DAYS = 30;
export const LOG_ONLY_MAX = 5000;

let raw: Storage;
let D: Dirty | null = null;
let paused = 0;
const listeners = new Set<() => void>();

/** The storage without the change log (putting pulled rows on the phone). */
export const rawStorage = (): Storage => raw;
export const trackingOn = () => raw.getMeta(ON) === '1';
/** Writes are noted: sync is on, or it's off but the change log is kept for the account signed out of. */
const recording = () => trackingOn() || raw.getMeta(LOG_ONLY) === '1';
/**
 * Sync on or off. Off with `keepLog`: the change log stays and writes keep being noted ("log only"; cloudLinked and
 * syncCloud still see sync as off). Off without it: the log is dropped.
 */
export function setTracking(on: boolean, keepLog = false) {
  raw.setMeta(ON, on ? '1' : '');
  raw.setMeta(LOG_ONLY, !on && keepLog ? '1' : '');
  raw.setMeta(LOG_SINCE, !on && keepLog ? String(Date.now()) : '');
  if (!on && !keepLog) {
    D = {};
    saveDirty();
  }
}
/** Drops the change log and stops "log only" noting (does not touch sync on/off). */
export function clearLog() {
  raw.setMeta(LOG_ONLY, '');
  raw.setMeta(LOG_SINCE, '');
  D = {};
  saveDirty();
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
/**
 * Changing the log together with other writes in one transaction: change a copy (`{ ...dirty() }`), save it with
 * `writeDirty` inside the transaction, and once it has committed make it the log with `adoptDirty`. If the transaction
 * fails, the log in memory is still the one that matches what's stored.
 */
export function writeDirty(next: Dirty) {
  raw.setMeta(DIRTY, JSON.stringify(next));
}
export function adoptDirty(next: Dirty) {
  D = next;
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

/**
 * Signed out with a kept log: drops it (and the account it's for) once it's older than LOG_ONLY_DAYS or has more than
 * LOG_ONLY_MAX entries. True when it was dropped. A log from before `sync.logSince` existed starts counting now.
 */
export function expireLogOnly(now = Date.now()): boolean {
  if (trackingOn() || raw.getMeta(LOG_ONLY) !== '1') return false;
  const since = Number(raw.getMeta(LOG_SINCE) || 0);
  if (!since) {
    raw.setMeta(LOG_SINCE, String(now));
    return false;
  }
  if (now - since <= LOG_ONLY_DAYS * 86400000 && Object.keys(dirty()).length <= LOG_ONLY_MAX) return false;
  clearLog();
  raw.setMeta(LAST_UID, '');
  return true;
}

function note(rows: { id: string; t: number; row?: CloudRow }[]) {
  if (paused || !rows.length || !recording()) return;
  const d = dirty();
  for (const r of rows) d[r.id] = r.row ? { t: r.t, row: r.row } : { t: r.t };
  if (!trackingOn() && expireLogOnly()) return;
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
        if (paused) return;
        const t = Date.now();
        const rows = itemChanges(key, before, value, t);
        // Records deleted here are remembered (also while sync is off), so an older build's whole value can't bring them back.
        const tombs = readTombs(base.getMeta(TOMBS));
        if (noteTombs(tombs, rows, t)) base.setMeta(TOMBS, JSON.stringify(tombs));
        if (recording()) note(rows.map(row));
        return;
      }
      base.setMeta(key, value);
      if (!isLocalMeta(key)) note([{ id: rowId('meta', key), t: Date.now() }]);
    },
    transaction(f) {
      // Writes noted inside go into the log in memory as they happen; if the transaction rolls back, so must the log
      // (else it would send values the phone no longer has).
      const before = { ...dirty() };
      try {
        base.transaction(f);
      } catch (e) {
        D = before;
        throw e;
      }
    },
    dump(): Dump {
      const d = base.dump();
      for (const [k] of localKeys(d.meta)) delete d.meta[k];
      return d;
    },
    restore(d) {
      const before = base.dump();
      const keep: Record<string, string> = Object.fromEntries(localKeys(before.meta));
      // The restore is noted (sent while sync is on): the new log is written with the data, in the same transaction.
      let next: Dirty | null = null;
      if (!paused && recording()) {
        next = { ...dirty() };
        for (const r of diffRows(before, d, Date.now())) next[rowId(r.kind, r.key)] = entry(r);
        keep[DIRTY] = JSON.stringify(next);
      }
      // One transaction (base.restore): the backup's data and this phone's own sync keys go in together, so a crash
      // can't leave the data replaced with the session, cursor or change log gone.
      base.restore({ ...d, meta: { ...Object.fromEntries(Object.entries(d.meta).filter(([k]) => !k.startsWith(SYNC_PREFIX))), ...keep } });
      if (!next) return;
      D = next;
      if (!trackingOn() && expireLogOnly()) return;
      for (const f of listeners) f();
    },
  };
}
