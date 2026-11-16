// A fake Supabase for the sync tests. It answers exactly the calls src/lib/cloudApi.ts makes and mirrors
// supabase/schema.sql: one `rows` table per user, a global `rev` counter handed out when a push starts, an upsert that
// keeps the row with the newer `updated_at` (`<=`), a `kind` check that fails the whole batch, the same row twice in one
// batch failing the whole batch ("ON CONFLICT DO UPDATE command cannot affect row a second time"), and row isolation per
// user. Knobs for failures: offline per phone, injected status codes, a hold between "revs reserved" and "committed" (the
// window in which two pushes overlap), a response lost after the server already committed, revoked tokens.

export type Row = { kind: string; key: string; data: unknown; deleted: boolean; updated_at: number; rev: number };
export type PushItem = { kind: string; key: string; data?: unknown; deleted?: boolean; updated_at: number };
export type Req = { n: number; device: string; email: string; call: 'sign-in' | 'refresh' | 'pull' | 'push'; since?: number; items?: PushItem[]; returned?: number };
type Reply = { ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> };

const reply = (status: number, body: unknown = null): Reply => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body ?? '')),
});
const KINDS = ['set', 'meal', 'shop', 'meta'];
const NUL = '\u0000';

export class FakeSupabase {
  /** The last rev handed out (the `rows_rev` sequence). */
  rev = 0;
  rows = new Map<string, Row>();
  requests: Req[] = [];
  /** PostgREST's max rows per response (the project setting; 1000 by default). */
  maxRows = 1000;
  expiresIn = 3600;
  /** Phones (device ids) that can't reach the server: their fetch throws like a dead network. */
  offline = new Set<string>();
  /** Refresh tokens are refused (revoked session). */
  refreshRevoked = false;
  /** Called first for every request; return an HTTP status to fail it with, or await to pause it. */
  onRequest?: (r: Req) => Promise<number | void> | number | void;
  /** Called in a push after its revs were handed out and before it commits (the overlap window). */
  holdCommit?: (r: Req) => Promise<void> | void;
  /** Return true to lose the reply of a request that the server has already handled (a push is committed, a pull was read). */
  dropResponse?: (r: Req) => boolean;
  /** Rows a push carried that the upsert rule skipped because the stored row had a newer `updated_at`. */
  skipped: { email: string; kind: string; key: string; incoming: number; stored: number }[] = [];
  private valid = new Set<string>();
  private seq = 0;

  private id = (email: string, kind: string, key: string) => `${email}${NUL}${kind}${NUL}${key}`;

  /** Every access token the server has issued stops working (a revoked or rotated session). */
  invalidateAccess() {
    this.valid.clear();
  }

  /** The rows of one account, as the server holds them (including deleted ones). */
  rowsOf(email: string): Row[] {
    return [...this.rows.entries()].filter(([k]) => k.startsWith(`${email}${NUL}`)).map(([, r]) => r).sort((a, b) => a.rev - b.rev);
  }
  /**
   * `kind:key` of the live (not deleted) rows of an account, sorted. The `dataVersion` row every build since data
   * version 2 writes on its first sync is bookkeeping, not data: left out here (`find` it, dataVersion.test.ts).
   */
  keysOf(email: string): string[] {
    return this.rowsOf(email).filter((r) => !r.deleted && !(r.kind === 'meta' && r.key === 'dataVersion')).map((r) => `${r.kind}:${r.key}`).sort();
  }
  find(email: string, kind: string, key: string): Row | undefined {
    return this.rows.get(this.id(email, kind, key));
  }
  /** Another client writing straight to the server (outside any simulated phone). Same upsert rule as a push. */
  put(email: string, item: PushItem): void {
    this.commit(email, item, ++this.rev);
  }

  private commit(email: string, it: PushItem, rev: number) {
    const k = this.id(email, it.kind, it.key);
    const old = this.rows.get(k);
    if (old && old.updated_at > it.updated_at) {
      this.skipped.push({ email, kind: it.kind, key: it.key, incoming: it.updated_at, stored: old.updated_at });
      return;
    }
    this.rows.set(k, { kind: it.kind, key: it.key, data: it.data ?? null, deleted: !!it.deleted, updated_at: it.updated_at, rev });
  }

  private session(email: string, device: string) {
    const access = `acc|${email}|${device}|${++this.seq}`;
    this.valid.add(access);
    return { access_token: access, refresh_token: `ref|${email}|${device}|${this.seq}`, expires_in: this.expiresIn, user: { id: `user-${email}`, email } };
  }

  /** The `fetch` the app code gets (cloudApi.ts passes the global one). Tokens carry the phone that holds them. */
  fetch = async (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }): Promise<Reply> => {
    const body = init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : undefined;
    const q = url.split('?')[1] ?? '';
    let email = '';
    let device = '';
    let call: Req['call'];
    if (url.includes('/auth/v1/token')) {
      const raw = String(q.includes('grant_type=id_token') ? body?.id_token : body?.refresh_token);
      const [, e, d] = raw.split('|');
      email = e ?? '';
      device = d ?? '';
      call = q.includes('grant_type=id_token') ? 'sign-in' : 'refresh';
    } else {
      const token = (init?.headers?.Authorization ?? '').replace(/^Bearer /, '');
      const [, e, d] = token.split('|');
      email = e ?? '';
      device = d ?? '';
      call = url.includes('/rpc/push_rows') ? 'push' : 'pull';
      if (!this.valid.has(token)) {
        this.requests.push({ n: this.requests.length + 1, device, email, call });
        return reply(401, 'JWT expired or invalid');
      }
    }
    const req: Req = { n: this.requests.length + 1, device, email, call };
    this.requests.push(req);
    if (this.offline.has(device)) throw new TypeError('Network request failed');
    const injected = await this.onRequest?.(req);
    if (typeof injected === 'number') return reply(injected, 'injected failure');

    if (call === 'sign-in') {
      if (!email) return reply(400, 'bad id token');
      return reply(200, this.session(email, device));
    }
    if (call === 'refresh') {
      if (this.refreshRevoked || !email) return reply(400, 'refresh token revoked');
      return reply(200, this.session(email, device));
    }
    if (call === 'pull') {
      const since = Number(/(?:^|&)rev=gt\.(\d+)/.exec(q)?.[1] ?? 0);
      const limit = Math.min(Number(/(?:^|&)limit=(\d+)/.exec(q)?.[1] ?? this.maxRows), this.maxRows);
      const rows = this.rowsOf(email).filter((r) => r.rev > since).slice(0, limit);
      req.since = since;
      req.returned = rows.length;
      if (this.dropResponse?.(req)) throw new TypeError('Network request failed');
      return reply(200, rows.map((r) => ({ ...r })));
    }
    // push_rows(items): the whole batch fails on a bad kind; each row gets a rev now, the write lands at commit.
    const items = ((body?.items ?? []) as PushItem[]).map((x) => ({ ...x }));
    req.items = items;
    if (items.some((x) => !KINDS.includes(x.kind))) return reply(400, 'new row violates check constraint "rows_kind_check"');
    const keys = items.map((x) => `${x.kind}${NUL}${x.key}`);
    if (new Set(keys).size !== keys.length) return reply(400, 'ON CONFLICT DO UPDATE command cannot affect row a second time');
    const revs = items.map(() => ++this.rev);
    await this.holdCommit?.(req);
    items.forEach((it, i) => this.commit(email, it, revs[i]));
    if (this.dropResponse?.(req)) throw new TypeError('Network request failed');
    return reply(204);
  };
}
