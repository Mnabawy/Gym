// Web preview: download the backup as a file, open one with the browser's file picker.
import * as Clipboard from 'expo-clipboard';
import { backupFileName, toBackup } from './backup';
import { dateKey } from './logic';
import { storage } from './storage';

export async function saveBackup(): Promise<'shared' | 'copied'> {
  const blob = new Blob([toBackup(storage.dump())], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = backupFileName(dateKey());
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'shared';
}

export async function copyBackup(): Promise<void> {
  await Clipboard.setStringAsync(toBackup(storage.dump()));
}

export function pickBackup(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json,text/plain';
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      f.text().then(resolve, () => resolve(null));
    };
    input.click();
  });
}

export const pasteBackup = (): Promise<string> => Clipboard.getStringAsync();

export async function shareText(name: string, text: string, mimeType: string): Promise<'shared' | 'copied'> {
  const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'shared';
}
