// The safety net before anything that can destroy local data (first sync, restoring a backup, wiping the phone on
// sign-out): the pure part. What a snapshot file is called, when two snapshots are the same, which ones to keep, how much
// space one needs, and the state of the progress photos that were moved out of the way for a wipe. No file access here
// (that is src/lib/safetyIO.ts) and nothing that needs the network: recovery must work with Supabase unreachable.
// Tested in __tests__/safety.test.ts.
//
// A snapshot is a normal backup file (backup.ts `toBackup`, no photos), so the existing `parseBackup` + `applyBackup`
// and the restore card in settings read it unchanged. Snapshots live in `backups/safety/`, a folder the weekly automatic
// backup never lists or rotates (autoBackup.ts only reads files directly inside `backups/`).
import { PHOTO_NAME } from './backup';
import { isLocalMeta } from './metaKeys';
import type { Dump } from './storage.types';

/** `pre-signout`: a plain sign-out with changes that could not be sent (nothing is wiped; the copy is just in case). */
export type SnapshotReason = 'first-sync' | 'pre-restore' | 'pre-wipe' | 'pre-signout';
export const SNAPSHOT_REASONS: readonly SnapshotReason[] = ['first-sync', 'pre-restore', 'pre-wipe', 'pre-signout'];

const DAY = 86_400_000;
/** First-sync, pre-restore and pre-signout snapshots: the newest this many are kept... */
export const SNAPSHOT_KEEP = 5;
/** ...and anything younger than this many days is kept too. */
export const SNAPSHOT_FRESH_DAYS = 14;
/** A pre-wipe snapshot is kept this many days (decided with the owner). */
export const PRE_WIPE_DAYS = 30;
/** Progress photos moved aside for a wipe are kept this many days after the wipe (decided with the owner). */
export const RECOVERY_DAYS = 30;

export type SafetyCode = 'space' | 'io' | 'verify' | 'photos';
/** Why a safety copy could not be made. The operation that needed it must not go ahead. */
export class SafetyError extends Error {
  constructor(readonly code: SafetyCode, message: string) {
    super(message);
    this.name = 'SafetyError';
    Object.setPrototypeOf(this, SafetyError.prototype);
  }
}

// --- snapshot files ----------------------------------------------------------------------------------------------

export type SnapshotInfo = { name: string; reason: SnapshotReason; at: number; hash: string };
export type SnapshotResult = { name: string; reused: boolean };

const NAME = /^gym-safety-(first-sync|pre-restore|pre-wipe|pre-signout)-(\d{10,16})-([0-9a-f]{16})\.json$/;
const TMP = /^gym-safety-.+\.json\.tmp$/;

export const snapshotName = (reason: SnapshotReason, at: number, hash: string) => `gym-safety-${reason}-${at}-${hash}.json`;
export const tmpName = (name: string) => `${name}.tmp`;
/** A half-written snapshot left by an interrupted run. Never a usable copy. */
export const isTmpName = (name: string) => TMP.test(name);

export function parseSnapshotName(name: string): SnapshotInfo | null {
  const m = NAME.exec(name);
  return m ? { name, reason: m[1] as SnapshotReason, at: Number(m[2]), hash: m[3] } : null;
}

const fnv = (s: string, seed: number) => {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
};
const hex8 = (n: number) => n.toString(16).padStart(8, '0');
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * A fingerprint of what a backup file would hold (16 hex characters, two independent 32-bit hashes): the same data gives
 * the same hash whatever the order of its rows or meta keys. Phone-only meta keys (backup bookkeeping, UI state: `isLocalMeta`) are not part of it.
 */
export function dumpHash(d: Dump): string {
  const sets = d.sets
    .map((r) => [r.date, r.exId, r.idx, r.weekday, r.kg, r.reps, r.done ? 1 : 0, r.rir ?? null, r.at ?? null] as const)
    .sort((a, b) => cmp(`${a[0]}|${a[1]}|${String(a[2]).padStart(6, '0')}`, `${b[0]}|${b[1]}|${String(b[2]).padStart(6, '0')}`));
  const meals = d.meals.map((m) => [m.date, m.meal]).sort((a, b) => cmp(a.join('|'), b.join('|')));
  const shop = d.shop.map((x) => [x.week, x.item]).sort((a, b) => cmp(a.join('|'), b.join('|')));
  const meta = Object.keys(d.meta)
    .filter((k) => !isLocalMeta(k))
    .sort(cmp)
    .map((k) => [k, d.meta[k]]);
  const text = JSON.stringify([sets, meals, shop, meta]);
  return hex8(fnv(text, 0x811c9dc5)) + hex8(fnv(text, 0x9747b28c));
}

/**
 * Whether the phone holds anything a sync, restore or wipe could destroy: any set, tick or non-empty synced meta key
 * (settings count: the first sync replaces them). A phone that holds nothing needs no snapshot.
 */
export const hasAnythingToProtect = (d: Dump): boolean =>
  d.sets.length > 0 || d.meals.length > 0 || d.shop.length > 0 || Object.entries(d.meta).some(([k, v]) => !!v && !isLocalMeta(k));

/**
 * Whether real data is on the phone, for deciding an interrupted wipe (`recoveryAction`). Settings do not count: a wipe
 * that was cut off after clearing the data may have left them, and they must not turn it into a rollback.
 */
export const hasLocalData = (d: Dump): boolean => hasAnythingToProtect({ ...d, meta: { ...d.meta, settings: '' } });

/** Bytes of a string in UTF-8 (a file's size on disk). */
export function utf8Length(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}

const SPACE_MARGIN = 1_000_000;
/** Free space wanted before writing a snapshot of `bytes`: the file twice (temporary copy and final) plus a margin. */
export const spaceNeeded = (bytes: number) => bytes * 2 + SPACE_MARGIN;
/** An unknown amount of free space (the API gave nothing) does not block; a failed write still does. */
export const enoughSpace = (available: number | null | undefined, need: number) => typeof available !== 'number' || !Number.isFinite(available) || available >= need;

/** The newest snapshot of this reason with exactly this data, if there is one (no new file needed). */
export function findReusable(files: readonly SnapshotInfo[], reason: SnapshotReason, hash: string): SnapshotInfo | null {
  return [...files].filter((f) => f.reason === reason && f.hash === hash).sort((a, b) => b.at - a.at)[0] ?? null;
}

/** Which snapshots to keep and which to delete. Pure: `now` is a parameter. */
export function retentionPlan(files: readonly SnapshotInfo[], now: number): { keep: SnapshotInfo[]; remove: SnapshotInfo[] } {
  const keep = new Set<string>();
  for (const reason of SNAPSHOT_REASONS) {
    const mine = files.filter((f) => f.reason === reason).sort((a, b) => b.at - a.at);
    mine.forEach((f, i) => {
      const age = now - f.at; // a snapshot stamped in the future (clock change) counts as young
      if (reason === 'pre-wipe' ? age < PRE_WIPE_DAYS * DAY : i < SNAPSHOT_KEEP || age < SNAPSHOT_FRESH_DAYS * DAY) keep.add(f.name);
    });
  }
  return { keep: files.filter((f) => keep.has(f.name)), remove: files.filter((f) => !keep.has(f.name)) };
}

// --- progress photos moved aside for a wipe ----------------------------------------------------------------------

/**
 * `moving`: the photos are being moved into the recovery folder (or all moved) and the wipe has not finished.
 * `ready`: every photo is moved, the wipe has not finished.
 * `wiped`: the wipe finished; the folder is kept RECOVERY_DAYS days.
 * The state is a file inside the recovery folder (not a meta key): sign-out, unlink and restore all rewrite or keep
 * meta keys, and a marker there would survive a wipe and go stale. Files are not touched by any of them.
 */
export type RecoveryState = 'moving' | 'ready' | 'wiped';
export type RecoveryManifest = { v: 1; state: RecoveryState; names: string[]; wipedAt?: number };
export const RECOVERY_MANIFEST = 'manifest.json';
const RECOVERY_ID = /^photos-(\d{10,16})$/;

export const recoveryId = (now: number) => `photos-${now}`;
export const isRecoveryId = (id: string) => RECOVERY_ID.test(id);
/** When the recovery folder was made, from its name (the manifest may be missing or broken). */
export const recoveryCreatedAt = (id: string): number | null => {
  const m = RECOVERY_ID.exec(id);
  return m ? Number(m[1]) : null;
};

export const toManifest = (state: RecoveryState, names: readonly string[], wipedAt?: number): string =>
  JSON.stringify({ v: 1, state, names: [...names], ...(wipedAt != null ? { wipedAt } : null) } satisfies RecoveryManifest);

/** Reads a manifest; null when it is missing, broken or from something else. */
export function parseManifest(text: string | null | undefined): RecoveryManifest | null {
  if (!text) return null;
  try {
    const o = JSON.parse(text) as Record<string, unknown>;
    if (o.v !== 1 || (o.state !== 'moving' && o.state !== 'ready' && o.state !== 'wiped')) return null;
    const names = Array.isArray(o.names) ? o.names.filter((n): n is string => typeof n === 'string' && PHOTO_NAME.test(n)) : [];
    return { v: 1, state: o.state, names, ...(typeof o.wipedAt === 'number' ? { wipedAt: o.wipedAt } : null) };
  } catch {
    return null;
  }
}

export type RecoveryAction = 'rollback' | 'mark-wiped' | 'purge' | 'keep';
/**
 * What to do with a recovery folder when the app starts.
 * - A finished wipe: keep it, then delete it RECOVERY_DAYS days after the wipe.
 * - An unfinished one (a missing or broken manifest counts as unfinished) and data is still on the phone: the wipe never
 *   happened, so put the photos back.
 * - An unfinished one and the phone is empty: the wipe did happen and only its last note was lost; mark it finished.
 * An unfinished folder is never deleted, whatever its age.
 */
export function recoveryAction(m: RecoveryManifest | null, createdAt: number, hasLocalData: boolean, now: number): RecoveryAction {
  if (m?.state === 'wiped') return now - (m.wipedAt ?? createdAt) >= RECOVERY_DAYS * DAY ? 'purge' : 'keep';
  return hasLocalData ? 'rollback' : 'mark-wiped';
}
