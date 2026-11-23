// Putting a backup back on the phone: its data replaces what's here, its photos are added, settings and plan are re-read.
// This phone's own settings (`device`: backup folder, screen, buzz) stay as they are.
import type { Dump } from './storage.types';
import type { PhotoData } from './backup';
import { importPhotos, photosSupported } from './photos';
import { hasAnythingToProtect, SafetyError } from './safety';
import { createSnapshot } from './safetyIO';
import { useSettings } from './settings';
import { storage } from './storage';

/** Kept as it is on this phone: `device` (this phone's own settings: backup folder…) and `auth` (the cloud sign-in). */
const KEEP = ['device', 'auth'];

/**
 * Returns how many photos were added. A safety copy of what's on the phone is saved first; if it cannot be made this
 * throws a SafetyError and nothing is touched.
 */
export async function applyBackup(data: Dump, photos: readonly PhotoData[]): Promise<number> {
  const before = storage.dump();
  if (hasAnythingToProtect(before)) await createSnapshot('pre-restore', before);
  const keep = Object.fromEntries(KEEP.map((k) => [k, storage.getMeta(k) ?? '']));
  // Put in with the backup's data, in the same transaction.
  storage.restore({ ...data, meta: { ...data.meta, ...keep } });
  const added = photosSupported ? importPhotos(photos) : 0;
  useSettings.getState().reload();
  return added;
}

/** What to tell the user when a safety copy could not be made (null: not that kind of error). */
export function safetyText(e: unknown): string | null {
  if (!(e instanceof SafetyError)) return null;
  const why = e.code === 'space' ? 'مفيش مساحة فاضية كفاية على الموبايل' : e.code === 'photos' ? 'معرفتش أحفظ الصور على جنب' : 'معرفتش أعمل نسخة أمان من بياناتك';
  return `${why}، فما عملتش حاجة وبياناتك زي ما هي.`;
}
