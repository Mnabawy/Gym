// Putting a backup back on the phone: its data replaces what's here, its photos are added, settings and plan are re-read.
// The Google account link belongs to the phone, not to the backup, so it stays as it is.
import type { Dump } from './storage.types';
import type { PhotoData } from './backup';
import { deleteAllPhotos, importPhotos, photosSupported } from './photos';
import { useSettings } from './settings';
import { storage } from './storage';

/** Meta key: the welcome screen was answered (signed in or skipped), so it doesn't show again. */
export const WELCOME_KEY = 'welcomeDone';

const KEEP = ['driveUser', 'driveName', 'drivePhoto', 'driveFileId', 'driveAt', 'driveSig', 'driveError', 'welcomeDone'];

/** Returns how many photos were added. */
export function applyBackup(data: Dump, photos: readonly PhotoData[]): number {
  const keep = KEEP.map((k) => [k, storage.getMeta(k) ?? ''] as const);
  storage.restore(data);
  for (const [k, v] of keep) storage.setMeta(k, v);
  const added = photosSupported ? importPhotos(photos) : 0;
  useSettings.getState().reload();
  return added;
}

/** Signing out with "wipe this phone": everything saved here goes (data, settings, photos). The account keys go too. */
export function wipeLocal() {
  storage.restore({ sets: [], meals: [], shop: [], meta: {} });
  if (photosSupported) deleteAllPhotos();
  useSettings.getState().reload();
}
