// Automatic weekly backup (settings → نسخة تلقائية): a backup file inside the app (last AUTO_KEEP kept) and, when you
// picked one, in a folder of yours (Android: e.g. Download or a Drive folder), which stays if the app is deleted.
// Runs a few seconds after the app opens, once AUTO_DAYS have passed. Web: autoBackup.web.ts.
import { Directory, File, Paths } from 'expo-file-system';
import { LAST_BACKUP_KEY, toBackup } from './backup';
import { daysBetween } from './gaps';
import { dateKey } from './logic';
import { useSettings } from './settings';
import { exportPhotos } from './photos';
import { storage } from './storage';

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

/** Makes the weekly backup if it's due (or `force`). */
export async function runAutoBackup(force = false): Promise<'saved' | 'skipped'> {
  const st = useSettings.getState();
  const today = dateKey();
  const last = storage.getMeta(AUTO_KEY);
  if (!force && (!st.autoBackup || (last && daysBetween(last, today) < AUTO_DAYS))) return 'skipped';
  const data = storage.dump();
  if (!data.sets.length && !data.meals.length) return 'skipped';
  const text = toBackup(data);
  const name = `gym-auto-${today}.json`;
  const f = new File(dir(), name);
  if (f.exists) f.delete();
  f.create();
  f.writeSync(text);
  for (const old of listAutoBackups().slice(AUTO_KEEP)) new File(dir(), old.name).delete();
  storage.setMeta(AUTO_KEY, today);
  if (st.backupDir) {
    try {
      // The copy in your folder has the photos too (the ones inside the app don't need them: they're in the app already).
      const out = new Directory(st.backupDir).createFile(name, 'application/json');
      await out.write(toBackup(data, new Date(), await exportPhotos()));
      storage.setMeta(LAST_BACKUP_KEY, today); // a copy outside the app counts as a backup
      storage.setMeta(AUTO_ERROR_KEY, '');
    } catch {
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
