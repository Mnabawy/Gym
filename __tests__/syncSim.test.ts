/// <reference types="jest" />
// The simulator itself: the fake server behaves like supabase/schema.sql, and each simulated phone is isolated.
import { Sim, until, deferred } from '../test-utils/syncSim';

let sim: Sim;
beforeEach(() => {
  sim = new Sim();
  sim.install();
});
afterEach(() => sim.uninstall());

test('two phones are isolated from each other (own storage, own change log, own sync state)', async () => {
  const a = sim.device('A');
  const b = sim.device('B');
  a.setRow('2026-11-01', 'bench', 0);
  expect(a.setKeys()).toEqual(['2026-11-01|bench|0']);
  expect(b.setKeys()).toEqual([]);
  a.signInGoogle('a@x.test');
  await a.act(() => a.cloud.linkCloud());
  expect(a.cloud.cloudLinked()).toBe(true);
  expect(b.cloud.cloudLinked()).toBe(false);
  expect(b.track.trackingOn()).toBe(false);
});

test('the fake server: the newer updated_at wins, an older push is skipped but still uses a rev', () => {
  const s = sim.server;
  s.put('a@x.test', { kind: 'meta', key: 'weights', data: 'new', updated_at: 200 });
  s.put('a@x.test', { kind: 'meta', key: 'weights', data: 'old', updated_at: 100 });
  expect(s.find('a@x.test', 'meta', 'weights')).toMatchObject({ data: 'new', updated_at: 200, rev: 1 });
  expect(s.skipped).toHaveLength(1);
  expect(s.rev).toBe(2);
  s.put('a@x.test', { kind: 'meta', key: 'weights', data: 'same-time', updated_at: 200 });
  expect(s.find('a@x.test', 'meta', 'weights')).toMatchObject({ data: 'same-time', rev: 3 });
});

test('the fake server: rows are per account, a bad kind fails the whole batch', async () => {
  const a = sim.device('A');
  a.signInGoogle('a@x.test');
  await a.act(() => a.cloud.linkCloud());
  a.setRow('2026-11-01', 'bench', 0);
  await a.sync();
  expect(sim.server.keysOf('a@x.test')).toEqual(['set:2026-11-01|bench|0']);
  expect(sim.server.keysOf('b@x.test')).toEqual([]);
  const r = await sim.server.fetch(`${'https://x.test'}/rest/v1/rpc/push_rows`, { method: 'POST', headers: { Authorization: 'Bearer nope' }, body: '{}' });
  expect(r.status).toBe(401);
});

test('offline phones throw like a dead network, others are unaffected', async () => {
  const a = sim.device('A');
  const b = sim.device('B');
  a.signInGoogle('a@x.test');
  b.signInGoogle('a@x.test');
  sim.server.offline.add('A');
  await expect(a.act(() => a.cloud.linkCloud())).rejects.toThrow('Network request failed');
  await b.act(() => b.cloud.linkCloud());
  expect(b.cloud.cloudLinked()).toBe(true);
});

test('a push can be held between "revs handed out" and "committed"', async () => {
  const a = sim.device('A');
  a.signInGoogle('a@x.test');
  await a.act(() => a.cloud.linkCloud());
  const gate = deferred();
  sim.server.holdCommit = () => gate.promise;
  a.setRow('2026-11-01', 'bench', 0);
  const p = a.sync();
  await until(() => sim.server.requests.some((r) => r.call === 'push'), 'the push');
  expect(sim.server.keysOf('a@x.test')).toEqual([]); // not committed yet
  expect(sim.server.rev).toBe(1); // but its rev is taken
  gate.resolve();
  await p;
  expect(sim.server.keysOf('a@x.test')).toEqual(['set:2026-11-01|bench|0']);
});

test('virtual clock: every phone reads the shared time plus its own skew', () => {
  const a = sim.device('A', { skewMs: 5000 });
  const b = sim.device('B');
  expect(a.do(() => Date.now()) - b.do(() => Date.now())).toBe(5000);
  sim.advance(1000);
  expect(b.do(() => Date.now())).toBe(sim.time);
});

test('creating a phone puts the environment back: a variable that did not exist is deleted, one that did is kept', () => {
  delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'kept';
  sim.device('A');
  sim.device('B', { configured: false });
  expect('EXPO_PUBLIC_SUPABASE_URL' in process.env).toBe(false);
  expect(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY).toBe('kept');
  delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
});

test('the fake server: the same row twice in one batch fails the whole batch, like Postgres', async () => {
  const a = sim.device('A');
  a.signInGoogle('a@x.test');
  await a.act(() => a.cloud.linkCloud());
  const access = JSON.parse(String(a.meta('sync.session'))).access as string;
  const push = (items: unknown[]) => sim.server.fetch('https://x.test/rest/v1/rpc/push_rows', { method: 'POST', headers: { Authorization: `Bearer ${access}` }, body: JSON.stringify({ items }) });
  const dup = await push([{ kind: 'meta', key: 'k', data: 'a', updated_at: 1 }, { kind: 'meta', key: 'k', data: 'b', updated_at: 2 }, { kind: 'meta', key: 'other', data: 'c', updated_at: 1 }]);
  expect(dup.status).toBe(400);
  expect(sim.server.keysOf('a@x.test')).toEqual([]); // nothing of the batch was written
  expect((await push([{ kind: 'meta', key: 'k', data: 'a', updated_at: 1 }, { kind: 'set', key: 'k', data: 'b', updated_at: 1 }])).status).toBe(204); // same key, different kind: fine
});

test('the fake server can lose a reply after it has handled the request', async () => {
  const a = sim.device('A');
  a.signInGoogle('a@x.test');
  await a.act(() => a.cloud.linkCloud());
  a.setRow('2026-11-01', 'bench', 0);
  sim.server.dropResponse = (r) => r.call === 'push';
  await expect(a.sync()).rejects.toThrow('Network request failed');
  expect(sim.server.keysOf('a@x.test')).toEqual(['set:2026-11-01|bench|0']); // committed anyway
});
