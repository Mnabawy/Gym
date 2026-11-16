/// <reference types="jest" />
// The real cloud.ts / track.ts / cloudSync.ts / cloudApi.ts run against a fake Supabase (test-utils/). These tests pin
// down how sync behaves today, in the normal cases. The risky cases are in cloudRisks.test.ts.
import { deferred, Sim, until } from '../test-utils/syncSim';

let sim: Sim;
beforeEach(() => {
  sim = new Sim();
  sim.install();
});
afterEach(() => sim.uninstall());

const A = 'a@x.test';
const task = (id: string) => ({ id, title: `task ${id}` });
const tasks = (...ids: string[]) => JSON.stringify(ids.map(task));

describe('linkCloud and the first sync', () => {
  test('a phone with data signs in: everything goes up, sync turns on, the change log is empty', async () => {
    const a = sim.device('A');
    a.setRow('2026-11-01', 'bench', 0);
    a.do(() => a.storage.setMealCheck('2026-11-01', 'breakfast', true));
    a.setMeta('tasks', tasks('t1', 't2'));
    a.setMeta('weights', '[{"date":"2026-11-01","kg":80}]');
    await a.signIn(A);
    expect(sim.server.keysOf(A)).toEqual(
      ['meal:2026-11-01|breakfast', 'meta:tasks/t1', 'meta:tasks/t2', 'meta:weights/2026-11-01', 'set:2026-11-01|bench|0'].sort(),
    );
    expect(a.track.trackingOn()).toBe(true);
    expect(a.meta('sync.full')).toBe('1');
    expect(a.dirtyKeys()).toEqual([]);
    expect(a.status().state).toBe('saved');
  });

  test('a second empty phone with the same account gets everything back', async () => {
    const a = sim.device('A');
    a.setRow('2026-11-01', 'bench', 0);
    a.setMeta('tasks', tasks('t1'));
    a.setMeta('weights', '[{"date":"2026-11-01","kg":80}]');
    await a.signIn(A);
    const b = sim.device('B');
    await b.signIn(A);
    expect(b.setKeys()).toEqual(['2026-11-01|bench|0']);
    expect(b.tasks()).toEqual(['t1']);
    expect(b.meta('weights')).toBe(a.meta('weights'));
    expect(b.dirtyKeys()).toEqual([]);
  });

  test('first sync on a phone that already has data: records are merged one by one, the server wins on the same record, the phone-only ones go up', async () => {
    const a = sim.device('A');
    a.setRow('2026-11-01', 'bench', 0, 60);
    await a.signIn(A);
    sim.advance(1000);
    const b = sim.device('B');
    b.setRow('2026-11-01', 'bench', 0, 99); // the same set, different value
    b.setRow('2026-11-02', 'squat', 0, 100); // only on B
    await b.signIn(A);
    expect(b.raw.allSets().find((r) => r.exId === 'bench')?.kg).toBe(60); // server wins on the same set
    expect(sim.server.keysOf(A)).toContain('set:2026-11-02|squat|0'); // B's own set went up
  });

  test('not configured (no Supabase env): keepSynced and syncCloud do nothing', async () => {
    const a = sim.device('A', { configured: false });
    a.signInGoogle(A);
    expect(a.cloud.cloudConfigured).toBe(false);
    await a.keepSynced();
    expect(sim.server.requests).toHaveLength(0);
    expect(await a.sync()).toBe('off');
  });

  test('keepSynced: signed in to Google but sync not on yet → it turns sync on by itself', async () => {
    const a = sim.device('A');
    a.setRow('2026-11-01', 'bench', 0);
    a.signInGoogle(A);
    expect(a.cloud.cloudLinked()).toBe(false);
    await a.keepSynced();
    expect(a.cloud.cloudLinked()).toBe(true);
    expect(sim.server.keysOf(A)).toEqual(['set:2026-11-01|bench|0']);
  });

  test('keepSynced never throws, also offline; the sign-in is retried on the next call', async () => {
    const a = sim.device('A');
    a.signInGoogle(A);
    sim.server.offline.add('A');
    await expect(a.keepSynced()).resolves.toBeUndefined();
    expect(a.cloud.cloudLinked()).toBe(false);
    sim.server.offline.delete('A');
    await a.keepSynced();
    expect(a.cloud.cloudLinked()).toBe(true);
  });
});

describe('the change log (dirty) and push', () => {
  test('writes while sync is on are noted; a sync sends them and clears the note', async () => {
    const a = sim.device('A');
    await a.signIn(A);
    a.setRow('2026-11-01', 'bench', 0);
    a.setMeta('weights', '[{"date":"2026-11-01","kg":80}]');
    expect(a.dirtyKeys()).toEqual(['meta:weights/2026-11-01', 'set:2026-11-01|bench|0']);
    expect(a.status()).toMatchObject({ state: 'waiting', waiting: 2 });
    await a.sync();
    expect(a.dirtyKeys()).toEqual([]);
    expect(a.status().state).toBe('saved');
    expect(sim.server.find(A, 'set', '2026-11-01|bench|0')?.deleted).toBe(false);
  });

  test('a record edited again while its push is in flight stays noted for the next sync', async () => {
    const a = sim.device('A');
    await a.signIn(A);
    a.setRow('2026-11-01', 'bench', 0, 60);
    const gate = deferred();
    sim.server.holdCommit = () => gate.promise;
    const n0 = sim.server.requests.length; // the sign-in's own push came before
    const p = a.sync();
    await until(() => sim.server.requests.slice(n0).some((r) => r.call === 'push'), 'the push');
    sim.advance(1000);
    a.setRow('2026-11-01', 'bench', 0, 70); // edited during the push
    gate.resolve();
    await p;
    expect(a.dirtyKeys()).toEqual(['set:2026-11-01|bench|0']);
    sim.server.holdCommit = undefined;
    await a.sync();
    expect(a.dirtyKeys()).toEqual([]);
    expect((sim.server.find(A, 'set', '2026-11-01|bench|0')?.data as { kg: number }).kg).toBe(70);
  });

  test('offline: the sync fails and is flagged, the edits stay noted, the next sync sends them', async () => {
    const a = sim.device('A');
    await a.signIn(A);
    sim.server.offline.add('A');
    a.setRow('2026-11-01', 'bench', 0);
    await expect(a.sync()).rejects.toThrow('Network request failed');
    expect(a.status().state).toBe('failed');
    expect(a.dirtyKeys()).toEqual(['set:2026-11-01|bench|0']);
    sim.server.offline.delete('A');
    await a.sync();
    expect(a.status().state).toBe('saved');
    expect(sim.server.keysOf(A)).toEqual(['set:2026-11-01|bench|0']);
  });

  test('partial push failure: the batch that went stays gone from the log, the rest stays and is sent next time', async () => {
    const a = sim.device('A');
    await a.signIn(A);
    for (let i = 0; i < 520; i++) a.setRow('2026-11-01', 'bench', i);
    let pushes = 0;
    sim.server.onRequest = (r) => (r.call === 'push' && ++pushes === 2 ? 500 : undefined);
    await expect(a.sync()).rejects.toThrow();
    expect(sim.server.keysOf(A)).toHaveLength(500);
    expect(a.dirtyKeys()).toHaveLength(20);
    expect(a.status().state).toBe('failed');
    sim.server.onRequest = undefined;
    await a.sync();
    expect(sim.server.keysOf(A)).toHaveLength(520);
    expect(a.dirtyKeys()).toEqual([]);
  });

  test('the reply to a push is lost after the server committed: the retry sends the same rows again and nothing doubles or changes', async () => {
    const a = sim.device('A');
    const b = sim.device('B');
    a.setRow('2026-11-01', 'bench', 0, 60);
    a.setRow('2026-11-01', 'bench', 1, 62);
    a.setMeta('tasks', tasks('t1'));
    await a.signIn(A);
    await b.signIn(A);
    sim.advance(1000);
    a.setRow('2026-11-02', 'squat', 0, 100);
    a.setMeta('tasks', tasks('t1', 't2'));
    a.do(() => a.storage.clearDay('2026-11-01', ['bench'])); // a delete in the same batch
    sim.server.dropResponse = (r) => r.call === 'push';
    await expect(a.sync()).rejects.toThrow('Network request failed');
    expect(a.status().state).toBe('failed');
    expect(a.dirtyKeys().length).toBeGreaterThan(0); // the phone does not know it went through
    const committed = JSON.stringify(sim.server.rowsOf(A).map((r) => [r.kind, r.key, r.data, r.deleted, r.updated_at]));
    const revBefore = sim.server.rev;
    const requestsBefore = sim.server.requests.length;
    sim.server.dropResponse = undefined;
    await a.sync(); // the retry
    const after = JSON.stringify(sim.server.rowsOf(A).map((r) => [r.kind, r.key, r.data, r.deleted, r.updated_at]));
    expect(after).toBe(committed); // same rows, same values, same timestamps, no extra rows
    // The retry's pull returns the phone's own committed rows; their timestamps equal the phone's, which counts as
    // "the server's", so the pull clears the pending entries and nothing is sent twice.
    expect(sim.server.requests.slice(requestsBefore).filter((r) => r.call === 'push')).toHaveLength(0);
    expect(sim.server.rev).toBe(revBefore);
    expect(sim.server.skipped).toEqual([]);
    expect(a.dirtyKeys()).toEqual([]);
    expect(a.status().state).toBe('saved');
    await b.sync();
    expect(b.setKeys()).toEqual(['2026-11-02|squat|0']); // the other phone ends up with exactly the right data
    expect(b.tasks().sort()).toEqual(['t1', 't2']);
    expect(b.dirtyKeys()).toEqual([]);
    expect(a.setKeys()).toEqual(b.setKeys());
  });

  test('reply to a push lost, then one of its records edited again: the retry sends only that record', async () => {
    const a = sim.device('A');
    await a.signIn(A);
    a.setRow('2026-11-01', 'bench', 0, 60);
    a.setRow('2026-11-01', 'bench', 1, 62);
    sim.server.dropResponse = (r) => r.call === 'push';
    await expect(a.sync()).rejects.toThrow('Network request failed');
    sim.advance(1000);
    a.setRow('2026-11-01', 'bench', 1, 70); // edited after the lost reply
    sim.server.dropResponse = undefined;
    const requestsBefore = sim.server.requests.length;
    await a.sync();
    const pushes = sim.server.requests.slice(requestsBefore).filter((r) => r.call === 'push');
    expect(pushes).toHaveLength(1);
    expect(pushes[0].items?.map((x) => x.key)).toEqual(['2026-11-01|bench|1']);
    expect((sim.server.find(A, 'set', '2026-11-01|bench|1')?.data as { kg: number }).kg).toBe(70);
    expect((sim.server.find(A, 'set', '2026-11-01|bench|0')?.data as { kg: number }).kg).toBe(60);
    expect(a.dirtyKeys()).toEqual([]);
  });

  test('the reply to a pull is lost: nothing is applied and the cursor does not move; the retry brings everything', async () => {
    const a = sim.device('A');
    const b = sim.device('B');
    a.setRow('2026-11-01', 'bench', 0);
    await a.signIn(A);
    await b.signIn(A);
    sim.advance(1000);
    a.setRow('2026-11-02', 'squat', 0);
    await a.sync();
    const cursor = b.meta('sync.cursor');
    sim.server.dropResponse = (r) => r.call === 'pull' && r.device === 'B';
    await expect(b.sync()).rejects.toThrow('Network request failed');
    expect(b.meta('sync.cursor')).toBe(cursor);
    expect(b.setKeys()).toEqual(['2026-11-01|bench|0']);
    sim.server.dropResponse = undefined;
    await b.sync();
    expect(b.setKeys()).toEqual(['2026-11-01|bench|0', '2026-11-02|squat|0']);
  });

  test('a delete travels as a row marked deleted and removes the set on the other phone', async () => {
    const a = sim.device('A');
    const b = sim.device('B');
    a.setRow('2026-11-01', 'bench', 0);
    await a.signIn(A);
    await b.signIn(A);
    expect(b.setKeys()).toHaveLength(1);
    sim.advance(1000);
    a.do(() => a.storage.clearDay('2026-11-01', ['bench']));
    await a.sync();
    expect(sim.server.find(A, 'set', '2026-11-01|bench|0')?.deleted).toBe(true);
    await b.sync();
    expect(b.setKeys()).toEqual([]);
  });
});

describe('pull and the cursor', () => {
  test('the cursor is the last rev pulled; right after, a sync re-reads the recent revs; once settled, nothing new pulls nothing', async () => {
    const a = sim.device('A');
    const b = sim.device('B');
    a.setRow('2026-11-01', 'bench', 0);
    await a.signIn(A);
    await b.signIn(A);
    expect(Number(b.meta('sync.cursor'))).toBe(sim.server.rev);
    let before = sim.server.requests.length;
    await b.sync(); // within SETTLE_MS: the recent revs are read again, but not applied again
    let pulls = sim.server.requests.slice(before).filter((r) => r.call === 'pull');
    expect(pulls[0].since).toBeLessThan(sim.server.rev);
    expect(b.dirtyKeys()).toEqual([]);
    sim.advance(3 * 60_000);
    await b.sync(); // the window catches up with the cursor
    before = sim.server.requests.length;
    await b.sync();
    pulls = sim.server.requests.slice(before).filter((r) => r.call === 'pull');
    expect(pulls).toHaveLength(1);
    expect(pulls[0].returned).toBe(0);
    expect(pulls[0].since).toBe(sim.server.rev);
  });

  test('a long pull is read in pages of 1000; the cursor is saved after each page', async () => {
    for (let i = 0; i < 1500; i++) sim.server.put(A, { kind: 'set', key: `2026-11-01|bench|${i}`, data: { date: '2026-11-01', exId: 'bench', idx: i, weekday: 1, kg: 1, reps: 1, done: 1 }, updated_at: sim.time });
    const a = sim.device('A');
    await a.signIn(A);
    expect(a.setKeys()).toHaveLength(1500);
    expect(Number(a.meta('sync.cursor'))).toBe(1500);
  });

  test('a pull cut off after the first page keeps what it got; the next sync continues from the cursor', async () => {
    for (let i = 0; i < 1500; i++) sim.server.put(A, { kind: 'set', key: `2026-11-01|bench|${i}`, data: { date: '2026-11-01', exId: 'bench', idx: i, weekday: 1, kg: 1, reps: 1, done: 1 }, updated_at: sim.time });
    const a = sim.device('A');
    a.signInGoogle(A);
    let pulls = 0;
    sim.server.onRequest = (r) => (r.call === 'pull' && ++pulls === 2 ? 500 : undefined);
    await expect(a.act(() => a.cloud.linkCloud())).rejects.toThrow();
    expect(a.setKeys()).toHaveLength(1000);
    expect(a.meta('sync.cursor')).toBe('1000');
    expect(a.meta('sync.full')).not.toBe('1'); // the first sync is not marked done until it finishes
    sim.server.onRequest = undefined;
    await a.sync();
    expect(a.setKeys()).toHaveLength(1500);
    expect(a.meta('sync.full')).toBe('1');
  });

  test('[limit] a server that returns fewer than 1000 rows a page ends a sync early; the rest arrives on the next syncs', async () => {
    sim.server.maxRows = 100; // a project configured with a lower max rows
    for (let i = 0; i < 250; i++) sim.server.put(A, { kind: 'set', key: `2026-11-01|bench|${i}`, data: { date: '2026-11-01', exId: 'bench', idx: i, weekday: 1, kg: 1, reps: 1, done: 1 }, updated_at: sim.time });
    const a = sim.device('A');
    await a.signIn(A);
    expect(a.setKeys()).toHaveLength(100); // cloud.ts stops when a page has fewer than PAGE rows
    expect(a.meta('sync.full')).toBe('1'); // and still calls the first sync done
    // Each sync re-reads from a little behind the cursor; that only catches up once SETTLE_MS has passed.
    for (let i = 0; i < 4; i++) {
      sim.advance(3 * 60_000);
      await a.sync();
    }
    expect(a.setKeys()).toHaveLength(250);
  });
});

describe('tokens', () => {
  test('the saved session is reused until it is about to expire, then refreshed', async () => {
    const a = sim.device('A');
    await a.signIn(A);
    const calls = () => sim.server.requests.filter((r) => r.call === 'sign-in' || r.call === 'refresh').map((r) => r.call);
    await a.sync();
    expect(calls()).toEqual(['sign-in']);
    sim.advance(3600 * 1000 - 30_000); // 30 s left: inside the 60 s margin
    await a.sync();
    expect(calls()).toEqual(['sign-in', 'refresh']);
  });

  test('refresh refused → a fresh Google sign-in takes its place', async () => {
    const a = sim.device('A');
    await a.signIn(A);
    sim.advance(3600 * 1000);
    sim.server.refreshRevoked = true;
    await a.sync();
    expect(sim.server.requests.filter((r) => r.call === 'sign-in')).toHaveLength(2);
    expect(a.status().state).toBe('saved');
  });

  test('no Google id token → the sync fails, is flagged, and the data stays', async () => {
    const a = sim.device('A');
    await a.signIn(A);
    sim.advance(3600 * 1000);
    sim.server.refreshRevoked = true;
    a.googleFails = true;
    a.setRow('2026-11-01', 'bench', 0);
    await expect(a.sync()).rejects.toThrow('google sign-in failed');
    expect(a.status().state).toBe('failed');
    expect(a.setKeys()).toEqual(['2026-11-01|bench|0']);
    expect(a.dirtyKeys()).toEqual(['set:2026-11-01|bench|0']);
  });

  test('[F13] an access token the server revoked is not replaced until it expires on the phone\'s own clock', async () => {
    const a = sim.device('A');
    await a.signIn(A);
    sim.server.invalidateAccess(); // revoked server-side; the saved session still says it has an hour
    a.setRow('2026-11-01', 'bench', 0);
    await expect(a.sync()).rejects.toThrow();
    await expect(a.sync()).rejects.toThrow(); // still fails: the same token is used again
    expect(sim.server.requests.filter((r) => r.call === 'refresh' || r.call === 'sign-in')).toHaveLength(1);
    sim.advance(3600 * 1000); // only the phone's own clock reaching the expiry recovers it
    await a.sync();
    expect(a.status().state).toBe('saved');
  });
});

describe('concurrent calls and unlinking', () => {
  test('syncCloud called while one is running shares that run and goes once more afterwards', async () => {
    const a = sim.device('A');
    await a.signIn(A);
    const before = sim.server.requests.length;
    const p1 = a.do(() => a.cloud.syncCloud());
    const p2 = a.do(() => a.cloud.syncCloud());
    expect(p2).toBe(p1); // the same run, not a second one in parallel
    await expect(p1).resolves.toBe('ok');
    expect(sim.server.requests.slice(before).filter((r) => r.call === 'pull')).toHaveLength(2); // one run, plus the one repeat the second call asked for
    const after = sim.server.requests.length;
    await a.sync(); // nothing running: a plain single run
    expect(sim.server.requests.slice(after).filter((r) => r.call === 'pull')).toHaveLength(1);
  });

  test('unlinkCloud: sync off, session and cursor cleared; the phone keeps its data and the server keeps its rows', async () => {
    const a = sim.device('A');
    a.setRow('2026-11-01', 'bench', 0);
    await a.signIn(A);
    a.setRow('2026-11-02', 'bench', 0); // not sent yet
    await a.signOut();
    expect(a.track.trackingOn()).toBe(false);
    expect(a.cloud.cloudLinked()).toBe(false);
    for (const k of ['sync.session', 'sync.cursor', 'sync.full']) expect(a.meta(k)).toBeFalsy();
    expect(a.dirtyKeys()).toEqual(["set:2026-11-02|bench|0"]); // unsent changes are kept for the same account
    expect(a.setKeys()).toEqual(['2026-11-01|bench|0', '2026-11-02|bench|0']);
    expect(sim.server.keysOf(A)).toEqual(['set:2026-11-01|bench|0']);
    expect(a.status().state).toBe('off');
  });
});
