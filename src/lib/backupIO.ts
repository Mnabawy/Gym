// Saving and opening backup files on the phone: write a JSON file and open the share sheet (Drive, WhatsApp, Files…),
// or pick a file back with the document picker. Web version: backupIO.web.ts.
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { backupFileName, toBackup } from './backup';
import { dateKey } from './logic';
import { exportPhotos } from './photos';
import { storage } from './storage';

/** Saves a backup file (with the progress photos) and opens the share sheet; falls back to the clipboard (no photos) when sharing isn't available. */
export async function saveBackup(): Promise<'shared' | 'copied'> {
  if (!(await Sharing.isAvailableAsync())) {
    await Clipboard.setStringAsync(toBackup(storage.dump()));
    return 'copied';
  }
  const text = toBackup(storage.dump(), new Date(), await exportPhotos());
  const file = new File(Paths.cache, backupFileName(dateKey()));
  if (file.exists) file.delete();
  file.create();
  file.writeSync(text);
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'احفظ النسخة الاحتياطية', UTI: 'public.json' });
  return 'shared';
}

export async function copyBackup(): Promise<void> {
  await Clipboard.setStringAsync(toBackup(storage.dump()));
}

/** Text of a backup file you pick, or null if you cancel. */
export async function pickBackup(): Promise<string | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true });
  if (res.canceled || !res.assets?.length) return null;
  return new File(res.assets[0].uri).text();
}

export const pasteBackup = (): Promise<string> => Clipboard.getStringAsync();
