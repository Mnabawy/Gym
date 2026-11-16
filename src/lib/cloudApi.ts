// Supabase REST calls for sync (no SDK): sign in with the Google id token, refresh, pull rows after a rev, push a batch.
// Pure: takes the project's URL/key and fetch, so it's unit tested in __tests__/cloudApi.test.ts. Runtime: cloud.ts.
import type { CloudRow, Pulled } from './cloudSync';

type Fetch = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string>; headers?: { get(name: string): string | null } }>;
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

/**
 * One page of your rows changed after `since` (a rev), in rev order, and the server's clock (ms) from the reply's Date
 * header (null when there is none, or a browser hides it): used to keep a phone whose clock runs ahead from stamping its
 * edits in the future (cloud.ts). Whole seconds only, which is plenty for that.
 */
export async function pullPage(c: CloudConfig, token: string, since: number, f: Fetch, limit = PAGE): Promise<{ rows: Pulled[]; serverTime: number | null }> {
  const q = `select=kind,key,data,deleted,updated_at,rev&rev=gt.${since}&order=rev.asc&limit=${limit}`;
  const res = await check(await f(`${base(c)}/rest/v1/rows?${q}`, { headers: headers(c, token) }));
  const rows = ((await res.json()) as Pulled[]).map((r) => ({ ...r, updated_at: Number(r.updated_at), rev: Number(r.rev) }));
  return { rows, serverTime: serverTime(res.headers) };
}
export async function pullRows(c: CloudConfig, token: string, since: number, f: Fetch, limit = PAGE): Promise<Pulled[]> {
  return (await pullPage(c, token, since, f, limit)).rows;
}
function serverTime(h: { get(name: string): string | null } | undefined): number | null {
  let v: string | null = null;
  try {
    v = h?.get?.('date') ?? null;
  } catch {
    return null;
  }
  const t = v ? Date.parse(v) : NaN;
  return isFinite(t) && t > 0 ? t : null;
}

/** Sends a batch; on the server the newer edit of each row wins. */
export async function pushRows(c: CloudConfig, token: string, rows: readonly CloudRow[], f: Fetch): Promise<void> {
  await check(await f(`${base(c)}/rest/v1/rpc/push_rows`, { method: 'POST', headers: headers(c, token), body: JSON.stringify({ items: rows }) }));
}
