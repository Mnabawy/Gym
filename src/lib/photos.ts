// Progress photos (/weight): taken or picked on the phone, shrunk (longest side MAX_SIDE px, JPEG) and saved in the app's
// own folder, one file per photo named by its date. They go into the backup file ("احفظ نسخة" and the automatic copy in
// your folder) as base64, and come back on restore. Web: photos.web.ts.
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Directory, File, Paths } from 'expo-file-system';
import { PHOTO_NAME, type PhotoData } from './backup';
import { dateKey } from './logic';

/** ≈ 150–300 KB per photo: enough to see the change, small enough for the backup file. */
const MAX_SIDE = 1280;

export const photosSupported = true;
export type Photo = { date: string; uri: string; name: string };

const dir = () => {
  const d = new Directory(Paths.document, 'photos');
  if (!d.exists) d.create({ intermediates: true });
  return d;
};

/** Takes (camera) or picks (gallery) a photo and saves a copy for today. False if cancelled or not allowed. */
export async function addPhoto(from: 'camera' | 'library'): Promise<boolean> {
  const perm = from === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return false;
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7, allowsEditing: false };
  const res = from === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (res.canceled || !res.assets?.length) return false;
  const a = res.assets[0];
  const ctx = ImageManipulator.manipulate(a.uri);
  if (Math.max(a.width, a.height) > MAX_SIDE) ctx.resize(a.height >= a.width ? { height: MAX_SIDE } : { width: MAX_SIDE });
  const out = await (await ctx.renderAsync()).saveAsync({ compress: 0.7, format: SaveFormat.JPEG });
  await new File(out.uri).copy(new File(dir(), `${dateKey()}_${Date.now()}.jpg`));
  return true;
}

/** Every photo as base64, for the backup file. */
export async function exportPhotos(): Promise<PhotoData[]> {
  const out: PhotoData[] = [];
  for (const p of listPhotos()) out.push({ name: p.name, data: await new File(dir(), p.name).base64() });
  return out;
}

/** Puts a backup's photos back; photos already on the phone stay. Returns how many were added. */
export function importPhotos(list: readonly PhotoData[]): number {
  let n = 0;
  for (const p of list) {
    if (!PHOTO_NAME.test(p.name)) continue;
    const f = new File(dir(), p.name);
    if (f.exists) continue;
    f.create();
    f.writeSync(p.data, { encoding: 'base64' });
    n++;
  }
  return n;
}

/** Saved photos, oldest first. */
export function listPhotos(): Photo[] {
  return dir()
    .list()
    .filter((f): f is File => f instanceof File && /^\d{4}-\d{2}-\d{2}_\d+\.jpg$/.test(f.name))
    .map((f) => ({ date: f.name.slice(0, 10), uri: f.uri, name: f.name }))
    .sort((a, b) => (a.name < b.name ? -1 : 1));
}

export function deletePhoto(p: Photo) {
  const f = new File(dir(), p.name);
  if (f.exists) f.delete();
}
