// Sync with Supabase (settings/account → المزامنة): every record lives on the server too, so deleting the app or a new
// phone brings everything back by signing in with the same Google account, and two phones stay the same.
// How: each write is noted (track.ts); a few seconds later, on opening, on coming back and on leaving the app we pull
// what changed on the server since last time, merge (newest edit of each record wins, cloudSync.ts) and send ours.
// The first sync on a phone pulls everything; the server wins where both have the same record, and anything only on the
// phone goes up. Photos aren't synced. Setup (project, table, Google provider): docs/supabase-setup.md.
import { useDataVersion } from './bus';
import { pullPage, pushRows, PAGE, PUSH_BATCH, refreshSession, signInWithGoogle, CloudError, type CloudConfig, type Session } from './cloudApi';
import { ackBatch, advanceWindow, applyRows, clampDirty, emptyWindow, entry, expandWhole, isSplit, localRows, readCursor, readWindow, settleWhole, SKEW_MARGIN_MS, snapWhole, SPLIT_META, splitKey, pushItems, rowId, rowsPerEntry, type Pulled } from './cloudSync';
import { DATA_VERSION_KEY, dataTooNew, readDataVersion, versionToWrite } from './dataVersion';
import { report } from './errlog';
import { GOOGLE_NAME, GOOGLE_PHOTO, GOOGLE_USER, googleIdToken } from './google';
import { hasAnythingToProtect, SafetyError } from './safety';
import { createSnapshot } from './safetyIO';
import { useSettings } from './settings';
import { storage } from './storage';
import { clearLog, dirty, expireLogOnly, LAST_UID, rawStorage, saveDirty, setTracking, trackingOn, adoptDirty, writeDirty } from './track';

const CONFIG: CloudConfig = { url: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '', key: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '' };
/** The build has a Supabase project (env vars at build time). */
export const cloudConfigured = !!(CONFIG.url && CONFIG.key);

/** Meta keys (this phone only): the session, the last rev pulled, last good sync (ms), last error. */
const SESSION = 'sync.session';
/** The Supabase user this phone's sync is linked to (set by linkCloud, cleared by unlinkCloud). */
const UID = 'sync.uid';
const CURSOR = 'sync.cursor';
/** Where the next pull starts and which revs were applied already (cloudSync.ts PullWindow); goes with the cursor. */
const WINDOW = 'sync.window';
/** '1' once this phone's first full sync finished (pulled everything and queued what only the phone has). */
const FULL = 'sync.full';
/**
 * Which keys this phone has already sent one record per row (comma list). When a build splits more keys, the next sync
 * pulls everything again once (an older build skipped the new per-record rows it pulled) and sends each record of the
 * newly split keys once.
 */
const SPLIT_SENT = 'sync.split';
export const SYNC_AT = 'sync.at';
export const SYNC_ERROR = 'sync.error';
/** 'update' while the account's data is newer than this build (dataVersion.ts): nothing is sent until the app is updated. */
const SYNC_BLOCKED = 'sync.blocked';

/**
 * Thrown when signing in again (an expired session) gave a different account than the one sync is linked to: nothing is
 * pulled or sent, sync is turned off and the phone shows as signed out (the change log stays tied to the old account).
 */
export class AccountChanged extends Error {
  constructor() {
    super('signed in to a different account than the one sync is linked to');
    this.name = 'AccountChanged';
  }
}

/** Thrown by a sync that pulled but sent nothing because the account's data is newer than this build. */
export class UpdateNeeded extends Error {
  constructor() {
    super('update the app to keep saving');
    this.name = 'UpdateNeeded';
  }
}

const meta = (k: string) => rawStorage().getMeta(k);
const setMeta = (k: string, v: string) => rawStorage().setMeta(k, v);

/** Linked = sync on and a readable session saved (a broken one counts as none, everywhere). */
export const cloudLinked = () => cloudConfigured && trackingOn() && !!readSession();
export const pendingChanges = () => Object.keys(dirty()).length;

function readSession(): Session | null {
  try {
    const s = JSON.parse(meta(SESSION) || 'null') as Partial<Session> | null;
    return s && typeof s === 'object' && typeof s.access === 'string' && typeof s.refresh === 'string' && typeof s.exp === 'number' && typeof s.uid === 'string' ? (s as Session) : null;
  } catch {
    return null;
  }
}

async function freshSignIn(): Promise<Session> {
  const id = await googleIdToken();
  if (!id) throw new CloudError(401, 'no Google id token');
  return signInWithGoogle(CONFIG, id, fetch);
}

/** A valid access token: the saved one, refreshed when it's about to run out, or a new sign-in with Google. */
async function accessToken(): Promise<string> {
  let s = readSession();
  if (!s || s.exp - 60_000 < Date.now()) {
    const linked = meta(UID) || s?.uid || '';
    s = s ? await refreshSession(CONFIG, s.refresh, fetch).catch(() => freshSignIn()) : await freshSignIn();
    // The phone's Google account changed under a linked sync: never move this phone's data to another account silently.
    if (linked && s.uid !== linked) {
      unlinkCloud(); // keeps the change log, tied to the linked account
      for (const k of [GOOGLE_USER, GOOGLE_NAME, GOOGLE_PHOTO]) setMeta(k, ''); // signed out: no automatic re-link
      throw new AccountChanged();
    }
    setMeta(SESSION, JSON.stringify(s));
  }
  return s.access;
}

let running: Promise<'ok' | 'off'> | null = null;
let again = false;

/** Pull, merge, push. One at a time; a call while one runs makes it go once more after. */
export function syncCloud(): Promise<'ok' | 'off'> {
  if (!cloudLinked()) return Promise.resolve('off');
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        await syncOnce();
      } while (again);
      return 'ok' as const;
    } finally {
      running = null;
    }
  })();
  return running;
}

async function syncOnce() {
  const changedMeta: string[] = [];
  let changed = false;
  /** Screens re-read what a pull changed (settings and the program reload). */
  const refresh = () => {
    if (changed) {
      if (changedMeta.some((k) => k === 'settings' || k === 'program')) useSettings.getState().reload();
      else useDataVersion.getState().bumpAll();
    } else useDataVersion.getState().bump();
  };
  try {
    const token = await accessToken();
    // Until the first full sync finishes (it may be cut off midway), each sync also queues what only the phone has.
    const first = meta(FULL) !== '1';
    const split = Object.keys(SPLIT_META).join(',');
    const sentBefore = meta(SPLIT_SENT) ?? '';
    // More keys split than when this phone last synced: rows for them pulled by the older build were skipped, so pull
    // everything again (applying a row twice is harmless; changes waiting here still win when newer).
    const repull = !(first || sentBefore === split);
    // A broken cursor (not a whole number) would make every pull fail: it counts as 0, everything is pulled again.
    let cursor = repull ? 0 : readCursor(meta(CURSOR));
    let win = repull ? emptyWindow() : readWindow(meta(WINDOW), cursor);
    const applied = new Set(win.revs);
    const seen = new Set<string>();
    let pulledVersion = 1;
    // Keys an older build noted as a whole and never sent (it was blocked, or offline): their value now, before the pull
    // can overwrite its records; after it, their edits and deletes are worked out (settleWhole).
    const snap = snapWhole(dirty(), (k) => rawStorage().getMeta(k));
    const base: Record<string, { v: string; at: number }> = {};
    const newer: Record<string, number> = {};
    // The server's clock minus this phone's (ms), from the pull's Date header; null = unknown (then nothing is clamped).
    let offset: number | null = null;
    // Pull: from a little behind the cursor (rows that committed late), see PullWindow.
    const start = Date.now();
    const known = cursor;
    let from = win.safe;
    for (;;) {
      const t0 = Date.now();
      const page = await pullPage(CONFIG, token, from, fetch);
      const rows: Pulled[] = page.rows;
      const at = Date.now();
      // The Date header was made after t0 and is cut to the second, so header + 1 s - t0 can only overestimate the server's
      // lead: a correct phone is never clamped. A slow reply makes the sample too loose to trust: skipped.
      if (page.serverTime != null && at - t0 <= SKEW_MARGIN_MS) offset = page.serverTime + 1000 - t0;
      const prev = from;
      const top = rows.length ? rows[rows.length - 1].rev : NaN;
      if (Number.isSafeInteger(top) && top > from) from = top;
      // The last page: a short one that reached the old cursor (a short page still inside the part read again asks for
      // more), an empty one, or one that didn't move past `from` (a broken reply: stop instead of asking forever).
      const last = !rows.length || from === prev || (rows.length < PAGE && from >= known);
      cursor = Math.max(cursor, from);
      win = advanceWindow(win, rows.map((r) => r.rev), { cursor, covered: last ? cursor : from, at, start });
      // A copy of the log is changed and written with the rows, the cursor and the window in one transaction; it becomes
      // the log only once that committed.
      let d = { ...dirty() };
      if (offset != null) d = clampDirty(d, Date.now() + offset + SKEW_MARGIN_MS).dirty;
      // A whole-key entry stamped lower: its snapshot follows, so settleWhole still recognizes it as the same edit.
      for (const [k, sn] of Object.entries(snap)) {
        const e = d[rowId('meta', k)];
        if (e && !e.row && e.t < sn.t) sn.t = e.t;
      }
      const fresh = rows.filter((r) => !applied.has(r.rev));
      rawStorage().transaction(() => {
        if (fresh.length) {
          const r = applyRows(fresh, d, rawStorage());
          changed ||= r.changed;
          changedMeta.push(...r.meta);
        }
        writeDirty(d);
        setMeta(CURSOR, String(cursor));
        setMeta(WINDOW, JSON.stringify(win));
      });
      adoptDirty(d);
      for (const r of rows) {
        applied.add(r.rev);
        seen.add(rowId(r.kind, r.key));
        if (r.kind === 'meta' && snap[r.key] && isSplit(r.key) && !r.deleted && typeof r.data === 'string') base[r.key] = { v: r.data, at: r.updated_at };
        const sp = r.kind === 'meta' ? splitKey(r.key) : null;
        if (sp && snap[sp.key]) newer[rowId(r.kind, r.key)] = Math.max(newer[rowId(r.kind, r.key)] ?? -Infinity, r.updated_at);
        if (r.kind === 'meta' && r.key === DATA_VERSION_KEY && !r.deleted && typeof r.data === 'string') pulledVersion = Math.max(pulledVersion, readDataVersion(r.data));
      }
      if (last) break;
    }
    /** A time stamp for what goes up: never later than the server's now + a margin (a phone clock running ahead). */
    const cap = (t: number) => (offset == null ? t : Math.min(t, Date.now() + offset + SKEW_MARGIN_MS));
    if (first) {
      // First sync on this phone: what the server doesn't have yet goes up.
      const d = dirty();
      for (const r of localRows(storage.dump(), cap(Date.now()))) {
        const id = rowId(r.kind, r.key);
        if (!seen.has(id) && !d[id]) d[id] = entry(r);
      }
      saveDirty();
      setMeta(FULL, '1');
    }
    if (Object.keys(snap).length) {
      const d = { ...dirty() };
      rawStorage().transaction(() => {
        const keys = settleWhole(snap, base, newer, d, rawStorage());
        if (keys.length) changed = true;
        changedMeta.push(...keys);
        writeDirty(d);
      });
      adoptDirty(d);
    }
    // Anything still noted as one value (edited again during the pull): one entry per record it holds.
    if (expandWhole(dirty(), (k) => rawStorage().getMeta(k))) saveDirty();
    if (sentBefore !== split) {
      // Keys that used to go as one value: send each of their records once (the server then has them all; a first sync
      // already queued what the server doesn't have). The old whole-value row stays on the server: a phone on an older
      // build still reads it (a delete would empty that key there), and a newer build only adds the records it's
      // missing from it.
      const had = new Set(first ? Object.keys(SPLIT_META) : sentBefore.split(','));
      // An older build stored the record rows it pulled for keys it didn't split as plain keys (`notes/bench`): drop them.
      for (const k of Object.keys(storage.dump().meta)) if (splitKey(k)) rawStorage().setMeta(k, '');
      const d = dirty();
      for (const r of localRows(storage.dump(), cap(Date.now()))) {
        const id = rowId(r.kind, r.key);
        const sp = splitKey(r.key);
        if (sp && !had.has(sp.key) && !d[id]) d[id] = entry(r);
      }
      saveDirty();
      setMeta(SPLIT_SENT, split);
    }
    // The highest version seen wins, even when an edit here kept the pulled row out (dataVersion.ts).
    if (pulledVersion > readDataVersion(meta(DATA_VERSION_KEY))) setMeta(DATA_VERSION_KEY, String(pulledVersion));
    // Data written by a newer build: keep what was pulled, send nothing (it waits for the app to be updated).
    if (dataTooNew(meta(DATA_VERSION_KEY))) {
      setMeta(SYNC_BLOCKED, 'update');
      throw new UpdateNeeded();
    }
    setMeta(SYNC_BLOCKED, '');
    const v = versionToWrite(meta(DATA_VERSION_KEY));
    if (v) storage.setMeta(DATA_VERSION_KEY, v); // noted, so it goes up with the rest
    // Push what changed here, in batches; an entry edited again meanwhile stays for next time. An entry that goes as
    // several rows (a split key an older build noted as a whole) is cleared only once all of them were accepted.
    const items = pushItems(dirty(), (k) => rawStorage().getMeta(k));
    const left = rowsPerEntry(items);
    for (let i = 0; i < items.length; i += PUSH_BATCH) {
      const part = items.slice(i, i + PUSH_BATCH);
      await pushRows(CONFIG, token, part.map((x) => ({ ...x.row, updated_at: cap(x.row.updated_at) })), fetch);
      ackBatch(dirty(), part, left);
      saveDirty();
    }
    setMeta(SYNC_AT, String(Date.now()));
    setMeta(SYNC_ERROR, '');
    refresh();
  } catch (e) {
    setMeta(SYNC_ERROR, String(Date.now()));
    refresh();
    throw e;
  }
}

/**
 * Turns sync on for the Google account the phone is signed in with (after linkGoogle) and runs the first sync, which
 * brings back everything on the server and sends what's only here. Throws if Supabase sign-in fails.
 */
export async function linkCloud(): Promise<void> {
  if (!cloudConfigured || !storage.getMeta(GOOGLE_USER)) return;
  const s = await freshSignIn();
  expireLogOnly(); // a signed-out log past its limit is not sent: the full first sync below runs instead
  const old = readSession();
  const before = meta(UID) || old?.uid || meta(LAST_UID);
  // Before anything is switched on or the first sync merges the server's rows into this phone: a safety copy of what's
  // here (a SafetyError stops here, nothing is changed and sync stays off). A phone with nothing on it needs none.
  if (meta(FULL) !== '1' || !trackingOn() || (before && before !== s.uid)) {
    const d = storage.dump();
    if (hasAnythingToProtect(d)) await createSnapshot('first-sync', d);
  }
  // Another account than before: start over (drop the old account's pending changes; this phone's data goes up whole).
  if (before && before !== s.uid) {
    setTracking(false);
    setMeta(CURSOR, '');
    setMeta(WINDOW, '');
    setMeta(FULL, '');
    setMeta(DATA_VERSION_KEY, ''); // the old account's data version must not block this one; the first pull sets it again
  }
  setMeta(SESSION, JSON.stringify(s));
  setMeta(UID, s.uid);
  setMeta(LAST_UID, '');
  if (!trackingOn()) {
    setMeta(CURSOR, '');
    setMeta(WINDOW, '');
    setMeta(FULL, '');
    setTracking(true);
  }
  await syncCloud();
}

/**
 * Sync off on this phone (sign-out). The data on the server stays. After a plain sign-out the change log is kept and
 * writes keep being noted, tied to this account: signing back in to the same one sends them (edits and deletes made
 * while signed out win over the server's older rows), a different account or a restored backup drops them. After a
 * wipe (`wiped`) nothing is kept.
 */
export function unlinkCloud(wiped = false) {
  const uid = meta(UID) || readSession()?.uid;
  const keep = !!uid && !wiped;
  setTracking(false, keep);
  setMeta(LAST_UID, keep ? uid : '');
  for (const k of [SESSION, UID, CURSOR, WINDOW, FULL, SYNC_AT, SYNC_ERROR, SYNC_BLOCKED]) setMeta(k, '');
}

/**
 * After a backup was put back while signed out: the data was replaced, so a change log kept from the last sign-out
 * means nothing any more. Drop it and forget that account. Nothing happens while sync is on (the restore is sent).
 */
export function dropSignedOutLog() {
  if (cloudLinked()) return;
  clearLog();
  setMeta(LAST_UID, '');
}

/**
 * What the app runs on its own (after a change, on open, coming back, leaving): sync — or, signed in to Google but
 * sync not on yet (it failed before, e.g. offline at the welcome screen), turn it on. Never throws.
 */
export function keepSynced(): Promise<void> {
  if (!cloudConfigured) return Promise.resolve();
  const p = !cloudLinked() && storage.getMeta(GOOGLE_USER) ? linkCloud() : syncCloud();
  return p.then(() => undefined, (e) => {
    if (!(e instanceof UpdateNeeded)) report(e, 'sync'); // not a fault: shown on the account page until the app is updated
    // A failed safety copy stops sync from turning on: show it as failed instead of staying silent.
    if (e instanceof SafetyError) setMeta(SYNC_ERROR, String(Date.now()));
  });
}

/** `reason` 'update': failed because the account's data is newer than this build (update the app). */
export type SyncStatus = { state: 'off' | 'saved' | 'waiting' | 'failed'; at: number; waiting: number; reason?: 'update' };
/** In plain terms: off (not signed in / not set up), saved (all on your account), waiting (changes not sent yet), failed. */
export function syncStatus(): SyncStatus {
  const at = Number(meta(SYNC_AT) || 0);
  if (!cloudLinked()) return cloudConfigured && storage.getMeta(GOOGLE_USER) && meta(SYNC_ERROR) ? { state: 'failed', at, waiting: 0 } : { state: 'off', at, waiting: 0 };
  const waiting = pendingChanges();
  if (meta(SYNC_BLOCKED)) return { state: 'failed', at, waiting, reason: 'update' };
  if (meta(SYNC_ERROR)) return { state: 'failed', at, waiting };
  return { state: waiting || !at ? 'waiting' : 'saved', at, waiting };
}
