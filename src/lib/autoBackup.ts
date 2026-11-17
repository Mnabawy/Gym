// Automatic weekly backup (settings → نسخة تلقائية): a backup file inside the app (last AUTO_KEEP kept) and, when you
// picked one, in a folder of yours (Android: e.g. Download or a Drive folder), which stays if the app is deleted.
// Runs a few seconds after the app opens, once AUTO_DAYS have passed. Web: autoBackup.web.ts.
import { Directory, File, Paths } from 'expo-file-system';
import { hasData, LAST_BACKUP_KEY, toBackup } from './backup';
import { bumpAreas, metaArea } from './bus';
import { dateKey, daysBetween } from './dates';
import { useSettings } from './settings';
import { report } from './errlog';
import { exportPhotos } from './photos';
import { storage } from './storage';
import { sameBackup, writeVerified } from './verifiedWrite';

export const autoSupported = true;
export const AUTO_KEY = 'autoBackupAt';
export const AUTO_ERROR_KEY = 'autoBackupError';
export const AUTO_DAYS = 7;
export const AUTO_KEEP = 4;
const NAME = /^gym-auto-(\d{4}-\d{2}-\d{2})\.json$/;

const dir = () => {
  const d = new Directory(Paths.document, 'backups');
  if (!d.exists) d.create({ intermediates: true });
  return d;
};

export type AutoFile = { date: string; name: string };

export function listAutoBackups(): AutoFile[] {
  return dir()
    .list()
    .filter((f): f is File => f instanceof File && NAME.test(f.name))
    .map((f) => ({ date: f.name.match(NAME)![1], name: f.name }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export const readAutoBackup = (name: string) => new File(dir(), name).text();

/**
 * Makes the weekly backup if it's due (or `force`). The copy inside the app is written to a .tmp, read back and checked,
 * then renamed (verifiedWrite.ts); only then are old copies rotated out and the date noted, so a failed write leaves the
 * earlier copies and `autoBackupAt` as they were (and throws). A phone with nothing logged is skipped (`hasData`: sets,
 * meals, and meta-only data like tasks, goals or weights all count; settings alone don't).
 */
export async function runAutoBackup(force = false): Promise<'saved' | 'skipped'> {
  const st = useSettings.getState();
  const today = dateKey();
  const last = storage.getMeta(AUTO_KEY);
  if (!force && (!st.autoBackup || (last && daysBetween(last, today) < AUTO_DAYS))) return 'skipped';
  const data = storage.dump();
  if (!hasData(data)) return 'skipped';
  const name = `gym-auto-${today}.json`;
  const d = dir();
  // Leftovers of a run that was cut off (writeVerified's .tmp / .old) are never a usable copy.
  for (const f of d.list()) {
    if (f instanceof File && /^gym-auto-.+\.json\.(tmp|old)$/.test(f.name) && f.name !== `${name}.old`) {
      try {
        f.delete();
      } catch {}
    }
  }
  try {
    await writeVerified(d, name, toBackup(data));
  } catch (e) {
    // The copy inside the app failed (disk full, torn, rename): settings shows it (the root layout swallows the throw).
    storage.setMeta(AUTO_ERROR_KEY, today);
    throw e;
  }
  for (const old of listAutoBackups().slice(AUTO_KEEP)) {
    try {
      new File(d, old.name).delete();
    } catch {}
  }
  storage.setMeta(AUTO_KEY, today);
  bumpAreas(metaArea(AUTO_KEY)); // the list of copies changed even when the date didn't (settings re-reads it)
  // AUTO_ERROR_KEY = the day the last run failed: the copy inside the app when it's not AUTO_KEY's day, else the folder's.
  if (!st.backupDir) storage.setMeta(AUTO_ERROR_KEY, '');
  if (st.backupDir) {
    let out: File | null = null;
    try {
      // The copy in your folder has the photos too (the ones inside the app don't need them: they're in the app already).
      // A picked folder (Android: a SAF tree) can't always rename, so this copy is written in place, then read back and
      // checked; a copy that doesn't match is deleted and doesn't count as a backup.
      const text = toBackup(data, new Date(), await exportPhotos());
      out = new Directory(st.backupDir).createFile(name, 'application/json');
      await out.write(text);
      if (!sameBackup(text, await out.text())) throw new Error('the copy in your folder does not match');
      storage.setMeta(LAST_BACKUP_KEY, today); // a copy outside the app counts as a backup
      storage.setMeta(AUTO_ERROR_KEY, '');
    } catch (e) {
      report(e, 'autoBackup:folder');
      try {
        if (out?.exists) out.delete();
      } catch {}
      storage.setMeta(AUTO_ERROR_KEY, today);
    }
  }
  return 'saved';
}

/** Lets you pick the folder for the automatic backups; its URI, or null if cancelled. */
export async function pickBackupDir(): Promise<string | null> {
  try {
    return (await Directory.pickDirectoryAsync()).uri;
  } catch {
    return null;
  }
}
