/// <reference types="jest" />
import { DRIVE_FILE_NAME, downloadBackup, DriveError, findBackup, fingerprint, listBackups, multipart, pickBest, uploadBackup } from '../src/lib/driveApi';

type Call = { url: string; method?: string; headers?: Record<string, string>; body?: string };
const fake = (replies: { status: number; body?: unknown }[]) => {
  const calls: Call[] = [];
  const f = async (url: string, init: Omit<Call, 'url'> = {}) => {
    calls.push({ url, ...init });
    const r = replies.shift()!;
    return { ok: r.status < 300, status: r.status, json: async () => r.body, text: async () => (typeof r.body === 'string' ? r.body : JSON.stringify(r.body ?? '')) };
  };
  return { f, calls };
};

test('find: newest file with our name, with the token', async () => {
  const { f, calls } = fake([{ status: 200, body: { files: [{ id: 'abc', modifiedTime: '2026-11-05T10:00:00Z', size: '1234' }] } }]);
  expect(await findBackup('tok', f)).toEqual({ id: 'abc', modifiedTime: '2026-11-05T10:00:00Z', size: 1234 });
  expect(calls[0].headers?.Authorization).toBe('Bearer tok');
  expect(decodeURIComponent(calls[0].url)).toContain(`name = '${DRIVE_FILE_NAME}'`);
  const none = fake([{ status: 200, body: { files: [] } }]);
  expect(await findBackup('tok', none.f)).toBeNull();
});

test('upload updates the same file in place', async () => {
  const { f, calls } = fake([{ status: 200, body: { id: 'abc' } }]);
  expect(await uploadBackup('tok', '{"x":1}', 'abc', f)).toBe('abc');
  expect(calls).toHaveLength(1);
  expect(calls[0].method).toBe('PATCH');
  expect(calls[0].url).toContain('/upload/drive/v3/files/abc?uploadType=media');
  expect(calls[0].body).toBe('{"x":1}');
});

test('upload creates the file when there is none, or when it was deleted', async () => {
  const first = fake([{ status: 200, body: { id: 'new' } }]);
  expect(await uploadBackup('tok', '{}', null, first.f)).toBe('new');
  expect(first.calls[0].method).toBe('POST');
  expect(first.calls[0].headers?.['Content-Type']).toMatch(/^multipart\/related; boundary=/);
  expect(first.calls[0].body).toContain(DRIVE_FILE_NAME);

  const gone = fake([{ status: 404 }, { status: 200, body: { id: 'new2' } }]);
  expect(await uploadBackup('tok', '{}', 'old', gone.f)).toBe('new2');
  expect(gone.calls.map((c) => c.method)).toEqual(['PATCH', 'POST']);
});

test('errors carry the status', async () => {
  const { f } = fake([{ status: 401, body: 'expired' }]);
  await expect(uploadBackup('tok', '{}', 'abc', f)).rejects.toBeInstanceOf(DriveError);
  const d = fake([{ status: 200, body: '{"app":"gym-backup"}' }]);
  expect(await downloadBackup('tok', 'abc', d.f)).toBe('{"app":"gym-backup"}');
  expect(d.calls[0].url).toContain('abc?alt=media');
});

test('multipart and fingerprint', () => {
  const body = multipart('B', { name: 'n' }, 'DATA');
  expect(body.startsWith('--B\r\n')).toBe(true);
  expect(body.endsWith('--B--\r\n')).toBe(true);
  expect(body).toContain('{"name":"n"}');
  expect(fingerprint('abc')).toBe(fingerprint('abc'));
  expect(fingerprint('abc')).not.toBe(fingerprint('abd'));
});

test('list every backup, and pick the one with the most in it', async () => {
  const { f, calls } = fake([{ status: 200, body: { files: [{ id: 'new', modifiedTime: '2026-11-07T17:24:00Z', size: '444' }, { id: 'old', modifiedTime: '2026-11-07T08:30:00Z', size: '1729' }] } }]);
  const list = await listBackups('tok', f);
  expect(list.map((x) => x.id)).toEqual(['new', 'old']);
  expect(calls[0].url).toContain('pageSize=20');
  // A fresh install's empty file is newer but must not win.
  expect(pickBest([{ ...list[0], score: 0 }, { ...list[1], score: 6 }])?.id).toBe('old');
  expect(pickBest([{ id: 'a', modifiedTime: '2026-11-01', score: 3 }, { id: 'b', modifiedTime: '2026-11-02', score: 3 }])?.id).toBe('b');
  expect(pickBest([])).toBeNull();
});
