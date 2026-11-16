/// <reference types="jest" />
// Sync hardening: a broken cursor, the pull window, applying many records of one key, the push acknowledgement of an
// entry sent as several rows, the change log and its transaction, and restore's transaction. Real sync code, fake
// Supabase (test-utils/syncSim.ts). Clock skew and late commits: cloudRisks.test.ts (F1, F5).
import { ackBatch, advanceWindow, applyRows, emptyWindow, OVERLAP_REVS, readCursor, readWindow, rowsPerEntry, SETTLE_MS, type Dirty, type Pulled, type Target } from '../src/lib/cloudSync';
import { Sim } from '../test-utils/syncSim';

let sim: Sim;
beforeEach(() => {
  sim = new Sim();
  sim.install();
});
afterEach(() => sim.uninstall());

const A = 'a@x.test';
const set = (i: number, kg: number, updated_at: number) => ({ kind: 'set', key: `2026-11-01|bench|${i}`, data: { date: '2026-11-01', exId: 'bench', idx: i, weekday: 1, kg, reps: 1, done: 1 }, updated_at });

describe('a broken cursor', () => {
  test('readCursor: only a whole number ≥ 0 counts; anything else is 0', () => {
    expect(readCursor('42')).toBe(42);
    for (const x of [null, undefined, '', 'NaN', 'abc', '-3', '1.5', '1e3', '99999999999999999999']) expect(readCursor(x)).toBe(0);
  });

  test('a garbage sync.cursor no longer fails every sync: it pulls everything again and saves a good cursor', async () => {
    const a = sim.device('A');
    for (let i = 0; i < 3; i++) sim.server.put(A, set(i, 1, sim.time));
    await a.signIn(A);
    a.raw.setMeta('sync.cursor', 'NaN');
    sim.server.put(A, set(3, 1, sim.time));
    const n = sim.server.requests.length;
    await a.sync();
    expect(sim.server.requests.slice(n).find((r) => r.call === 'pull')?.since).toBe(0);
    expect(a.setKeys()).toHaveLength(4);
    expect(a.meta('sync.cursor')).toBe(String(sim.server.rev));
    expect(a.status().state).toBe('saved');
  });

  test('the fake server, like PostgREST, refuses rev=gt.NaN', async () => {
    const a = sim.device('A');
    await a.signIn(A);
    const access = JSON.parse(String(a.meta('sync.session'))).access as string;
    const res = await sim.server.fetch('https://x.test/rest/v1/rows?rev=gt.NaN&limit=1', { headers: { Authorization: `Bearer ${access}` } });
    expect(res.status).toBe(400);
  });

  test('a broken sync.window is replaced (re-reads the last OVERLAP_REVS once)', () => {
    expect(readWindow('{oops', 5000)).toEqual({ safe: 5000 - OVERLAP_REVS, marks: [], revs: [] });
    expect(readWindow(JSON.stringify({ safe: 9000, marks: [], revs: [] }), 5000).safe).toBe(5000 - OVERLAP_REVS); // past the cursor
    expect(readWindow(JSON.stringify({ safe: 10, marks: [[1, 20], ['x', 1]], revs: [5, 11, 30, 'y'] }), 25)).toEqual({ safe: 10, marks: [[1, 20]], revs: [11] });
  });
});

describe('the pull window', () => {
  test('safe moves to a cursor seen SETTLE_MS before the pull started, never past what was read, never more than OVERLAP_REVS behind', () => {
    let w = advanceWindow(emptyWindow(), [1, 2, 3], { cursor: 3, covered: 3, at: 1000, start: 900 });
    expect(w.safe).toBe(0); // nothing settled yet
    expect(w.revs).toEqual([1, 2, 3]);
    w = advanceWindow(w, [4], { cursor: 4, covered: 4, at: 1000 + SETTLE_MS + 10, start: 1000 + SETTLE_MS });
    expect(w.safe).toBe(3); // the cursor seen at 1000 is settled
    expect(w.revs).toEqual([4]);
    expect(advanceWindow(emptyWindow(), [], { cursor: 5000, covered: 5000, at: 1, start: 0 }).safe).toBe(5000 - OVERLAP_REVS);
    // A mark above what this pull has read so far only moves safe up to that point.
    const m = { safe: 0, marks: [[0, 50]] as [number, number][], revs: [] };
    expect(advanceWindow(m, [10], { cursor: 50, covered: 10, at: SETTLE_MS * 2, start: SETTLE_MS * 2 }).safe).toBe(10);
  });
});

describe('applying many records of one key', () => {
  test('a key\'s value is read and written once per batch, not once per record (no O(n²) first sync)', () => {
    const meta: Record<string, string> = {};
    const writes: string[] = [];
    const s: Target = {
      saveSet: () => undefined,
      deleteSet: () => undefined,
      setMealCheck: () => undefined,
      setShopCheck: () => undefined,
      getMeta: (k) => meta[k] ?? null,
      setMeta: (k, v) => {
        writes.push(k);
        meta[k] = v;
      },
    };
    const rows: Pulled[] = [];
    for (let i = 0; i < 3000; i++) rows.push({ kind: 'meta', key: `habitLog/h1|day${i}`, data: 'done', deleted: false, updated_at: 1, rev: i + 1 });
    rows.push({ kind: 'meta', key: 'habitLog/h1|day5', data: null, deleted: true, updated_at: 2, rev: 3001 }); // a delete in the same batch
    rows.push({ kind: 'meta', key: 'habitLog', data: JSON.stringify({ 'h1|old': 'done', 'h1|day5': 'done' }), deleted: false, updated_at: 3, rev: 3002 }); // an older build's whole value
    const r = applyRows(rows, {}, s);
    expect(writes.filter((k) => k === 'habitLog')).toHaveLength(1);
    const v = JSON.parse(meta.habitLog) as Record<string, string>;
    expect(Object.keys(v)).toHaveLength(3000); // 3000 - day5 (deleted) + old (added by the whole value)
    expect(v['h1|day5']).toBeUndefined(); // the delete is remembered (tombs), the whole value can't bring it back
    expect(v['h1|old']).toBe('done');
    expect(r.meta).toEqual(['habitLog']);
    expect(writes.filter((k) => k === 'sync.tombs')).toHaveLength(1);
  });

  test('first sync of a large split key on a phone: one write of the key per page', async () => {
    for (let i = 0; i < 2500; i++) sim.server.put(A, { kind: 'meta', key: `habitLog/h1|d${i}`, data: 'done', updated_at: sim.time });
    const a = sim.device('A');
    const spy = jest.spyOn(a.raw, 'setMeta');
    await a.signIn(A);
    expect(spy.mock.calls.filter(([k]) => k === 'habitLog').length).toBeLessThanOrEqual(3);
    expect(Object.keys(a.json<Record<string, string>>('habitLog'))).toHaveLength(2500);
  });
});

describe('push acknowledgement', () => {
  test('an entry that goes as several rows is dropped only once its last row was accepted', () => {
    const d: Dirty = { 'meta:water': { t: 5 }, 'set:x': { t: 7 } };
    const items = [{ id: 'meta:water', t: 5 }, { id: 'set:x', t: 7 }, { id: 'meta:water', t: 5 }, { id: 'meta:water', t: 5 }];
    const left = rowsPerEntry(items);
    ackBatch(d, items.slice(0, 2), left); // first batch accepted
    expect(Object.keys(d)).toEqual(['meta:water']); // still has rows unsent: kept, in case a later batch fails
    ackBatch(d, items.slice(2), left);
    expect(d).toEqual({});
  });

  test('an entry edited again meanwhile stays', () => {
    const d: Dirty = { 'set:x': { t: 9 } };
    ackBatch(d, [{ id: 'set:x', t: 7 }], rowsPerEntry([{ id: 'set:x' }]));
    expect(d).toEqual({ 'set:x': { t: 9 } });
  });
});

describe('the change log and the pull transaction', () => {
  test('a transaction that fails leaves the log in memory as it was (nothing dropped), and the next sync settles it', async () => {
    const a = sim.device('A');
    const b = sim.device('B');
    await a.signIn(A);
    await b.signIn(A);
    sim.advance(1000);
    b.setRow('2026-11-01', 'bench', 0, 70); // pending on B, older
    sim.server.offline.add('B');
    await expect(b.sync()).rejects.toThrow();
    sim.server.offline.delete('B');
    sim.advance(1000);
    a.setRow('2026-11-01', 'bench', 0, 80); // newer, on the server: B's pull would drop B's entry
    await a.sync();
    // B's transaction fails after applying (a full disk, say): SQLite rolls it back.
    const real = b.raw.transaction.bind(b.raw);
    const spy = jest.spyOn(b.raw, 'transaction').mockImplementationOnce((f) => {
      const before = b.raw.dump();
      real(f);
      b.raw.restore(before); // rolled back
      throw new Error('disk full');
    });
    await expect(b.sync()).rejects.toThrow('disk full');
    expect(b.dirtyKeys()).toEqual(['set:2026-11-01|bench|0']); // in memory: unchanged
    expect(JSON.parse(String(b.meta('sync.dirty')))['set:2026-11-01|bench|0']).toBeTruthy(); // and on disk
    spy.mockRestore();
    await b.sync();
    expect(b.raw.allSets()[0].kg).toBe(80); // then the newer edit wins as usual
    expect(b.dirtyKeys()).toEqual([]);
  });
});

describe('restore and its transaction', () => {
  test('the account keys and the phone\'s sync keys go in with the backup\'s data, in one restore (no writes after it)', async () => {
    const a = sim.device('A');
    a.setRow('2026-11-01', 'bench', 0);
    await a.signIn(A);
    sim.advance(1000);
    a.setRow('2026-11-02', 'bench', 0); // pending
    const file = { sets: [{ date: '2026-10-01', weekday: 1, exId: 'squat', idx: 0, kg: 100, reps: 5, done: 1 }], meals: [], shop: [], meta: { 'sync.session': 'from the file', driveUser: 'someone else' } };
    const real = { restore: a.raw.restore.bind(a.raw), setMeta: a.raw.setMeta.bind(a.raw) };
    let restored = false;
    const after: string[] = [];
    const spy = jest.spyOn(a.raw, 'restore').mockImplementation((d) => {
      real.restore(d);
      restored = true;
    });
    jest.spyOn(a.raw, 'setMeta').mockImplementation((k, v) => {
      if (restored) after.push(k);
      real.setMeta(k, v);
    });
    await a.act(() => a.restoreMod.applyBackup(file, []));
    expect(spy).toHaveBeenCalledTimes(1);
    const meta = spy.mock.calls[0][0].meta;
    expect(meta.driveUser).toBe(A); // the phone's account, not the file's
    expect(JSON.parse(meta['sync.session']).email).toBe(A); // the phone's session, not the file's
    expect(meta['sync.on']).toBe('1');
    // The restore is noted in the same write: the old sets as deletes, the file's as new.
    const log = JSON.parse(meta['sync.dirty']) as Dirty;
    expect(Object.keys(log).sort()).toEqual(['meta:dataVersion', 'set:2026-10-01|squat|0', 'set:2026-11-01|bench|0', 'set:2026-11-02|bench|0']);
    expect(a.dirtyKeys()).toEqual(Object.keys(log).sort()); // memory matches what was written
    expect(after.filter((k) => k.startsWith('sync.') || ['driveUser', 'driveName', 'drivePhoto', 'welcomeDone', 'device'].includes(k))).toEqual([]);
    await a.sync();
    expect(sim.server.keysOf(A)).toEqual(['set:2026-10-01|squat|0']);
  });
});

describe('clock offset and clamping', () => {
  test('a slow pull reply does not backdate what a correct phone sends', async () => {
    const a = sim.device('A');
    await a.signIn(A);
    sim.advance(1000);
    let editedAt = 0;
    sim.server.afterReply = (r) => {
      if (r.device !== 'A') return;
      sim.server.afterReply = undefined;
      sim.advance(40_000); // the reply takes 40 s to arrive (Date header stamped at its start)
      a.setRow('2026-11-01', 'bench', 0, 90); // an edit made meanwhile, stamped with the correct clock
      editedAt = sim.time;
    };
    await a.sync();
    expect(sim.server.find(A, 'set', '2026-11-01|bench|0')?.updated_at).toBe(editedAt); // not clamped into the past
  });

  test('a fast clock and an older build\'s whole-key edit: the clamp keeps the edit (settleWhole still sees it)', async () => {
    const fast = sim.device('F', { skewMs: 3_600_000 });
    await fast.signIn(A);
    sim.advance(1000);
    // Another phone sent an older value of that weigh-in (pulled below, overwriting the record here).
    sim.server.put(A, { kind: 'meta', key: 'weights/2026-11-01', data: { date: '2026-11-01', kg: 79 }, updated_at: sim.time - 500 });
    fast.raw.setMeta('weights', JSON.stringify([{ date: '2026-11-01', kg: 80 }]));
    fast.do(() => {
      const d = fast.track.dirty();
      d['meta:weights'] = { t: Date.now() }; // noted as a whole by an older build, an hour ahead
      fast.track.saveDirty();
    });
    await fast.sync();
    expect(fast.meta('weights')).toBe(JSON.stringify([{ date: '2026-11-01', kg: 80 }])); // the edit is kept here
    expect((sim.server.find(A, 'meta', 'weights/2026-11-01')?.data as { kg: number }).kg).toBe(80); // and sent
    expect(sim.server.find(A, 'meta', 'weights/2026-11-01')!.updated_at).toBeLessThanOrEqual(sim.time + 31_000); // clamped
    expect(fast.dirtyKeys()).toEqual([]);
  });
});
