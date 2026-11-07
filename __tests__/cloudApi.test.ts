/// <reference types="jest" />
import { CloudError, pullRows, pushRows, refreshSession, signInWithGoogle } from '../src/lib/cloudApi';

type Call = { url: string; method?: string; headers?: Record<string, string>; body?: string };
const fake = (replies: { status: number; body?: unknown }[]) => {
  const calls: Call[] = [];
  const f = async (url: string, init: Omit<Call, 'url'> = {}) => {
    calls.push({ url, ...init });
    const r = replies.shift()!;
    return { ok: r.status < 300, status: r.status, json: async () => r.body, text: async () => JSON.stringify(r.body ?? '') };
  };
  return { f, calls };
};
const c = { url: 'https://x.supabase.co/', key: 'anon' };
const session = { access_token: 'acc', refresh_token: 'ref', expires_in: 3600, user: { id: 'u1', email: 'a@b' } };

test('sign in with the Google id token', async () => {
  const { f, calls } = fake([{ status: 200, body: session }]);
  expect(await signInWithGoogle(c, 'idtok', f, 1000)).toEqual({ access: 'acc', refresh: 'ref', exp: 1000 + 3600_000, uid: 'u1', email: 'a@b' });
  expect(calls[0].url).toBe('https://x.supabase.co/auth/v1/token?grant_type=id_token');
  expect(JSON.parse(calls[0].body!)).toEqual({ provider: 'google', id_token: 'idtok' });
  expect(calls[0].headers?.apikey).toBe('anon');
});

test('refresh, and errors carry the status', async () => {
  const { f, calls } = fake([{ status: 200, body: session }, { status: 400, body: { error: 'bad' } }]);
  await refreshSession(c, 'ref', f);
  expect(calls[0].url).toContain('grant_type=refresh_token');
  await expect(refreshSession(c, 'ref', f)).rejects.toMatchObject({ status: 400 });
  expect(new CloudError(1, 'x')).toBeInstanceOf(Error);
});

test('pull asks for rows after the rev, in order, with the user token', async () => {
  const { f, calls } = fake([{ status: 200, body: [{ kind: 'meta', key: 'a', data: '1', deleted: false, updated_at: '5', rev: '12' }] }]);
  const rows = await pullRows(c, 'acc', 11, f);
  expect(rows[0]).toMatchObject({ updated_at: 5, rev: 12 });
  expect(calls[0].url).toContain('/rest/v1/rows?');
  expect(calls[0].url).toContain('rev=gt.11');
  expect(calls[0].url).toContain('order=rev.asc');
  expect(calls[0].headers?.Authorization).toBe('Bearer acc');
});

test('push calls the upsert function with the batch', async () => {
  const { f, calls } = fake([{ status: 204 }]);
  await pushRows(c, 'acc', [{ kind: 'meta', key: 'a', data: '1', deleted: false, updated_at: 5 }], f);
  expect(calls[0].url).toBe('https://x.supabase.co/rest/v1/rpc/push_rows');
  expect(JSON.parse(calls[0].body!).items).toHaveLength(1);
});
