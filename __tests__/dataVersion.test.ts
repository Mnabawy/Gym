/// <reference types="jest" />
// Synced data version (src/lib/dataVersion.ts): a phone on an older build stops sending once a newer build has synced.
import { DATA_VERSION, dataTooNew, readDataVersion, versionToWrite } from '../src/lib/dataVersion';
import { Sim } from '../test-utils/syncSim';

test('reading and comparing versions', () => {
  expect(DATA_VERSION).toBeGreaterThanOrEqual(1);
  expect(readDataVersion(null)).toBe(1);
  expect(readDataVersion('x')).toBe(1);
  expect(readDataVersion('3')).toBe(3);
  expect(dataTooNew('2', 1)).toBe(true);
  expect(dataTooNew('1', 1)).toBe(false);
  expect(dataTooNew(null, 1)).toBe(false);
  expect(versionToWrite(null, 2)).toBe('2');
  expect(versionToWrite('3', 2)).toBeNull();
  expect(versionToWrite(null, 1)).toBeNull(); // version 1 = no value needed
});

describe('two phones on different builds', () => {
  let sim: Sim;
  beforeEach(() => {
    sim = new Sim();
    sim.install();
  });
  afterEach(() => sim.uninstall());

  const task = (id: string) => JSON.stringify([{ id, title: id, due: null, time: null, priority: 3, subs: [], repeat: null, remind: false, done: null, created: '2026-11-01' }]);

  test('a phone with a lower DATA_VERSION pulls a higher one and then sends nothing', async () => {
    const old = sim.device('OLD', { dataVersion: 1 });
    await old.signIn('me@x.test');
    old.setRow('2026-11-01', 'bench', 0);
    await old.sync();
    expect(sim.server.find('me@x.test', 'set', '2026-11-01|bench|0')).toBeTruthy();
    expect(old.status()).toMatchObject({ state: 'saved' });

    sim.advance(1000);
    const fresh = sim.device('NEW', { dataVersion: 2 });
    await fresh.signIn('me@x.test');
    expect(sim.server.find('me@x.test', 'meta', 'dataVersion')).toMatchObject({ data: '2' });
    sim.advance(1000);
    fresh.setMeta('tasks', task('fromNew'));
    await fresh.sync();

    // The old phone keeps working on its own data, but its next sync only pulls.
    sim.advance(1000);
    old.setMeta('weights', JSON.stringify([{ date: '2026-11-02', kg: 80 }]));
    old.setRow('2026-11-02', 'squat', 0);
    const before = sim.server.rowsOf('me@x.test').length;
    await expect(old.sync()).rejects.toThrow(old.cloud.UpdateNeeded);
    expect(old.tasks()).toEqual(['fromNew']); // pulls still apply
    expect(old.meta('dataVersion')).toBe('2');
    expect(sim.server.rowsOf('me@x.test')).toHaveLength(before); // nothing went up
    expect(sim.server.find('me@x.test', 'meta', 'weights')).toBeUndefined();
    expect(old.dirtyKeys()).toEqual(['meta:weights', 'set:2026-11-02|squat|0']); // kept for after the update
    expect(old.status()).toMatchObject({ state: 'failed', reason: 'update' });

    // The automatic sync swallows it and keeps the state; the newer phone is unaffected.
    await old.keepSynced();
    expect(old.status()).toMatchObject({ state: 'failed', reason: 'update' });
    await fresh.sync();
    expect(fresh.status()).toMatchObject({ state: 'saved' });
  });

  test('after updating, the waiting changes go up', async () => {
    const a = sim.device('A', { dataVersion: 2 });
    await a.signIn('me@x.test');
    const b = sim.device('B', { dataVersion: 1 });
    await expect(b.signIn('me@x.test')).rejects.toThrow('update the app');
    b.setRow('2026-11-03', 'row', 0);
    await expect(b.sync()).rejects.toThrow();
    expect(sim.server.find('me@x.test', 'set', '2026-11-03|row|0')).toBeUndefined();

    // Same phone, same storage, updated build: the next sync sends everything that waited.
    const updated = sim.device('B2', { dataVersion: 2 });
    updated.raw.restore(b.raw.dump());
    updated.googleAccount = 'me@x.test';
    await updated.sync();
    expect(sim.server.find('me@x.test', 'set', '2026-11-03|row|0')).toBeTruthy();
    expect(updated.status()).toMatchObject({ state: 'saved' });
  });

  test('a lower value pushed later (a skewed clock) does not unblock an older build', async () => {
    const a = sim.device('A', { dataVersion: 3 });
    await a.signIn('me@x.test');
    const b = sim.device('B', { dataVersion: 2 });
    b.signInGoogle('me@x.test');
    // B wrote its own version before it ever pulled, with a newer time than the server's row.
    sim.advance(1000);
    b.setMeta('dataVersion', '2');
    await expect(b.act(() => b.cloud.linkCloud())).rejects.toThrow('update the app');
    expect(b.meta('dataVersion')).toBe('3');
    expect(sim.server.find('me@x.test', 'meta', 'dataVersion')).toMatchObject({ data: '3' });
  });
});
