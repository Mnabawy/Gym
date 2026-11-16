// The safety net before anything that can destroy local data: the part that touches files (iOS / Android). Pure rules are
// in src/lib/safety.ts. Everything here works offline and without any account: a snapshot is a file in the app's own
// folder, and a recovery is a move of files inside it. Web: safetyIO.web.ts.
//
// Where things live (inside Paths.document, which the weekly automatic backup never rotates or deletes from):
//   backups/safety/gym-safety-<reason>-<ms>-<hash>.json   snapshots (autoBackup.ts only reads files directly in backups/)
//   recovery/photos-<ms>/                                  progress photos moved aside for a wipe, with manifest.json
//
// Snapshot write protocol: space check → write `<name>.tmp` → read it back and compare its hash with the live data →
// rename to the final name (`writeVerified` in verifiedWrite.ts, shared with the weekly automatic backup). Only a finished, verified file counts; a crash before the rename leaves a .tmp that the next
// call deletes. Photo protocol: write the manifest first, move the files one by one, and on any failure put the moved
// ones back. The state lives in the manifest file, not in meta: sign-out, unlink and restore keep or rewrite meta keys
// (track.ts re-applies every `sync.*` key after a restore), so a meta marker would survive a wipe and go stale.
import { Directory, File, Paths } from 'expo-file-system';
import { PHOTO_NAME, toBackup } from './backup';
import {
  dumpHash,
  enoughSpace,
  findReusable,
  isRecoveryId,
  isTmpName,
  parseManifest,
  parseSnapshotName,
  recoveryAction,
  recoveryCreatedAt,
  recoveryId,
  RECOVERY_MANIFEST,
  retentionPlan,
  SafetyError,
  snapshotName,
  spaceNeeded,
  toManifest,
  utf8Length,
  type RecoveryManifest,
  type RecoveryState,
  type SnapshotInfo,
  type SnapshotReason,
  type SnapshotResult,
} from './safety';
import type { Dump } from './storage.types';
import { writeVerified } from './verifiedWrite';

export const safetySupported = true;

/** The folder photos.ts keeps the photos in (`Paths.document/photos`). */
const PHOTOS = 'photos';

const ensure = (d: Directory) => {
  if (!d.exists) d.create({ intermediates: true });
  return d;
};
const snapshotDir = () => ensure(new Directory(Paths.document, 'backups', 'safety'));
const recoveryRoot = () => ensure(new Directory(Paths.document, 'recovery'));
const photoDir = () => ensure(new Directory(Paths.document, PHOTOS));
const filesIn = (d: Directory): File[] => d.list().filter((f): f is File => f instanceof File);
const photoNames = (d: Directory) => filesIn(d).map((f) => f.name).filter((n) => PHOTO_NAME.test(n)).sort();
const message = (e: unknown) => String((e as Error)?.message ?? e).slice(0, 120);
const safe = (f: () => void) => {
  try {
    f();
  } catch {}
};

function writeText(f: File, text: string) {
  if (f.exists) f.delete();
  f.create();
  f.writeSync(text);
}

/** One safety operation at a time: two overlapping ones (say a first sync and a restore) must not delete each other's temporary files. */
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(f: () => Promise<T>): Promise<T> {
  const run = chain.then(f, f);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

// --- snapshots ---------------------------------------------------------------------------------------------------

/** Deletes snapshots outside the retention plan, and leftover temporary files. Never throws. */
function prune(now: number) {
  safe(() => {
    const dir = snapshotDir();
    for (const f of filesIn(dir)) if (isTmpName(f.name)) safe(() => f.delete());
    const { remove } = retentionPlan(listIn(dir), now);
    for (const r of remove) safe(() => new File(dir, r.name).delete());
  });
}
const listIn = (dir: Directory): SnapshotInfo[] =>
  filesIn(dir)
    .map((f) => parseSnapshotName(f.name))
    .filter((x): x is SnapshotInfo => !!x);

/** Snapshots on the phone, newest first. */
export const listSnapshots = (): SnapshotInfo[] => listIn(snapshotDir()).sort((a, b) => b.at - a.at);

/** The text of a snapshot (a backup file: give it to parseBackup). */
export async function readSnapshot(name: string): Promise<string> {
  if (!parseSnapshotName(name)) throw new SafetyError('io', 'not a snapshot name');
  return new File(snapshotDir(), name).text();
}

/**
 * Saves `dump` as a snapshot. Same reason + same data as an existing snapshot: that one is reused, no new file. Throws
 * SafetyError (`space`, `io` or `verify`) when no verified copy exists afterwards; the caller must not go ahead.
 */
export function createSnapshot(reason: SnapshotReason, dump: Dump, now = Date.now()): Promise<SnapshotResult> {
  return serial(async () => {
    let dir: Directory;
    try {
      dir = snapshotDir();
    } catch (e) {
      throw new SafetyError('io', `cannot open the safety folder: ${message(e)}`);
    }
    for (const f of filesIn(dir)) if (isTmpName(f.name)) safe(() => f.delete());
    const hash = dumpHash(dump);
    const same = findReusable(listIn(dir), reason, hash);
    if (same && new File(dir, same.name).exists) {
      // Reused: stamp it now, so it is not pruned by its old age a day later (the name carries the time).
      const fresh = snapshotName(reason, now, hash);
      let kept = same.name;
      if (same.at < now && !new File(dir, fresh).exists) {
        try {
          new File(dir, same.name).rename(fresh);
          kept = fresh;
        } catch {}
      }
      prune(now);
      return { name: kept, reused: true };
    }

    const text = toBackup(dump, new Date(now));
    if (!enoughSpace(Paths.availableDiskSpace, spaceNeeded(utf8Length(text)))) throw new SafetyError('space', 'not enough free space for a safety copy');

    const name = snapshotName(reason, now, hash);
    await writeVerified(dir, name, text); // tmp → read back and compare → rename (verifiedWrite.ts); throws SafetyError
    prune(now);
    return { name, reused: false };
  });
}

/** Applies the retention plan now (also done after every new snapshot). */
export const pruneSnapshots = (now = Date.now()): Promise<void> => serial(async () => prune(now));

// --- progress photos ---------------------------------------------------------------------------------------------

/** Moves a file to another place. Falls back to copy, check the size, delete when the platform has no `move`. */
async function relocate(from: File, to: File) {
  const move = (from as unknown as { move?: (dest: File) => Promise<void> | void }).move;
  if (typeof move === 'function') {
    await move.call(from, to);
    return;
  }
  const size = from.size;
  await from.copy(to);
  if (!to.exists || to.size !== size) {
    safe(() => to.delete());
    throw new Error('the copy does not match the original');
  }
  from.delete();
}

async function readManifest(folder: Directory): Promise<RecoveryManifest | null> {
  const f = new File(folder, RECOVERY_MANIFEST);
  try {
    return f.exists ? parseManifest(await f.text()) : null;
  } catch {
    return null;
  }
}
const writeManifest = (folder: Directory, state: RecoveryState, names: readonly string[], wipedAt?: number) => writeText(new File(folder, RECOVERY_MANIFEST), toManifest(state, names, wipedAt));

const folderOf = (id: string) => {
  if (!isRecoveryId(id)) throw new SafetyError('io', 'not a recovery folder name');
  return new Directory(recoveryRoot(), id);
};

/** Puts every photo in a recovery folder back (a name already in the photos folder stays where it is); removes the folder once it holds no photo. Returns how many went back. */
async function putBack(folder: Directory): Promise<number> {
  const photos = photoDir();
  let n = 0;
  for (const name of photoNames(folder)) {
    const target = new File(photos, name);
    if (target.exists) continue;
    await relocate(new File(folder, name), target);
    n++;
  }
  if (!photoNames(folder).length) safe(() => folder.delete());
  return n;
}

export type RecoveryInfo = { id: string; createdAt: number; state: RecoveryState; count: number };

/**
 * Moves every progress photo into a new recovery folder (before a wipe). Nothing is deleted. On any failure the photos
 * already moved are put back and a SafetyError('photos') is thrown; if even that fails, the manifest stays `moving`
 * and repairRecoveries() finishes the job at the next start. No photos: `{ id: '', count: 0 }` and no folder.
 */
export function movePhotosToRecovery(now = Date.now()): Promise<{ id: string; count: number }> {
  return serial(async () => {
    let names: string[];
    let folder: Directory;
    const id = recoveryId(now);
    try {
      names = photoNames(photoDir());
      if (!names.length) return { id: '', count: 0 };
      folder = new Directory(recoveryRoot(), id);
      ensure(folder);
      writeManifest(folder, 'moving', names);
    } catch (e) {
      throw new SafetyError('photos', `cannot prepare the photo recovery folder: ${message(e)}`);
    }
    try {
      for (const n of names) await relocate(new File(photoDir(), n), new File(folder, n));
      writeManifest(folder, 'ready', names);
    } catch (e) {
      try {
        await putBack(folder);
      } catch {}
      throw new SafetyError('photos', `moving the photos failed: ${message(e)}`);
    }
    return { id, count: names.length };
  });
}

/** The wipe finished: the folder is now a recovery copy, kept for RECOVERY_DAYS days. */
export const finishRecovery = (id: string, now = Date.now()): Promise<void> =>
  serial(async () => {
    const folder = folderOf(id);
    if (folder.exists) writeManifest(folder, 'wiped', photoNames(folder), now);
  });

/** The wipe was cancelled: the photos go back where they were. Returns how many. */
export const abortRecovery = (id: string): Promise<number> =>
  serial(async () => {
    const folder = folderOf(id);
    return folder.exists ? putBack(folder) : 0;
  });

/** Gives the photos of a recovery folder back (the user asked for them). Returns how many were put back. */
export const restoreRecoveryPhotos = abortRecovery;

/** Recovery folders on the phone, newest first. */
export async function listRecoveries(): Promise<RecoveryInfo[]> {
  const out: RecoveryInfo[] = [];
  for (const d of recoveryRoot().list()) {
    if (!(d instanceof Directory) || !isRecoveryId(d.name)) continue;
    const m = await readManifest(d);
    out.push({ id: d.name, createdAt: recoveryCreatedAt(d.name) ?? 0, state: m?.state ?? 'moving', count: photoNames(d).length });
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

/** Deletes a recovery folder for good (the user asked). */
export const deleteRecovery = (id: string): Promise<void> =>
  serial(async () => {
    const folder = folderOf(id);
    if (folder.exists) folder.delete();
  });

/**
 * Run when the app starts. For each recovery folder, by its manifest and whether data is on the phone
 * (safety.ts `recoveryAction`): put the photos back after an interrupted wipe, note a wipe whose last note was lost, or
 * delete a finished one after RECOVERY_DAYS days. One broken folder never stops the others and nothing here throws.
 */
export function repairRecoveries(hasLocalData: boolean, now = Date.now()): Promise<{ restored: number; finished: number; purged: number; failed: number }> {
  return serial(async () => {
    const out = { restored: 0, finished: 0, purged: 0, failed: 0 };
    let entries: (File | Directory)[] = [];
    try {
      entries = recoveryRoot().list();
    } catch {
      return out;
    }
    for (const d of entries) {
      if (!(d instanceof Directory) || !isRecoveryId(d.name)) continue;
      try {
        const createdAt = recoveryCreatedAt(d.name) ?? now;
        const m = await readManifest(d);
        const action = recoveryAction(m, createdAt, hasLocalData, now);
        if (action === 'rollback') {
          await putBack(d);
          out.restored++;
        } else if (action === 'mark-wiped') {
          writeManifest(d, 'wiped', photoNames(d), m?.wipedAt ?? now);
          out.finished++;
        } else if (action === 'purge') {
          d.delete();
          out.purged++;
        }
      } catch {
        out.failed++;
      }
    }
    return out;
  });
}
