// Google Drive REST calls for the backup (one file, updated in place). Pure: takes the access token and fetch, so it's
// unit tested in __tests__/driveApi.test.ts. Signing in and when to upload: src/lib/drive.ts.
// Scope drive.file: the app only sees files it made itself. Drive keeps the file's older versions for a while
// (File → Manage versions on drive.google.com), so an upload never loses the one before it right away.

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const DRIVE_FILE_NAME = 'Gym backup.json';
const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

type Fetch = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>;
export type DriveFile = { id: string; modifiedTime: string | null; size: number | null };

export class DriveError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
async function check<T extends { ok: boolean; status: number; text(): Promise<string> }>(res: T): Promise<T> {
  if (!res.ok) throw new DriveError(res.status, (await res.text().catch(() => '')).slice(0, 200));
  return res;
}

/** Our backup file in Drive (the newest, if there are several), or null. */
export async function findBackup(token: string, f: Fetch): Promise<DriveFile | null> {
  const q = encodeURIComponent(`name = '${DRIVE_FILE_NAME}' and trashed = false`);
  const res = await check(await f(`${API}?q=${q}&spaces=drive&orderBy=modifiedTime desc&pageSize=1&fields=files(id,modifiedTime,size)`, { headers: auth(token) }));
  const body = (await res.json()) as { files?: { id: string; modifiedTime?: string; size?: string }[] };
  const x = body.files?.[0];
  return x ? { id: x.id, modifiedTime: x.modifiedTime ?? null, size: x.size != null ? Number(x.size) : null } : null;
}

/** Multipart body for creating a file with its name and content in one request. */
export function multipart(boundary: string, meta: object, content: string): string {
  return [`--${boundary}`, 'Content-Type: application/json; charset=UTF-8', '', JSON.stringify(meta), `--${boundary}`, 'Content-Type: application/json', '', content, `--${boundary}--`, ''].join('\r\n');
}

/** Writes the backup: updates the file `id` in place, or creates it when there's none. Returns the file's id. */
export async function uploadBackup(token: string, text: string, id: string | null, f: Fetch): Promise<string> {
  if (id) {
    const res = await f(`${UPLOAD}/${id}?uploadType=media&fields=id`, { method: 'PATCH', headers: { ...auth(token), 'Content-Type': 'application/json' }, body: text });
    if (res.ok) return ((await res.json()) as { id: string }).id;
    if (res.status !== 404) await check(res); // gone (deleted in Drive): make a new one below
  }
  const boundary = `gym${Date.now().toString(36)}`;
  const res = await check(
    await f(`${UPLOAD}?uploadType=multipart&fields=id`, {
      method: 'POST',
      headers: { ...auth(token), 'Content-Type': `multipart/related; boundary=${boundary}` },
      body: multipart(boundary, { name: DRIVE_FILE_NAME, mimeType: 'application/json' }, text),
    }),
  );
  return ((await res.json()) as { id: string }).id;
}

export async function downloadBackup(token: string, id: string, f: Fetch): Promise<string> {
  return (await check(await f(`${API}/${id}?alt=media`, { headers: auth(token) }))).text();
}

/** Small fingerprint of the backup text, to skip uploading when nothing changed. */
export function fingerprint(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${s.length}:${(h >>> 0).toString(36)}`;
}
