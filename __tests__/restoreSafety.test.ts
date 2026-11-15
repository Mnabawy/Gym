/// <reference types="jest" />
// applyBackup and wipeLocal (src/lib/restore.ts) on a simulated phone: they save a safety copy first and stop when it
// cannot be made. The real safetyIO.ts runs on an in-memory file system.
import { parseBackup } from '../src/lib/backup';
import { Sim } from '../test-utils/syncSim';

let sim: Sim;
beforeEach(() => {
  sim = new Sim();
  sim.install();
});
afterEach(() => sim.uninstall());

const file = { sets: [{ date: '2026-10-01', weekday: 1, exId: 'squat', idx: 0, kg: 100, reps: 5, done: 1 }], meals: [], shop: [], meta: {} };

describe('applyBackup', () => {
  test('saves a pre-restore snapshot of what was on the phone, then restores', async () => {
    const d = sim.device('A');
    d.setRow('2026-11-01', 'bench', 0);
    await d.act(() => d.restoreMod.applyBackup(file, []));
    expect(d.setKeys()).toEqual(['2026-10-01|squat|0']);
    const names = d.snapshotFiles();
    expect(names).toHaveLength(1);
    expect(names[0]).toContain('pre-restore');
    const p = parseBackup(await d.act(() => d.safety.readSnapshot(names[0])));
    expect(p.ok && p.data.sets.map((s) => s.exId)).toEqual(['bench']);
  });

  test('without free space nothing is restored and the error is a SafetyError', async () => {
    const d = sim.device('A', { fs: { free: 10 } });
    d.setRow('2026-11-01', 'bench', 0);
    const err = await d.act(() => d.restoreMod.applyBackup(file, [])).catch((e) => e);
    expect(err).toMatchObject({ name: 'SafetyError', code: 'space' }); // each phone loads its own copy of the module, so no instanceof
    expect(d.setKeys()).toEqual(['2026-11-01|bench|0']);
    expect(d.snapshotFiles()).toEqual([]);
  });

  test('works while sync is on, and the restored rows are noted for sync', async () => {
    const d = sim.device('A');
    d.signInGoogle('a@x.test');
    d.setRow('2026-11-01', 'bench', 0);
    await d.act(() => d.cloud.linkCloud());
    await d.act(() => d.restoreMod.applyBackup(file, []));
    expect(d.dirtyKeys()).toEqual(expect.arrayContaining(['set:2026-10-01|squat|0']));
    expect(d.snapshotFiles().some((n) => n.includes('pre-restore'))).toBe(true);
  });
});

describe('wipeLocal', () => {
  test('takes a pre-wipe snapshot, moves the photos to recovery, then wipes', async () => {
    const d = sim.device('A');
    d.setRow('2026-11-01', 'bench', 0);
    d.addPhoto('2026-11-01_1.jpg');
    await d.signOut({ wipe: true });
    expect(d.setKeys()).toEqual([]);
    expect(d.snapshotFiles().some((n) => n.includes('pre-wipe'))).toBe(true);
    expect(d.photoNames()).toEqual([]);
    expect(d.recoveryFolders()).toHaveLength(1);
  });

  test('when the snapshot fails nothing is wiped and the photos stay', async () => {
    const d = sim.device('A', { fs: { free: 10 } });
    d.setRow('2026-11-01', 'bench', 0);
    d.addPhoto('2026-11-01_1.jpg');
    const err = await d.signOut({ wipe: true }).catch((e) => e);
    expect(err).toMatchObject({ name: 'SafetyError', code: 'space' }); // each phone loads its own copy of the module, so no instanceof
    expect(d.setKeys()).toEqual(['2026-11-01|bench|0']);
    expect(d.photoNames()).toEqual(['2026-11-01_1.jpg']);
    expect(d.recoveryFolders()).toEqual([]);
  });
});

describe('empty phone and best-effort steps', () => {
  test('restoring onto an empty phone needs no snapshot, so no space is needed', async () => {
    const d = sim.device('A', { fs: { free: 10 } });
    await d.act(() => d.restoreMod.applyBackup(file, []));
    expect(d.setKeys()).toEqual(['2026-10-01|squat|0']);
    expect(d.snapshotFiles()).toEqual([]);
  });

  test('wiping an empty phone makes no snapshot and does not fail without space', async () => {
    const d = sim.device('A', { fs: { free: 10 } });
    await d.signOut({ wipe: true });
    expect(d.snapshotFiles()).toEqual([]);
  });

  test('a failure of the last recovery note after the wipe does not throw, so sign-out goes on', async () => {
    const d = sim.device('A');
    d.setRow('2026-11-01', 'bench', 0);
    d.addPhoto('2026-11-01_1.jpg');
    // Only the note written after the data is gone fails (the earlier ones, while moving the photos, work).
    d.fs.hook = (op, path) => {
      if (op === 'write' && path.endsWith('manifest.json') && d.setKeys().length === 0) throw new Error('injected');
    };
    await expect(d.signOut({ wipe: true })).resolves.toBeUndefined();
    expect(d.setKeys()).toEqual([]);
    expect(d.status().state).toBe('off');
  });
});

describe('first sync', () => {
  test('saves a first-sync snapshot of the phone before pulling', async () => {
    const a = sim.device('A');
    a.setRow('2026-11-01', 'bench', 0);
    await a.signIn('a@x.test');
    expect(a.snapshotFiles().some((n) => n.includes('first-sync'))).toBe(true);
  });

  test('without a snapshot the first sync does not run and the phone is untouched', async () => {
    const a = sim.device('A', { fs: { free: 10 } });
    a.setRow('2026-11-01', 'bench', 0);
    const err = await a.signIn('a@x.test').catch((e) => e);
    expect(err).toMatchObject({ name: 'SafetyError', code: 'space' }); // each phone loads its own copy of the module, so no instanceof
    expect(a.setKeys()).toEqual(['2026-11-01|bench|0']);
    expect(a.status().state).toBe('off');
  });

  test('keepSynced records a failed safety copy, so the status shows failed instead of staying silent', async () => {
    const a = sim.device('A', { fs: { free: 10 } });
    a.setRow('2026-11-01', 'bench', 0);
    a.signInGoogle('a@x.test');
    await expect(a.keepSynced()).resolves.toBeUndefined();
    expect(a.status().state).toBe('failed');
    expect(a.setKeys()).toEqual(['2026-11-01|bench|0']);
  });
});
