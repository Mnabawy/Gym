// GymApp cloud (Supabase): sign in with email and password, and call the database — plain fetch, no SDK (no native
// packages, nothing to polyfill). Schema and row level security: supabase/migrations/0001_gymapp.sql.
// Configured at build time by EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_KEY (the project's publishable key,
// safe to ship); without them every cloud feature stays hidden and the app is fully offline as before.
// The session lives in phone-only meta `auth` (metaKeys.ts), never in a backup. Tested in __tests__/cloud.test.ts.
import { storage } from './storage';

export const AUTH_KEY = 'auth';

export type CloudConfig = { url: string; key: string };
export type Session = { access_token: string; refresh_token: string; expires_at: number; user: { id: string; email: string } };

/** The project, or null when this build has none. */
export function cloudConfig(): CloudConfig | null {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '');
  const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;
  return url && key ? { url, key } : null;
}
export const cloudOn = () => cloudConfig() != null;

export class CloudError extends Error {
  constructor(message: string, readonly status = 0) {
    super(message);
  }
}

/** Arabic text for an error from Supabase (or the network). */
export function errorAr(status: number, body: unknown): string {
  const o = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const code = String(o.error_code ?? o.code ?? o.error ?? '');
  const msg = String(o.msg ?? o.message ?? o.error_description ?? '');
  if (code === 'invalid_credentials' || /invalid login/i.test(msg)) return 'الإيميل أو الباسورد غلط';
  if (code === 'user_already_exists' || /already registered/i.test(msg)) return 'الإيميل ده عنده حساب بالفعل، سجّل دخول';
  if (code === 'weak_password' || /password should be/i.test(msg)) return 'الباسورد ضعيف: 8 حروف أو أكتر';
  if (code === 'email_address_invalid' || /invalid email|unable to validate email/i.test(msg)) return 'الإيميل مش مظبوط';
  if (code === 'email_not_confirmed') return 'أكّد إيميلك الأول من الرسالة اللي وصلتك';
  if (code === 'over_email_send_rate_limit' || status === 429) return 'محاولات كتير، استنى شوية وجرّب تاني';
  if (status === 401 || status === 403) return 'لازم تسجّل دخول تاني';
  return status ? `حصلت مشكلة (${status})` : 'مفيش إنترنت أو السيرفر مش بيرد';
}

async function call(path: string, init: { method?: string; body?: unknown; token?: string; prefer?: string } = {}): Promise<unknown> {
  const c = cloudConfig();
  if (!c) throw new CloudError('الحساب مش متفعّل في النسخة دي');
  let res: Response;
  try {
    res = await fetch(`${c.url}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        apikey: c.key,
        Authorization: `Bearer ${init.token ?? c.key}`,
        'Content-Type': 'application/json',
        ...(init.prefer ? { Prefer: init.prefer } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new CloudError(errorAr(0, null));
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) throw new CloudError(errorAr(res.status, body), res.status);
  return body;
}

/** A session from Supabase's token response, or null if it isn't one. */
export function toSession(v: unknown, now = Date.now()): Session | null {
  const o = (v ?? {}) as Record<string, unknown>;
  const u = (o.user ?? {}) as Record<string, unknown>;
  if (typeof o.access_token !== 'string' || typeof o.refresh_token !== 'string' || typeof u.id !== 'string') return null;
  const expiresAt = typeof o.expires_at === 'number' ? o.expires_at : Math.floor(now / 1000) + (typeof o.expires_in === 'number' ? o.expires_in : 3600);
  return { access_token: o.access_token, refresh_token: o.refresh_token, expires_at: expiresAt, user: { id: u.id, email: typeof u.email === 'string' ? u.email : '' } };
}

export function getSession(): Session | null {
  try {
    return toSession(JSON.parse(storage.getMeta(AUTH_KEY) ?? 'null'));
  } catch {
    return null;
  }
}
const keep = (s: Session | null) => storage.setMeta(AUTH_KEY, s ? JSON.stringify(s) : '');

/** New account. When the project asks for email confirmation there's no session yet: returns null (check your email). */
export async function signUp(email: string, password: string): Promise<Session | null> {
  const s = toSession(await call('/auth/v1/signup', { method: 'POST', body: { email: email.trim(), password } }));
  keep(s);
  return s;
}

export async function signIn(email: string, password: string): Promise<Session> {
  const s = toSession(await call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: email.trim(), password } }));
  if (!s) throw new CloudError(errorAr(0, null));
  keep(s);
  return s;
}

/** Signs out here (and on the server when it can be reached). Your data on the phone stays. */
export async function signOut(): Promise<void> {
  const s = getSession();
  keep(null);
  if (s) await call('/auth/v1/logout', { method: 'POST', token: s.access_token }).catch(() => {});
}

/** A token that's good for at least another minute (refreshed when needed), or an error asking to sign in again. */
export async function token(now = Date.now()): Promise<{ token: string; userId: string }> {
  let s = getSession();
  if (!s) throw new CloudError('لازم تسجّل دخول', 401);
  if (s.expires_at * 1000 - now < 60_000) {
    try {
      s = toSession(await call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: s.refresh_token } }), now);
    } catch (e) {
      if (e instanceof CloudError && e.status >= 400 && e.status < 500) keep(null); // refresh token gone: sign in again
      throw e;
    }
    if (!s) throw new CloudError('لازم تسجّل دخول', 401);
    keep(s);
  }
  return { token: s.access_token, userId: s.user.id };
}

/** Database call as the signed-in user: `path` under /rest/v1 (PostgREST). */
export async function db<T = unknown>(path: string, init: { method?: string; body?: unknown; prefer?: string } = {}): Promise<T> {
  const t = await token();
  return (await call(`/rest/v1/${path}`, { ...init, token: t.token })) as T;
}

/** A database function (supabase/migrations: become_coach, join_coach). */
export const rpc = <T = unknown>(name: string, args: Record<string, unknown> = {}) => db<T>(`rpc/${name}`, { method: 'POST', body: args });
