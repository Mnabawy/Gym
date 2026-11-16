/// <reference types="jest" />
// A plain sign-out must not lose changes that were not sent yet.
import { Sim } from '../test-utils/syncSim';

let sim: Sim;
beforeEach(() => {
  sim = new Sim();
  sim.install();
});
afterEach(() => sim.uninstall());

const A = 'a@x.test';
const B = 'b@x.test';
const w = (kg: number) => JSON.stringify([{ date: '2026-11-01', kg }]);
/** The weigh-in on the server (weights sync one row per date). */
const onServer = (acct: string) => (sim.server.find(acct, 'meta', 'weights/2026-11-01')?.data as { kg: number } | undefined)?.kg;

test('sign-out with unsent changes keeps them in the change log', async () => {
  const p = sim.device('P');
  await p.signIn(A);
  sim.advance(1000);
  p.setMeta('weights', w(80));
  expect(p.dirtyKeys().length).toBeGreaterThan(0);
  await p.signOut();
  expect(p.dirtyKeys()).toContain('meta:weights/2026-11-01');
});

test('signing back in to the same account sends them; the older server value does not win', async () => {
  const p = sim.device('P');
  const q = sim.device('Q');
  await p.signIn(A);
  p.setMeta('weights', w(70));
  await p.sync();
  await q.signIn(A);
  sim.advance(1000);
  p.setMeta('weights', w(80)); // newer than the server's 70, never sent
  await p.signOut();
  sim.advance(1000);
  await p.signIn(A);
  expect(p.meta('weights')).toBe(w(80));
  expect(onServer(A)).toBe(80);
  await q.sync();
  expect(q.meta('weights')).toBe(w(80));
  expect(p.dirtyKeys()).toEqual([]);
});

test('a different account drops the old account\'s unsent changes', async () => {
  const p = sim.device('P');
  await p.signIn(A);
  sim.advance(1000);
  p.setMeta('weights', w(80));
  await p.signOut();
  await p.signIn(B);
  expect(onServer(B)).toBe(80); // phone-only data goes up on first sync
  expect(onServer(A)).toBeUndefined();
  expect(p.dirtyKeys()).toEqual([]);
});

test('edits and deletes made while signed out (with a kept log) survive signing back in and reach another phone', async () => {
  const p = sim.device('P');
  const q = sim.device('Q');
  await p.signIn(A);
  p.setRow('2026-11-01', 'bench', 0);
  p.setMeta('weights', w(80));
  await p.sync();
  await q.signIn(A);
  expect(q.setKeys()).toEqual(['2026-11-01|bench|0']);
  sim.advance(1000);
  p.setMeta('tasks', JSON.stringify([])); // unsent at sign-out: the log is kept
  p.setMeta('notes', JSON.stringify({ bench: 'x' }));
  await p.signOut();
  expect(p.cloud.cloudLinked()).toBe(false);
  sim.advance(1000);
  p.setMeta('weights', w(90)); // existing key changed while signed out
  p.do(() => p.storage.clearDay('2026-11-01', ['bench'])); // existing set deleted while signed out
  expect(p.dirtyKeys()).toEqual(expect.arrayContaining(['meta:weights/2026-11-01', 'set:2026-11-01|bench|0']));
  expect(await p.sync()).toBe('off'); // still off: nothing is sent while signed out
  sim.advance(1000);
  await p.signIn(A);
  expect(p.meta('weights')).toBe(w(90));
  expect(p.setKeys()).toEqual([]);
  expect(onServer(A)).toBe(90);
  expect(p.dirtyKeys()).toEqual([]);
  await q.sync();
  expect(q.meta('weights')).toBe(w(90));
  expect(q.setKeys()).toEqual([]);
});

test('a backup put back while signed out drops the kept log and the account it was for', async () => {
  const p = sim.device('P');
  await p.signIn(A);
  sim.advance(1000);
  p.setMeta('weights', w(80));
  await p.signOut();
  expect(p.meta('sync.lastUid')).toBeTruthy();
  const file = { sets: [{ date: '2026-10-01', weekday: 1, exId: 'squat', idx: 0, kg: 100, reps: 5, done: 1 }], meals: [], shop: [], meta: {} };
  await p.act(() => p.restoreMod.applyBackup(file, []));
  expect(p.dirtyKeys()).toEqual([]);
  expect(p.meta('sync.lastUid')).toBeFalsy();
  p.setMeta('notes', JSON.stringify({ bench: 'x' }));
  expect(p.dirtyKeys()).toEqual([]); // no longer noting writes
});

test('a sign-out with nothing unsent still keeps noting writes for the same account; a wipe sign-out does not', async () => {
  const p = sim.device('P');
  await p.signIn(A);
  p.setMeta('weights', w(80));
  await p.sync();
  await p.signOut();
  expect(p.meta('sync.lastUid')).toBeTruthy();
  sim.advance(1000);
  p.setMeta('weights', w(90));
  sim.advance(1000);
  await p.signIn(A);
  expect(p.meta('weights')).toBe(w(90));
  expect(onServer(A)).toBe(90);
  await p.signOut({ wipe: true });
  expect(p.meta('sync.lastUid')).toBeFalsy();
  p.setMeta('weights', w(95));
  expect(p.dirtyKeys()).toEqual([]);
});
