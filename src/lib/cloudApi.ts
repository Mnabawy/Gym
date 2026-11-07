// Supabase REST calls for sync (no SDK): sign in with the Google id token, refresh, pull rows after a rev, push a batch.
// Pure: takes the project's URL/key and fetch, so it's unit tested in __tests__/cloudApi.test.ts. Runtime: cloud.ts.
import type { CloudRow, Pulled } from './cloudSync';

type Fetch = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>;
export type CloudConfig = { url: string; key: string };
export type Session = { access: string; refresh: string; exp: number; uid: string; email: string };

export class CloudError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Rows per request, both ways (PostgREST returns at most 1000). */
export const PAGE = 1000;
export const PUSH_BATCH = 500;

const base = (c: CloudConfig) => c.url.replace(/\/+$/, '');
const headers = (c: CloudConfig, token?: string) => ({ apikey: c.key, Authorization: `Bearer ${token ?? c.key}`, 'Content-Type': 'application/json' });
async function check<T extends { ok: boolean; status: number; text(): Promise<string> }>(res: T): Promise<T> {
  if (!res.ok) throw new CloudError(res.status, (await res.text().catch(() => '')).slice(0, 300));
  return res;
}

function toSession(b: unknown, now: number): Session {
  const x = b as { access_token: string; refresh_token: string; expires_in?: number; user?: { id?: string; email?: string } };
  if (!x?.access_token || !x.refresh_token) throw new CloudError(500, 'no session in reply');
  return { access: x.access_token, refresh: x.refresh_token, exp: now + (x.expires_in ?? 3600) * 1000, uid: x.user?.id ?? '', email: x.user?.email ?? '' };
}

/** Signs in to Supabase with the Google account's id token (Google provider on in the project). */
export async function signInWithGoogle(c: CloudConfig, idToken: string, f: Fetch, now = Date.now()): Promise<Session> {
  const res = await check(await f(`${base(c)}/auth/v1/token?grant_type=id_token`, { method: 'POST', headers: headers(c), body: JSON.stringify({ provider: 'google', id_token: idToken }) }));
  return toSession(await res.json(), now);
}

export async function refreshSession(c: CloudConfig, refresh: string, f: Fetch, now = Date.now()): Promise<Session> {
  const res = await check(await f(`${base(c)}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: headers(c), body: JSON.stringify({ refresh_token: refresh }) }));
  return toSession(await res.json(), now);
}

/** One page of your rows changed after `since` (a rev), in rev order. */
export async function pullRows(c: CloudConfig, token: string, since: number, f: Fetch, limit = PAGE): Promise<Pulled[]> {
  const q = `select=kind,key,data,deleted,updated_at,rev&rev=gt.${since}&order=rev.asc&limit=${limit}`;
  const res = await check(await f(`${base(c)}/rest/v1/rows?${q}`, { headers: headers(c, token) }));
  return ((await res.json()) as Pulled[]).map((r) => ({ ...r, updated_at: Number(r.updated_at), rev: Number(r.rev) }));
}

/** Sends a batch; on the server the newer edit of each row wins. */
export async function pushRows(c: CloudConfig, token: string, rows: readonly CloudRow[], f: Fetch): Promise<void> {
  await check(await f(`${base(c)}/rest/v1/rpc/push_rows`, { method: 'POST', headers: headers(c, token), body: JSON.stringify({ items: rows }) }));
}
