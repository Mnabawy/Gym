/// <reference types="jest" />
// Reproductions of the Phase 1 sync audit findings (F1-F13), run against the real sync code and a fake Supabase.
// Every test here pins down what the code does TODAY, including the bad behavior, so that fixing a finding makes its
// test fail on purpose: update that test to the new, safe behavior in the same change. Each test says which finding it
// is and what the safe behavior should be. Nothing here changes production code.
import { deferred, Sim, until } from '../test-utils/syncSim';

let sim: Sim;
beforeEach(() => {
  sim = new Sim();
  sim.install();
});
afterEach(() => sim.uninstall());

const A = 'a@x.test';
const B = 'b@x.test';
const DAY = 86_400_000;
const w = (kg: number) => JSON.stringify([{ date: '2026-11-01', kg }]);
/** The weigh-in of 2026-11-01 on the server (weights sync one row per date). */
const serverKg = (acct = A) => (sim.server.find(acct, 'meta', 'weights/2026-11-01')?.data as { kg: number } | undefined)?.kg;
const task = (id: string) => ({ id, title: `task ${id}` });
const serverSet = (i: number, kg: number, updated_at: number) => ({ kind: 'set', key: `2026-11-01|bench|${i}`, data: { date: '2026-11-01', exId: 'bench', idx: i, weekday: 1, kg, reps: 1, done: 1 }, updated_at });

describe('F1 · conflicts are decided by device clocks', () => {
  test('fixed: a phone whose clock is a day ahead no longer wins over a later real edit on a correct phone', async () => {
    const fast = sim.device('A', { skewMs: DAY });
    const right = sim.device('B');
    await fast.signIn(A);
    await right.signIn(A);
    sim.advance(1000);
    fast.setMeta('weights', w(80)); // really first, stamped one day in the future on the phone
    await fast.sync();
    // Sent stamped at most the server's time (its Date header, + 1 s for rounding) + SKEW_MARGIN_MS, not a day ahead.
    expect(sim.server.find(A, 'meta', 'weights/2026-11-01')!.updated_at).toBeLessThanOrEqual(sim.time + 31_000);
    sim.advance(60_000);
    right.setMeta('weights', w(81)); // really later
    await right.sync();
    expect(right.meta('weights')).toBe(w(81)); // the later edit wins
    expect(serverKg()).toBe(81);
    await fast.sync();
    expect(fast.meta('weights')).toBe(w(81));
  });

  test('a correct clock is never clamped; without a Date header nothing is clamped (the old behavior)', async () => {
    const right = sim.device('R');
    await right.signIn(A);
    sim.advance(1000);
    right.setMeta('weights', w(80));
    const t = sim.time;
    await right.sync();
    expect(sim.server.find(A, 'meta', 'weights/2026-11-01')!.updated_at).toBe(t);
    sim.server.sendDate = false;
    const fast = sim.device('F', { skewMs: DAY });
    await fast.signIn(A);
    sim.advance(1000);
    fast.setMeta('weights', w(82));
    await fast.sync();
    expect(sim.server.find(A, 'meta', 'weights/2026-11-01')!.updated_at).toBe(sim.time + DAY);
  });

  test('clamped before comparing: a server row already stamped ahead (by an older build) is not left different on the phone', async () => {
    const fast = sim.device('F', { skewMs: DAY });
    await fast.signIn(A);
    sim.advance(1000);
    fast.setMeta('weights', w(80)); // stamped a day ahead here
    // Another phone on an older build sent this record stamped an hour ahead.
    sim.server.put(A, { kind: 'meta', key: 'weights/2026-11-01', data: { date: '2026-11-01', kg: 79 }, updated_at: sim.time + 3_600_000 });
    await fast.sync();
    // Clamped to "server now", the pending edit is older than that row: the server's wins on the phone too, nothing is
    // pushed only to be skipped by the server (which would leave the phone and the server different).
    expect(sim.server.skipped).toEqual([]);
    expect(fast.meta('weights')).toBe(w(79));
    expect(serverKg()).toBe(79);
    expect(fast.dirtyKeys()).toEqual([]);
  });

  test('a pending edit stamped in the future is clamped before it is compared with pulled rows', async () => {
    const fast = sim.device('F', { skewMs: DAY });
    const right = sim.device('R');
    await fast.signIn(A);
    await right.signIn(A);
    sim.server.offline.add('F');
    sim.advance(1000);
    fast.setMeta('weights', w(80)); // a day ahead, not sent (offline)
    await expect(fast.sync()).rejects.toThrow();
    sim.server.offline.delete('F');
    sim.advance(10 * 60_000);
    right.setMeta('weights', w(81)); // ten minutes later, sent
    await right.sync();
    sim.advance(10 * 60_000);
    // F's pending edit is stamped "server now + margin" (later than R's), so it is kept and sent: an edit made before a
    // sync but synced late still counts as made at sync time (the clock can't tell when it really was made).
    await fast.sync();
    expect(serverKg()).toBe(80);
    expect(sim.server.find(A, 'meta', 'weights/2026-11-01')!.updated_at).toBeLessThanOrEqual(sim.time + 31_000);
    expect(fast.dirtyKeys()).toEqual([]);
  });

  test('reverse: the fast phone\'s really older edit overwrites the correct phone\'s newer one, so timestamps alone decide', async () => {
    const fast = sim.device('F', { skewMs: DAY });
    const right = sim.device('R');
    await fast.signIn(A);
    await right.signIn(A);
    sim.advance(1000);
    fast.setMeta('weights', w(80)); // really first, stamped a day ahead, not synced yet
    sim.advance(60_000);
    right.setMeta('weights', w(81)); // really later, synced first
    await right.sync();
    expect(serverKg()).toBe(81);
    await fast.sync(); // its dirty stamp (a day ahead) beats the server row, so it is kept and pushed
    expect(fast.meta('weights')).toBe(w(80));
    expect(serverKg()).toBe(80); // the newer real edit is overwritten
    await right.sync();
    expect(right.meta('weights')).toBe(w(80));
    // Still so after the clamp: the fast phone's edit is sent stamped "server now" (it can't know when it was really
    // made), which is after the correct phone's. Only a phone ahead of the server *at sync time* by more than the margin
    // is held back (the test above).
  });

  test('push rejected after the pull: the phone keeps its value for one cycle, the next pull replaces it, its edit is lost', async () => {
    const a = sim.device('A');
    await a.signIn(A);
    a.setMeta('weights', w(81));
    // Another client writes a newer value between this phone's pull and its push.
    sim.server.onRequest = (r) => {
      if (r.call === 'push') {
        sim.server.onRequest = undefined;
        sim.server.put(A, { kind: 'meta', key: 'weights/2026-11-01', data: { date: '2026-11-01', kg: 80 }, updated_at: sim.time + 500 });
      }
    };
    await a.sync();
    expect(sim.server.skipped).toHaveLength(1); // the server skipped the push without telling the phone
    expect(a.dirtyKeys()).toEqual([]); // and the phone considers it sent
    expect(a.meta('weights')).toBe(w(81)); // phone and server differ right now...
    expect(serverKg()).toBe(80);
    await a.sync(); // ...until the next pull brings the server's row
    expect(a.meta('weights')).toBe(w(80)); // converged, but the edit is gone
    // Audit correction: this converges. It is silent loss of one edit, not permanent divergence.
  });
});

describe('F2 · account switching', () => {
  test('sign out without wipe, sign in as another account: the first account\'s data is uploaded to the second', async () => {
    const d = sim.device('A');
    d.setRow('2026-11-01', 'bench', 0);
    d.setMeta('tasks', JSON.stringify([task('t1')]));
    d.setMeta('weights', w(80));
    await d.signIn(A);
    await d.signOut(); // no wipe
    await d.signIn(B);
    expect(sim.server.keysOf(B)).toEqual(['meta:tasks/t1', 'meta:weights/2026-11-01', 'set:2026-11-01|bench|0']);
    expect(sim.server.keysOf(A)).toEqual(sim.server.keysOf(B)); // account A's data is now in account B as well
    // Safe behavior: data that belongs to account A is not uploaded to account B (wipe first, or keep it local-only).
  });

  test('the signed-in account changes under a linked phone: unsent edits for the old account go to the new one', async () => {
    const d = sim.device('A');
    d.setRow('2026-11-01', 'bench', 0);
    await d.signIn(A);
    d.setRow('2026-11-02', 'bench', 0); // not sent to account A yet
    d.signInGoogle(B); // the Google account changed
    await d.act(() => d.cloud.linkCloud()); // what a sign-in does, with a session of another user saved
    expect(sim.server.keysOf(A)).toEqual(['set:2026-11-01|bench|0']); // never reached account A
    expect(sim.server.keysOf(B)).toEqual(['set:2026-11-01|bench|0', 'set:2026-11-02|bench|0']); // whole phone goes to B
  });

  test('server side the accounts stay apart: rows are only readable by their owner', async () => {
    const d1 = sim.device('A');
    const d2 = sim.device('B');
    d1.setRow('2026-11-01', 'bench', 0);
    await d1.signIn(A);
    await d2.signIn(B);
    expect(d2.setKeys()).toEqual([]);
  });
});

describe('F3 · restoring a backup while sync is on', () => {
  test('restoring an older file deletes what another phone added since, on every phone', async () => {
    const a = sim.device('A');
    const e = sim.device('B');
    a.setRow('2026-11-01', 'bench', 0);
    a.setMeta('weights', w(80));
    await a.signIn(A);
    await e.signIn(A);
    const oldFile = a.do(() => a.storage.dump()); // a backup taken now
    sim.advance(DAY);
    e.setRow('2026-11-05', 'squat', 0); // newer work on the other phone
    e.setMeta('weights', w(82));
    await e.sync();
    await a.sync();
    expect(a.setKeys()).toContain('2026-11-05|squat|0');
    sim.advance(DAY);
    await a.act(() => a.restoreMod.applyBackup(oldFile, [])); // restore the older file on A
    await a.sync();
    await e.sync();
    expect(e.setKeys()).toEqual(['2026-11-01|bench|0']); // the other phone lost its newer set
    expect(e.meta('weights')).toBe(w(80)); // and its newer weights
    expect(sim.server.find(A, 'set', '2026-11-05|squat|0')?.deleted).toBe(true);
    // Safe behavior: ask first ("this phone only" or "replace my account too"); never delete newer rows silently.
  });

  test('restoring on a phone before it is signed in is not noted; the first sync then lets the server win', async () => {
    const a = sim.device('A');
    a.setRow('2026-11-01', 'bench', 0, 60);
    await a.signIn(A);
    const b = sim.device('B');
    sim.advance(1000);
    await b.act(() => b.restoreMod.applyBackup({ sets: [{ date: '2026-11-01', weekday: 1, exId: 'bench', idx: 0, kg: 99, reps: 8, done: 1 }], meals: [], shop: [], meta: {} }, []));
    expect(b.dirtyKeys()).toEqual([]);
    await b.signIn(A);
    expect(b.raw.allSets()[0].kg).toBe(60); // the file's value for the same set lost to the server's
  });
});

describe('F4 · first sync and signing back in', () => {
  test('fixed: a new phone\'s own weigh-ins are merged with the server\'s by date, nothing is replaced', async () => {
    const a = sim.device('A');
    a.setMeta('weights', JSON.stringify([{ date: '2026-11-01', kg: 80 }]));
    await a.signIn(A);
    const b = sim.device('B');
    b.setMeta('weights', JSON.stringify([{ date: '2026-06-01', kg: 90 }, { date: '2026-07-01', kg: 88 }])); // months of history
    b.setRow('2026-06-01', 'bench', 0); // per-record data is merged
    await b.signIn(A);
    expect(b.json<{ kg: number }[]>('weights').map((x) => x.kg)).toEqual([90, 88, 80]); // B keeps its history, gets A's
    expect(sim.server.keysOf(A).filter((k) => k.startsWith('meta:weights/'))).toHaveLength(3); // and it went up
    expect(sim.server.keysOf(A)).toContain('set:2026-06-01|bench|0'); // the per-record data survived
    await a.sync();
    expect(a.json<{ kg: number }[]>('weights').map((x) => x.kg)).toEqual([90, 88, 80]);
  });

  test('edits and deletes made while signed out survive signing back in to the same account (log kept after a plain sign-out)', async () => {
    const d = sim.device('A');
    d.setMeta('tasks', JSON.stringify([task('t1'), task('t2')]));
    d.setMeta('weights', w(80));
    await d.signIn(A);
    sim.advance(1000);
    await d.signOut(); // no wipe
    sim.advance(1000);
    d.setMeta('tasks', JSON.stringify([task('t2')])); // t1 deleted while signed out
    d.setMeta('weights', w(75)); // weights corrected while signed out
    d.setRow('2026-11-09', 'bench', 0); // and a new set
    await d.signIn(A);
    expect(d.tasks()).toEqual(['t2']); // the deleted task stays deleted
    expect(d.meta('weights')).toBe(w(75)); // the correction is kept
    expect(serverKg()).toBe(75);
    expect(sim.server.keysOf(A)).not.toContain('meta:tasks/t1');
    expect(sim.server.keysOf(A)).toContain('set:2026-11-09|bench|0'); // new records survive too
    expect(d.dirtyKeys()).toEqual([]);
  });
});

describe('F5 · rev ordering and skipped rows', () => {
  test('fixed: a push that took a rev earlier but committed later is still seen by a phone that already pulled past it', async () => {
    const [pa, pb, pc] = [sim.device('A'), sim.device('B'), sim.device('C')];
    await pa.signIn(A);
    await pb.signIn(A);
    await pc.signIn(A);
    pa.setRow('2026-11-01', 'bench', 0);
    pb.setRow('2026-11-02', 'squat', 0);
    const gate = deferred();
    sim.server.holdCommit = (r) => (r.device === 'A' ? gate.promise : undefined); // A's push is slow to commit
    const slow = pa.sync();
    await until(() => sim.server.requests.some((r) => r.call === 'push' && r.device === 'A'), "A's push");
    await pb.sync(); // B's push takes the next rev and commits first
    await pc.sync(); // C pulls: it sees B's row (the higher rev) and moves its cursor past A's still-uncommitted one
    gate.resolve();
    await slow; // A's row commits now, with the lower rev
    expect(Number(pc.meta('sync.cursor'))).toBeGreaterThan(sim.server.find(A, 'set', '2026-11-01|bench|0')!.rev); // C's cursor is past A's row
    await pc.sync();
    expect(sim.server.keysOf(A)).toContain('set:2026-11-01|bench|0'); // the server has it
    expect(pc.setKeys()).toEqual(['2026-11-01|bench|0', '2026-11-02|squat|0']); // and C gets it: pulls re-read behind the cursor
    const fresh = sim.device('D');
    await fresh.signIn(A);
    expect(fresh.setKeys()).toHaveLength(2);
  });

  test('the late row is still caught when the next sync comes after the re-read window settled', async () => {
    const [pa, pb, pc] = [sim.device('A'), sim.device('B'), sim.device('C')];
    await pa.signIn(A);
    await pb.signIn(A);
    await pc.signIn(A);
    pa.setRow('2026-11-01', 'bench', 0);
    pb.setRow('2026-11-02', 'squat', 0);
    const gate = deferred();
    sim.server.holdCommit = (r) => (r.device === 'A' ? gate.promise : undefined);
    const slow = pa.sync();
    await until(() => sim.server.requests.some((r) => r.call === 'push' && r.device === 'A'), "A's push");
    await pb.sync();
    await pc.sync(); // past A's uncommitted rev
    gate.resolve();
    await slow;
    sim.advance(10 * 60_000); // C's next sync is much later
    await pc.sync();
    expect(pc.setKeys()).toEqual(['2026-11-01|bench|0', '2026-11-02|squat|0']);
    sim.advance(10 * 60_000);
    const n = sim.server.requests.length;
    await pc.sync(); // and after that the window has caught up: nothing is read again
    expect(sim.server.requests.slice(n).filter((r) => r.call === 'pull').map((r) => r.returned)).toEqual([0]);
  });

  test('rows read again are not applied again (no refresh, a newer pending edit here is kept)', async () => {
    const a = sim.device('A');
    const b = sim.device('B');
    await a.signIn(A);
    await b.signIn(A);
    sim.advance(1000);
    a.setRow('2026-11-01', 'bench', 0, 60);
    await a.sync();
    await b.sync(); // gets it
    sim.advance(1000);
    b.setRow('2026-11-01', 'bench', 0, 70); // edited here, not sent yet
    sim.server.offline.add('B');
    await expect(b.sync()).rejects.toThrow();
    sim.server.offline.delete('B');
    const applied = jest.spyOn(b.raw, 'saveSet');
    await b.sync(); // re-reads A's row (same rev): not applied over the pending edit
    expect(applied).not.toHaveBeenCalled();
    expect((sim.server.find(A, 'set', '2026-11-01|bench|0')?.data as { kg: number }).kg).toBe(70);
  });
});

describe('F6 · whole-value keys', () => {
  test('fixed: water logged on two phones on different days: both entries survive, like tasks', async () => {
    const a = sim.device('A');
    const b = sim.device('B');
    await a.signIn(A);
    await b.signIn(A);
    sim.advance(1000);
    a.setMeta('water', JSON.stringify({ '2026-11-01': 500 }));
    a.setMeta('tasks', JSON.stringify([task('ta')]));
    sim.advance(1000);
    b.setMeta('water', JSON.stringify({ '2026-11-02': 300 }));
    b.setMeta('tasks', JSON.stringify([task('tb')]));
    await a.sync();
    await b.sync();
    await a.sync();
    expect(a.json('water')).toEqual({ '2026-11-01': 500, '2026-11-02': 300 }); // both days, on both phones
    expect(b.json('water')).toEqual({ '2026-11-02': 300, '2026-11-01': 500 });
    expect(a.tasks().sort()).toEqual(['ta', 'tb']); // the per-record key kept both edits
    expect(b.tasks().sort()).toEqual(['ta', 'tb']);
  });

  test('steps on the same day from two phones\' Health Connect: the newer reading wins that day (one row per date)', async () => {
    const a = sim.device('A');
    const b = sim.device('B');
    await a.signIn(A);
    await b.signIn(A);
    sim.advance(1000);
    a.setMeta('steps', JSON.stringify({ '2026-11-01': 6000 }));
    sim.advance(1000);
    b.setMeta('steps', JSON.stringify({ '2026-11-01': 1200 }));
    await a.sync();
    await b.sync();
    await a.sync();
    expect(a.json('steps')).toEqual({ '2026-11-01': 1200 });
  });
});

describe('F7 · device-specific settings', () => {
  test('fixed: backup folder, app lock and steps switch stay on the phone that set them; the rest still syncs', async () => {
    const a = sim.device('A');
    const b = sim.device('B');
    await a.signIn(A);
    await b.signIn(A);
    sim.advance(1000);
    a.do(() => a.settings.useSettings.getState().setQuiet({ backupDir: 'content://com.android.externalstorage/tree/primary%3ABackups', appLock: true, stepsSync: true, accent: '#FF9500' }));
    await a.sync();
    await b.sync();
    const s = b.settings.useSettings.getState();
    expect(s.backupDir).toBe(''); // a folder that only exists on A
    expect(s.appLock).toBe(false);
    expect(s.stepsSync).toBe(false);
    expect(s.accent).toBe('#FF9500'); // the rest of the settings still sync
    expect(a.settings.useSettings.getState().appLock).toBe(true);
    expect(JSON.stringify(sim.server.rowsOf(A))).not.toMatch(/backupDir|appLock|stepsSync|content:/);
  });
});

describe('F8 · wiping on sign-out and photos', () => {
  test('sync sends sets, meals, shopping ticks and meta, never photos', async () => {
    const d = sim.device('A');
    d.setRow('2026-11-01', 'bench', 0);
    d.do(() => d.storage.setMealCheck('2026-11-01', 'breakfast', true));
    d.do(() => d.storage.setShopCheck('2026-w44', 'rice', true));
    d.setMeta('weights', w(80));
    d.setMeta('drivePhoto', 'https://example.test/me.jpg'); // the Google profile picture is phone-only meta
    await d.signIn(A);
    const rows = sim.server.rowsOf(A);
    expect(new Set(rows.map((r) => r.kind))).toEqual(new Set(['set', 'meal', 'shop', 'meta']));
    expect(rows.filter((r) => /photo/i.test(r.key) || /jpe?g|base64/i.test(JSON.stringify(r.data)))).toEqual([]);
  });

  test('wipeLocal itself deletes the photos and the unsent changes with no check; the only guard is the account screen', async () => {
    const d = sim.device('A');
    d.setRow('2026-11-01', 'bench', 0);
    await d.signIn(A);
    sim.server.offline.add('A');
    d.setRow('2026-11-02', 'bench', 0); // changed here, never reached the account
    expect(d.dirtyKeys()).toHaveLength(1);
    await d.signOut({ wipe: true }); // what the screen runs once its own checks pass
    expect(d.photos.deleted).toBe(1);
    expect(d.setKeys()).toEqual([]);
    sim.server.offline.delete('A');
    expect(sim.server.keysOf(A)).toEqual(['set:2026-11-01|bench|0']); // the unsent set exists nowhere any more
    // account.tsx:56-58 checks that the sync finished before calling this; photos are only mentioned in its text.
  });

  test('a wipe is not sent as deletes, so the account keeps everything and signing in again brings it back', async () => {
    const d = sim.device('A');
    d.setRow('2026-11-01', 'bench', 0);
    await d.signIn(A);
    await d.signOut({ wipe: true });
    expect(sim.server.keysOf(A)).toEqual(['set:2026-11-01|bench|0']);
    await d.signIn(A);
    expect(d.setKeys()).toEqual(['2026-11-01|bench|0']);
  });
});

describe('F9 · a silent re-sign-in as another account', () => {
  test('fixed: expired session + refused refresh + a different Google account: sync stops, signed out, nothing goes to the other account', async () => {
    const d = sim.device('A');
    d.setRow('2026-11-01', 'bench', 0);
    await d.signIn(A);
    expect(d.meta('sync.uid')).toBe(`user-${A}`);
    d.setRow('2026-11-02', 'bench', 0); // pending, meant for account A
    sim.advance(3600 * 1000);
    sim.server.refreshRevoked = true;
    d.googleAccount = B; // the Google sign-in now hands out account B's token
    await expect(d.sync()).rejects.toThrow('different account');
    expect(sim.server.keysOf(B)).toEqual([]); // nothing went into B
    expect(sim.server.requests.filter((r) => r.email === B && (r.call === 'pull' || r.call === 'push'))).toEqual([]);
    expect(d.cloud.cloudLinked()).toBe(false);
    for (const k of ['sync.session', 'sync.uid', 'driveUser']) expect(d.meta(k)).toBeFalsy();
    expect(d.status().state).toBe('off'); // the account page shows signed out
    expect(d.meta('sync.lastUid')).toBe(`user-${A}`); // the pending edit stays, tied to A
    expect(d.dirtyKeys()).toEqual(['set:2026-11-02|bench|0']);
    await d.keepSynced(); // no automatic re-link to B
    expect(sim.server.keysOf(B)).toEqual([]);
    sim.server.refreshRevoked = false;
    await d.signIn(A); // back to A: the edit made for A is sent there
    expect(sim.server.keysOf(A)).toEqual(['set:2026-11-01|bench|0', 'set:2026-11-02|bench|0']);
  });

  test('a broken saved session counts as not linked everywhere (cloudLinked, sync)', async () => {
    const d = sim.device('A');
    await d.signIn(A);
    d.raw.setMeta('sync.session', '{broken');
    expect(d.cloud.cloudLinked()).toBe(false);
    expect(await d.sync()).toBe('off');
    d.raw.setMeta('sync.session', JSON.stringify({ access: 1 }));
    expect(d.cloud.cloudLinked()).toBe(false);
  });
});

describe('F9 · the old cursor carries over to the new account', () => {
  test('fixed: the switch is stopped before any pull, so no rows of the other account come down; signing in to it on purpose starts over', async () => {
    for (let i = 0; i < 5; i++) sim.server.put(B, serverSet(i, 7, 1)); // account B: revs 1-5
    for (let i = 10; i < 20; i++) sim.server.put(A, serverSet(i, 1, 1)); // account A: revs 6-15
    const d = sim.device('A');
    await d.signIn(A);
    expect(d.meta('sync.cursor')).toBe('15');
    sim.advance(3600 * 1000);
    sim.server.refreshRevoked = true;
    d.googleAccount = B;
    await expect(d.sync()).rejects.toThrow('different account');
    expect(d.setKeys()).toHaveLength(10); // only account A's own sets
    expect(d.meta('sync.cursor')).toBeFalsy(); // cleared with the link
    sim.server.refreshRevoked = false;
    await d.signIn(B); // on purpose, from the account page
    expect(d.setKeys().filter((k) => /bench\|[0-4]$/.test(k))).toHaveLength(5); // all of B's rows, from rev 0
  });
});

describe('F10 · a row the server refuses', () => {
  test('one invalid row fails its whole batch on every sync, so the valid rows next to it never arrive', async () => {
    const a = sim.device('A');
    await a.signIn(A);
    a.setRow('2026-11-01', 'bench', 0);
    a.do(() => {
      const d = a.track.dirty();
      d['bogus:x'] = { t: sim.time, row: { kind: 'bogus' as never, key: 'x', data: null, deleted: false, updated_at: sim.time } };
      a.track.saveDirty();
    });
    await expect(a.sync()).rejects.toThrow();
    await expect(a.sync()).rejects.toThrow();
    expect(sim.server.keysOf(A)).toEqual([]);
    expect(a.status().state).toBe('failed');
    expect(a.dirtyKeys()).toHaveLength(2);
  });
});

describe('F14 · a short page ends the first sync early', () => {
  const seed = (n: number, updated_at: number) => {
    for (let i = 0; i < n; i++) sim.server.put(A, serverSet(i, 1, updated_at));
  };

  test('a local record that also exists on the server beyond page one overwrites the server\'s newer value', async () => {
    const a = sim.device('A');
    a.setRow('2026-11-01', 'bench', 200, 999); // edited long ago, on this phone
    sim.advance(3600 * 1000);
    sim.server.maxRows = 100; // a project configured with fewer than 1000 rows per response
    seed(250, sim.time - 60_000); // the server's copies are newer than the phone's edit
    await a.signIn(A);
    expect(a.meta('sync.full')).toBe('1'); // the first sync says it is complete after one short page
    const row = sim.server.find(A, 'set', '2026-11-01|bench|200');
    expect((row?.data as { kg: number }).kg).toBe(999); // the older local value replaced the newer server value
    expect(row?.updated_at).toBeGreaterThan(sim.time - 60_000);
  });

  test('control: with the default 1000 rows per response the server\'s newer value wins', async () => {
    const a = sim.device('A');
    a.setRow('2026-11-01', 'bench', 200, 999);
    sim.advance(3600 * 1000);
    seed(250, sim.time - 60_000);
    await a.signIn(A);
    expect((sim.server.find(A, 'set', '2026-11-01|bench|200')?.data as { kg: number }).kg).toBe(1);
    expect(a.raw.allSets().find((r) => r.idx === 200)?.kg).toBe(1);
  });
});

describe('F11 · growth', () => {
  test('deleted records stay on the server as rows and every new phone downloads them', async () => {
    const a = sim.device('A');
    a.setRow('2026-11-01', 'bench', 0);
    await a.signIn(A);
    sim.advance(1000);
    a.do(() => a.storage.clearDay('2026-11-01', ['bench']));
    await a.sync();
    expect(sim.server.find(A, 'set', '2026-11-01|bench|0')?.deleted).toBe(true);
    const b = sim.device('B');
    await b.signIn(A);
    const first = sim.server.requests.filter((r) => r.device === 'B' && r.call === 'pull')[0];
    expect(first.returned).toBe(2); // a tombstone, for a set that no longer exists anywhere (and the dataVersion row)
  });

  test('every write saves the whole change log again, so each write costs more than the one before', async () => {
    const a = sim.device('A');
    await a.signIn(A);
    sim.server.offline.add('A');
    const saves: number[] = [];
    const orig = a.raw.setMeta.bind(a.raw);
    jest.spyOn(a.raw, 'setMeta').mockImplementation((k, v) => {
      if (k === 'sync.dirty') saves.push(v.length);
      orig(k, v);
    });
    for (let i = 0; i < 300; i++) a.setRow('2026-11-01', 'bench', i);
    expect(a.dirtyKeys()).toHaveLength(300);
    expect(saves).toHaveLength(300); // one full save per write
    expect(saves[299]).toBeGreaterThan(saves[0] * 100); // the last one rewrites all 300 entries
    expect(saves.every((n, i) => i === 0 || n > saves[i - 1])).toBe(true);
  });
});
