// Sync with Supabase (settings/account → المزامنة): every record lives on the server too, so deleting the app or a new
// phone brings everything back by signing in with the same Google account, and two phones stay the same.
// How: each write is noted (track.ts); a few seconds later, on opening, on coming back and on leaving the app we pull
// what changed on the server since last time, merge (newest edit of each record wins, cloudSync.ts) and send ours.
// The first sync on a phone pulls everything; the server wins where both have the same record, and anything only on the
// phone goes up. Photos aren't synced. Setup (project, table, Google provider): docs/supabase-setup.md.
import { useDataVersion } from './bus';
import { pullRows, pushRows, PAGE, PUSH_BATCH, refreshSession, signInWithGoogle, CloudError, type CloudConfig, type Session } from './cloudApi';
import { applyRows, entry, localRows, SPLIT_META, splitKey, pushItems, rowId, type Pulled } from './cloudSync';
import { GOOGLE_USER, googleIdToken } from './google';
import { useSettings } from './settings';
import { storage } from './storage';
import { dirty, rawStorage, saveDirty, setTracking, trackingOn } from './track';

const CONFIG: CloudConfig = { url: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '', key: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '' };
/** The build has a Supabase project (env vars at build time). */
export const cloudConfigured = !!(CONFIG.url && CONFIG.key);

/** Meta keys (this phone only): the session, the last rev pulled, last good sync (ms), last error. */
const SESSION = 'sync.session';
const CURSOR = 'sync.cursor';
/** '1' once this phone's first full sync finished (pulled everything and queued what only the phone has). */
const FULL = 'sync.full';
/** Which keys this phone has already sent one record per row (after updating, each record goes up once). */
const SPLIT_SENT = 'sync.split';
export const SYNC_AT = 'sync.at';
export const SYNC_ERROR = 'sync.error';

const meta = (k: string) => rawStorage().getMeta(k);
const setMeta = (k: string, v: string) => rawStorage().setMeta(k, v);

export const cloudLinked = () => cloudConfigured && trackingOn() && !!meta(SESSION);
export const pendingChanges = () => Object.keys(dirty()).length;

function readSession(): Session | null {
  try {
    return JSON.parse(meta(SESSION) || 'null') as Session | null;
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
    s = s ? await refreshSession(CONFIG, s.refresh, fetch).catch(() => freshSignIn()) : await freshSignIn();
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
  try {
    const token = await accessToken();
    // Until the first full sync finishes (it may be cut off midway), each sync also queues what only the phone has.
    const first = meta(FULL) !== '1';
    let cursor = Number(meta(CURSOR) || 0);
    const seen = new Set<string>();
    const changedMeta: string[] = [];
    let changed = false;
    // Pull: everything after the last rev we saw.
    for (;;) {
      const rows: Pulled[] = await pullRows(CONFIG, token, cursor, fetch);
      if (!rows.length) break;
      const d = dirty();
      rawStorage().transaction(() => {
        const r = applyRows(rows, d, rawStorage());
        changed ||= r.changed;
        changedMeta.push(...r.meta);
      });
      saveDirty();
      for (const r of rows) seen.add(rowId(r.kind, r.key));
      cursor = rows[rows.length - 1].rev;
      setMeta(CURSOR, String(cursor));
      if (rows.length < PAGE) break;
    }
    if (first) {
      // First sync on this phone: what the server doesn't have yet goes up.
      const d = dirty();
      for (const r of localRows(storage.dump(), Date.now())) {
        const id = rowId(r.kind, r.key);
        if (!seen.has(id) && !d[id]) d[id] = entry(r);
      }
      saveDirty();
      setMeta(CURSOR, String(cursor));
      setMeta(FULL, '1');
    }
    const split = Object.keys(SPLIT_META).join(',');
    if (meta(SPLIT_SENT) !== split) {
      // Habits, goals, quits and tasks used to go as one value: send each record once (the server then has them all).
      const d = dirty();
      for (const r of localRows(storage.dump(), Date.now())) {
        const id = rowId(r.kind, r.key);
        if (splitKey(r.key) && !d[id]) d[id] = entry(r);
      }
      saveDirty();
      setMeta(SPLIT_SENT, split);
    }
    // Push what changed here, in batches; an entry edited again meanwhile stays for next time.
    const items = pushItems(dirty(), (k) => rawStorage().getMeta(k));
    for (let i = 0; i < items.length; i += PUSH_BATCH) {
      const part = items.slice(i, i + PUSH_BATCH);
      await pushRows(CONFIG, token, part.map((x) => x.row), fetch);
      const d = dirty();
      for (const x of part) if (d[x.id]?.t === x.t) delete d[x.id];
      saveDirty();
    }
    setMeta(SYNC_AT, String(Date.now()));
    setMeta(SYNC_ERROR, '');
    if (changed) {
      if (changedMeta.some((k) => k === 'settings' || k === 'program')) useSettings.getState().reload();
      else useDataVersion.getState().bumpAll();
    } else useDataVersion.getState().bump();
  } catch (e) {
    setMeta(SYNC_ERROR, String(Date.now()));
    useDataVersion.getState().bump();
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
  const old = readSession();
  // Another account than before: start over (drop the old account's pending changes; this phone's data goes up whole).
  if (old && old.uid !== s.uid) {
    setTracking(false);
    setMeta(CURSOR, '');
    setMeta(FULL, '');
  }
  setMeta(SESSION, JSON.stringify(s));
  if (!trackingOn()) {
    setMeta(CURSOR, '');
    setMeta(FULL, '');
    setTracking(true);
  }
  await syncCloud();
}

/** Sync off on this phone (sign-out). The data on the server stays. */
export function unlinkCloud() {
  setTracking(false);
  for (const k of [SESSION, CURSOR, FULL, SYNC_AT, SYNC_ERROR]) setMeta(k, '');
}

/**
 * What the app runs on its own (after a change, on open, coming back, leaving): sync — or, signed in to Google but
 * sync not on yet (it failed before, e.g. offline at the welcome screen), turn it on. Never throws.
 */
export function keepSynced(): Promise<void> {
  if (!cloudConfigured) return Promise.resolve();
  const p = !cloudLinked() && storage.getMeta(GOOGLE_USER) ? linkCloud() : syncCloud();
  return p.then(() => undefined, () => undefined);
}

export type SyncStatus = { state: 'off' | 'saved' | 'waiting' | 'failed'; at: number; waiting: number };
/** In plain terms: off (not signed in / not set up), saved (all on your account), waiting (changes not sent yet), failed. */
export function syncStatus(): SyncStatus {
  const at = Number(meta(SYNC_AT) || 0);
  if (!cloudLinked()) return { state: 'off', at, waiting: 0 };
  const waiting = pendingChanges();
  if (meta(SYNC_ERROR)) return { state: 'failed', at, waiting };
  return { state: waiting || !at ? 'waiting' : 'saved', at, waiting };
}
