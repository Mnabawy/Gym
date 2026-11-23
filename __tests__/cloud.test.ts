/// <reference types="jest" />
/* eslint-disable import/first -- the storage mock has to exist before cloud.ts loads */
const saved: Record<string, string> = {};
jest.mock('../src/lib/storage', () => ({
  storage: { getMeta: (k: string) => saved[k] ?? null, setMeta: (k: string, v: string) => (saved[k] = v) },
}));

import { AUTH_KEY, cloudConfig, db, errorAr, getSession, signIn, signOut, token, toSession } from '../src/lib/cloud';
import { SECRET_META, toBackup } from '../src/lib/backup';
import { isLocalMeta } from '../src/lib/metaKeys';

const URL_ = 'https://x.supabase.co';
const res = (status: number, body: unknown) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) }) as unknown as Response;
const tokenBody = (expiresIn = 3600) => ({ access_token: 'A', refresh_token: 'R', expires_in: expiresIn, user: { id: 'u1', email: 'a@b.co' } });
let fetchMock: jest.Mock;

beforeEach(() => {
  process.env.EXPO_PUBLIC_SUPABASE_URL = `${URL_}/`;
  process.env.EXPO_PUBLIC_SUPABASE_KEY = 'pk';
  for (const k of Object.keys(saved)) delete saved[k];
  fetchMock = jest.fn();
  global.fetch = fetchMock;
});

test('no project in this build: cloud off', () => {
  delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  expect(cloudConfig()).toBeNull();
});

test('sign in keeps the session on the phone (phone-only, never in a backup)', async () => {
  fetchMock.mockResolvedValueOnce(res(200, tokenBody()));
  await signIn(' a@b.co ', 'password1');
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe(`${URL_}/auth/v1/token?grant_type=password`);
  expect(JSON.parse(init.body)).toEqual({ email: 'a@b.co', password: 'password1' });
  expect(init.headers.apikey).toBe('pk');
  expect(getSession()?.user.id).toBe('u1');
  expect(isLocalMeta(AUTH_KEY)).toBe(true);
  expect(SECRET_META).toContain(AUTH_KEY);
  const file = JSON.parse(toBackup({ sets: [], meals: [], shop: [], meta: { [AUTH_KEY]: saved[AUTH_KEY], weights: '[]' } }));
  expect(file.data.meta).toEqual({ weights: '[]' });
});

test('wrong password: Arabic error, no session', async () => {
  fetchMock.mockResolvedValueOnce(res(400, { error_code: 'invalid_credentials', msg: 'Invalid login credentials' }));
  await expect(signIn('a@b.co', 'nope')).rejects.toThrow('الإيميل أو الباسورد غلط');
  expect(getSession()).toBeNull();
});

test('database calls carry the user token; an expiring token is refreshed first', async () => {
  saved[AUTH_KEY] = JSON.stringify(toSession(tokenBody(30))); // 30 s left
  fetchMock.mockResolvedValueOnce(res(200, { ...tokenBody(), access_token: 'B' })).mockResolvedValueOnce(res(200, [{ id: 'u1' }]));
  expect(await db('profiles?id=eq.u1')).toEqual([{ id: 'u1' }]);
  expect(fetchMock.mock.calls[0][0]).toContain('grant_type=refresh_token');
  expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer B');
});

test('a refused refresh signs you out; no network keeps the session', async () => {
  saved[AUTH_KEY] = JSON.stringify(toSession(tokenBody(0)));
  fetchMock.mockRejectedValueOnce(new Error('offline'));
  await expect(token()).rejects.toThrow('مفيش إنترنت');
  expect(getSession()).not.toBeNull();
  fetchMock.mockResolvedValueOnce(res(400, { error_code: 'refresh_token_not_found' }));
  await expect(token()).rejects.toThrow();
  expect(getSession()).toBeNull();
});

test('sign out clears the phone even offline', async () => {
  saved[AUTH_KEY] = JSON.stringify(toSession(tokenBody()));
  fetchMock.mockRejectedValueOnce(new Error('offline'));
  await signOut();
  expect(getSession()).toBeNull();
});

test('error texts', () => {
  expect(errorAr(422, { error_code: 'weak_password' })).toContain('8 حروف');
  expect(errorAr(429, {})).toContain('استنى');
  expect(errorAr(500, {})).toBe('حصلت مشكلة (500)');
});
