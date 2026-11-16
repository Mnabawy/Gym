// Putting a backup back on the phone: its data replaces what's here, its photos are added, settings and plan are re-read.
// The Google account link belongs to the phone, not to the backup, so it stays as it is.
import type { Dump } from './storage.types';
import type { PhotoData } from './backup';
import { deleteAllPhotos, importPhotos, photosSupported } from './photos';
import { hasAnythingToProtect, SafetyError } from './safety';
import { abortRecovery, createSnapshot, finishRecovery, movePhotosToRecovery } from './safetyIO';
import { dropSignedOutLog } from './cloud';
import { report } from './errlog';
import { useSettings } from './settings';
import { storage } from './storage';
import { untracked } from './track';

/** Meta key: the welcome screen was answered (signed in or skipped), so it doesn't show again. */
export const WELCOME_KEY = 'welcomeDone';

/** Kept as they are on this phone: the Google account, and `device` (this phone's own settings: backup folder, app lock…). */
const KEEP = ['driveUser', 'driveName', 'drivePhoto', 'welcomeDone', 'device'];

/**
 * Returns how many photos were added. A safety copy of what's on the phone is saved first; if it cannot be made this
 * throws a SafetyError and nothing is touched.
 */
export async function applyBackup(data: Dump, photos: readonly PhotoData[]): Promise<number> {
  const before = storage.dump();
  if (hasAnythingToProtect(before)) await createSnapshot('pre-restore', before);
  const keep = KEEP.map((k) => [k, storage.getMeta(k) ?? ''] as const);
  storage.restore(data);
  for (const [k, v] of keep) storage.setMeta(k, v);
  // Signed out: the change log kept for that account described the data that was just replaced.
  dropSignedOutLog();
  const added = photosSupported ? importPhotos(photos) : 0;
  useSettings.getState().reload();
  return added;
}

/**
 * Signing out with "wipe this phone": everything saved here goes (data, settings, photos). The account keys go too.
 * First a safety copy of the data (kept 30 days) and the photos moved to a recovery folder (kept 30 days); a SafetyError
 * means nothing was wiped.
 */
export async function wipeLocal(): Promise<void> {
  const before = storage.dump();
  if (hasAnythingToProtect(before)) await createSnapshot('pre-wipe', before);
  const moved = await movePhotosToRecovery();
  try {
    // Not noted for sync: the server keeps everything.
    untracked(() => storage.restore({ sets: [], meals: [], shop: [], meta: {} }));
    if (photosSupported) deleteAllPhotos();
    useSettings.getState().reload();
  } catch (e) {
    report(e, 'wipe');
    if (moved.id) await abortRecovery(moved.id).catch((x) => report(x, 'wipe:abortRecovery'));
    throw e;
  }
  // The wipe is done; a failure here must not stop the caller from unlinking (repairRecoveries fixes the folder on next start).
  if (moved.id) await finishRecovery(moved.id).catch((e) => report(e, 'wipe:finishRecovery'));
}

/** What to tell the user when a safety copy could not be made (null: not that kind of error). */
export function safetyText(e: unknown): string | null {
  if (!(e instanceof SafetyError)) return null;
  const why = e.code === 'space' ? 'مفيش مساحة فاضية كفاية على الموبايل' : e.code === 'photos' ? 'معرفتش أحفظ الصور على جنب' : 'معرفتش أعمل نسخة أمان من بياناتك';
  return `${why}، فما عملتش حاجة وبياناتك زي ما هي.`;
}
