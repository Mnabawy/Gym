// Backup to your Google Drive (settings → Google Drive): sign in once, then one file ("Gym backup.json") is updated in
// place, at most once a day when something changed (a few seconds after the app opens), or when you tap "ارفع دلوقتي".
// Setup on Google Cloud (Android OAuth client for the app's package + signing SHA-1): docs/google-drive-setup.md.
// Web: drive.web.ts.
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { LAST_BACKUP_KEY, toBackup } from './backup';
import { DRIVE_SCOPE, DriveError, downloadBackup, findBackup, fingerprint, uploadBackup } from './driveApi';
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
    // A backup already in Drive (e.g. from your old phone) keeps being the one we update.
    const t = (await GoogleSignin.getTokens()).accessToken;
    const found = await findBackup(t, fetch);
    storage.setMeta(DRIVE_ID, found?.id ?? '');
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
  for (const k of [DRIVE_USER, DRIVE_NAME, DRIVE_PHOTO, DRIVE_ID, DRIVE_AT, DRIVE_SIG, DRIVE_ERROR]) storage.setMeta(k, '');
  useDataVersion.getState().bump();
}

/**
 * Uploads the backup (with photos) to the one Drive file. Without `force`, only once a day and only when something
 * changed since the last upload.
 */
export async function syncDrive(force = false): Promise<'uploaded' | 'skipped' | 'unlinked'> {
  if (!storage.getMeta(DRIVE_USER)) return 'unlinked';
  const today = dateKey();
  if (!force && storage.getMeta(DRIVE_AT) === today) return 'skipped';
  const photos = await exportPhotos();
  const data = storage.dump();
  // The fingerprint leaves out our own bookkeeping, which changes on every upload.
  for (const k of [DRIVE_AT, DRIVE_SIG, DRIVE_ERROR, LAST_BACKUP_KEY, 'autoBackupAt', 'autoBackupError', 'welcomeDone']) delete data.meta[k];
  const sig = fingerprint(JSON.stringify(data) + photos.map((p) => p.name).join());
  if (!force && sig === storage.getMeta(DRIVE_SIG)) return 'skipped';
  try {
    const t = await token();
    if (!t) throw new DriveError(401, 'not signed in');
    const id = await uploadBackup(t, toBackup(storage.dump(), new Date(), photos), storage.getMeta(DRIVE_ID) || null, fetch);
    storage.setMeta(DRIVE_ID, id);
    storage.setMeta(DRIVE_AT, today);
    storage.setMeta(DRIVE_SIG, sig);
    storage.setMeta(LAST_BACKUP_KEY, today);
    storage.setMeta(DRIVE_ERROR, '');
    return 'uploaded';
  } catch (e) {
    storage.setMeta(DRIVE_ERROR, today);
    throw e;
  } finally {
    useDataVersion.getState().bump();
  }
}

/** The backup text from Drive, or null when there's none. */
export async function fetchDrive(): Promise<string | null> {
  const t = await token();
  if (!t) throw new DriveError(401, 'not signed in');
  const id = storage.getMeta(DRIVE_ID) || (await findBackup(t, fetch))?.id;
  return id ? downloadBackup(t, id, fetch) : null;
}
