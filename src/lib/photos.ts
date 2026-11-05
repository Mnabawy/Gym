// Progress photos (/weight): taken or picked on the phone and copied into the app's own folder, one file per photo named
// by its date. They stay on the phone only (not in the backup file, which would get too big). Web: photos.web.ts.
import * as ImagePicker from 'expo-image-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { dateKey } from './logic';

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
  const src = new File(res.assets[0].uri);
  await src.copy(new File(dir(), `${dateKey()}_${Date.now()}.jpg`));
  return true;
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
