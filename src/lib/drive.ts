// Backup to your Google Drive (settings → Google Drive): sign in once, then one file ("Gym backup.json") is updated in
// place a little after each change (at most every few minutes), when the app goes to the background, a few seconds
// after it opens, or when you tap "ارفع دلوقتي". An empty phone (e.g. right after reinstalling) never overwrites a
// backup that has your data, and restoring reads every copy in Drive and takes the one with the most in it.
// Setup on Google Cloud (Android OAuth client for the app's package + signing SHA-1): docs/google-drive-setup.md.
// Web: drive.web.ts.
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { hasData, LAST_BACKUP_KEY, parseBackup, toBackup } from './backup';
import { DRIVE_SCOPE, DriveError, downloadBackup, fingerprint, listBackups, pickBest, uploadBackup } from './driveApi';
import { dateKey } from './logic';
import { exportPhotos } from './photos';
import { storage } from './storage';
import { useDataVersion } from './bus';

export const driveSupported = true;
/** Meta keys: signed-in email, the file's id, last upload date, fingerprint of what was uploaded, last error. */
export const DRIVE_USER = 'driveUser';
/** Your Google name and photo (side menu). */
export const DRIVE_NAME = 'driveName';
export const DRIVE_PHOTO = 'drivePhoto';
const DRIVE_ID = 'driveFileId';
export const DRIVE_AT = 'driveAt';
const DRIVE_SIG = 'driveSig';
/** Time (ms) of the last upload, to space them out. */
const DRIVE_AT_MS = 'driveAtMs';
/** Uploads after a change wait at least this long after the last one. */
const MIN_GAP_MS = 3 * 60 * 1000;
export const DRIVE_ERROR = 'driveError';

let configured = false;
function setup() {
  if (configured) return;
  GoogleSignin.configure({ scopes: [DRIVE_SCOPE] });
  configured = true;
}

/** Access token for Drive, signing in silently with the saved account. Null when not linked. */
async function token(): Promise<string | null> {
  setup();
  if (!storage.getMeta(DRIVE_USER)) return null;
  const r = await GoogleSignin.signInSilently();
  if (r.type !== 'success') return null;
  return (await GoogleSignin.getTokens()).accessToken;
}

/** Signs in with Google (asks for Drive access) and uploads right away. Returns the email, or null if cancelled. */
export async function linkDrive(): Promise<string | null> {
  setup();
  try {
    await GoogleSignin.hasPlayServices();
    const r = await GoogleSignin.signIn();
    if (r.type !== 'success') return null;
    storage.setMeta(DRIVE_USER, r.data.user.email);
    storage.setMeta(DRIVE_NAME, r.data.user.givenName ?? r.data.user.name ?? '');
    storage.setMeta(DRIVE_PHOTO, r.data.user.photo ?? '');
    // A backup already in Drive (from your old phone, or before reinstalling) keeps being the one we update.
    const t = (await GoogleSignin.getTokens()).accessToken;
    const best = await bestRemote(t);
    storage.setMeta(DRIVE_ID, best?.id ?? '');
    return r.data.user.email;
  } catch (e) {
    if ((e as { code?: string }).code === statusCodes.SIGN_IN_CANCELLED) return null;
    throw e;
  }
}

export async function unlinkDrive() {
  setup();
  try {
    await GoogleSignin.signOut();
  } catch {}
  for (const k of [DRIVE_USER, DRIVE_NAME, DRIVE_PHOTO, DRIVE_ID, DRIVE_AT, DRIVE_AT_MS, DRIVE_SIG, DRIVE_ERROR]) storage.setMeta(k, '');
  useDataVersion.getState().bump();
}

type Remote = { id: string; text: string; score: number };

/** The copy in Drive with the most in it (every copy is read: an empty one from a fresh install must never win). */
async function bestRemote(t: string): Promise<Remote | null> {
  const files = await listBackups(t, fetch);
  const read = await Promise.all(
    files.map(async (x) => {
      const text = await downloadBackup(t, x.id, fetch).catch(() => '');
      const p = text ? parseBackup(text) : null;
      return { ...x, text, score: p?.ok ? p.info.total : 0 };
    }),
  );
  const b = pickBest(read);
  return b ? { id: b.id, text: b.text, score: b.score } : null;
}

/**
 * Uploads the backup (with photos) to the one Drive file when something changed since the last upload, at most every
 * few minutes (`soon` skips the wait: going to the background). `force` uploads even when nothing changed.
 * 'kept': the phone has nothing logged and Drive has your data, so nothing was written.
 */
export async function syncDrive(force = false, soon = false): Promise<'uploaded' | 'skipped' | 'unlinked' | 'kept'> {
  if (!storage.getMeta(DRIVE_USER)) return 'unlinked';
  const today = dateKey();
  const now = Date.now();
  if (!force && !soon && now - Number(storage.getMeta(DRIVE_AT_MS) || 0) < MIN_GAP_MS) return 'skipped';
  const photos = await exportPhotos();
  const data = storage.dump();
  // The fingerprint leaves out our own bookkeeping, which changes on every upload.
  for (const k of [DRIVE_AT, DRIVE_AT_MS, DRIVE_SIG, DRIVE_ERROR, LAST_BACKUP_KEY, 'autoBackupAt', 'autoBackupError', 'welcomeDone', 'verse.last', 'section']) delete data.meta[k];
  const sig = fingerprint(JSON.stringify(data) + photos.map((p) => p.name).join());
  if (!force && sig === storage.getMeta(DRIVE_SIG)) return 'skipped';
  try {
    const t = await token();
    if (!t) throw new DriveError(401, 'not signed in');
    // Never write an empty phone over a backup that has your data (right after reinstalling, say).
    if (!hasData(data, photos.length)) {
      const best = await bestRemote(t);
      if (best && best.score > 0) {
        storage.setMeta(DRIVE_ID, best.id);
        return 'kept';
      }
    }
    const id = await uploadBackup(t, toBackup(storage.dump(), new Date(), photos), storage.getMeta(DRIVE_ID) || null, fetch);
    storage.setMeta(DRIVE_ID, id);
    storage.setMeta(DRIVE_AT, today);
    storage.setMeta(DRIVE_AT_MS, String(now));
    storage.setMeta(DRIVE_SIG, sig);
    storage.setMeta(LAST_BACKUP_KEY, today);
    storage.setMeta(DRIVE_ERROR, '');
    useDataVersion.getState().bump();
    return 'uploaded';
  } catch (e) {
    storage.setMeta(DRIVE_ERROR, today);
    useDataVersion.getState().bump();
    throw e;
  }
}

/** The backup text from Drive (the copy with the most in it, which then becomes the one we update), or null. */
export async function fetchDrive(): Promise<string | null> {
  const t = await token();
  if (!t) throw new DriveError(401, 'not signed in');
  const best = await bestRemote(t);
  if (!best) return null;
  storage.setMeta(DRIVE_ID, best.id);
  return best.text;
}
