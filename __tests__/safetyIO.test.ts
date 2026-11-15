/// <reference types="jest" />
// The real src/lib/safetyIO.ts running on an in-memory file system (test-utils/fakeFs.ts).
import { parseBackup } from '../src/lib/backup';
import { dumpHash, parseManifest, parseSnapshotName, type SafetyError } from '../src/lib/safety';
import type { Dump } from '../src/lib/storage.types';
import { createFakeFs, loadSafetyIO, type FakeFs } from '../test-utils/fakeFs';

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;
const dump = (kg = 60): Dump => ({
  sets: [{ date: '2026-11-01', weekday: 1, exId: 'bench', idx: 0, kg, reps: 8, done: 1 }],
  meals: [{ date: '2026-11-01', meal: 'breakfast' }],
  shop: [],
  meta: { weights: '[{"date":"2026-11-01","kg":80}]' },
});
const P = (i: number) => `2026-11-0${i}_${i}.jpg`;

let fs: FakeFs;
let io: ReturnType<typeof loadSafetyIO>;
const setup = (opts?: Parameters<typeof createFakeFs>[0]) => {
  fs = createFakeFs(opts);
  io = loadSafetyIO(fs);
};
beforeEach(() => setup());

const snapDir = () => fs.doc('backups', 'safety');
const photosDir = () => fs.doc('photos');
const recDir = () => fs.doc('recovery');
const seedPhotos = (n: number) => {
  for (let i = 1; i <= n; i++) fs.put(fs.doc('photos', P(i)), `bytes-${i}`);
};
const photoContents = () => Object.fromEntries(fs.names(photosDir()).map((n) => [n, fs.read(fs.doc('photos', n))]));
const failing = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e as SafetyError;
  }
  throw new Error('expected a failure');
};
/** Throws from the hook on the n-th and every later operation of this kind. */
const failFrom = (op: string, n: number, only?: (path: string) => boolean) => {
  let count = 0;
  fs.hook = (o, path) => {
    if (o === op && (!only || only(path)) && ++count >= n) throw new Error(`injected ${op} failure`);
  };
};

describe('snapshots', () => {
  test('a verified backup file appears in backups/safety, nothing temporary is left, and the app can read it back', async () => {
    const r = await io.createSnapshot('first-sync', dump(), NOW);
    expect(r.reused).toBe(false);
    expect(fs.names(snapDir())).toEqual([r.name]);
    expect(parseSnapshotName(r.name)).toMatchObject({ reason: 'first-sync', at: NOW, hash: dumpHash(dump()) });
    const parsed = parseBackup(String(fs.read(fs.doc('backups', 'safety', r.name))));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(dumpHash(parsed.data)).toBe(dumpHash(dump())); // exactly what applyBackup would put back
    expect(await io.readSnapshot(r.name)).toBe(fs.read(fs.doc('backups', 'safety', r.name)));
  });

  test('the same reason and data reuses the file; another reason or other data makes a new one', async () => {
    const a = await io.createSnapshot('first-sync', dump(), NOW);
    const b = await io.createSnapshot('first-sync', dump(), NOW + 1000);
    expect(b.reused).toBe(true);
    expect(parseSnapshotName(b.name)).toMatchObject({ reason: 'first-sync', at: NOW + 1000, hash: dumpHash(dump()) }); // restamped, same data
    expect(fs.names(snapDir())).toHaveLength(1);
    await io.createSnapshot('pre-restore', dump(), NOW + 2000);
    await io.createSnapshot('first-sync', dump(61), NOW + 3000);
    expect(fs.names(snapDir())).toHaveLength(3);
  });

  test('two requests at the same time for the same data make one file', async () => {
    const [a, b] = await Promise.all([io.createSnapshot('first-sync', dump(), NOW), io.createSnapshot('first-sync', dump(), NOW)]);
    expect(fs.names(snapDir())).toHaveLength(1);
    expect([a.reused, b.reused].sort()).toEqual([false, true]);
  });

  test('not enough free space: SafetyError "space", no file, no temporary file', async () => {
    fs.free = 1000;
    const e = await failing(io.createSnapshot('pre-restore', dump(), NOW));
    expect(e.name).toBe('SafetyError'); // not instanceof: the module under test has its own copy of the class
    expect(e.code).toBe('space');
    expect(fs.names(snapDir())).toEqual([]);
  });

  test('the disk fills up while writing: "space", and the temporary file is removed', async () => {
    fs.hook = (op, path) => {
      if (op === 'write' && path.endsWith('.tmp')) throw new Error('ENOSPC: no space left on device');
    };
    const e = await failing(io.createSnapshot('first-sync', dump(), NOW));
    expect(e.code).toBe('space');
    expect(fs.names(snapDir())).toEqual([]);
  });

  test('any other write failure: "io", nothing left behind', async () => {
    fs.hook = (op, path) => {
      if (op === 'create' && path.endsWith('.tmp')) throw new Error('EACCES');
    };
    const e = await failing(io.createSnapshot('first-sync', dump(), NOW));
    expect(e.code).toBe('io');
    expect(fs.names(snapDir())).toEqual([]);
  });

  test('a torn or altered write is caught by reading it back: "verify", no final file', async () => {
    fs.transformWrite = (p, t) => (p.endsWith('.tmp') ? t.slice(0, Math.floor(t.length / 2)) : t);
    expect((await failing(io.createSnapshot('first-sync', dump(), NOW))).code).toBe('verify');
    expect(fs.names(snapDir())).toEqual([]);
    fs.transformWrite = (p, t) => (p.endsWith('.tmp') ? t.replace('"kg":60', '"kg":61') : t); // valid JSON, wrong value
    expect((await failing(io.createSnapshot('first-sync', dump(), NOW))).code).toBe('verify');
    expect(fs.names(snapDir())).toEqual([]);
  });

  test('the folder cannot be opened: "io"', async () => {
    fs.hook = (op, path) => {
      if (op === 'create' && path.endsWith('/safety')) throw new Error('EACCES');
    };
    expect((await failing(io.createSnapshot('first-sync', dump(), NOW))).code).toBe('io');
  });

  test('a temporary file left by an interrupted run is deleted by the next call and is never listed; other files are left alone', async () => {
    const stale = fs.doc('backups', 'safety', `gym-safety-first-sync-${NOW - DAY}-0123456789abcdef.json.tmp`);
    fs.put(stale, '{"half');
    fs.put(fs.doc('backups', 'safety', 'notes.txt'), 'mine');
    expect(io.listSnapshots()).toEqual([]);
    const r = await io.createSnapshot('first-sync', dump(), NOW);
    expect(fs.has(stale)).toBe(false);
    expect(fs.names(snapDir())).toEqual(['notes.txt', r.name].sort());
    expect(io.listSnapshots().map((s) => s.name)).toEqual([r.name]);
  });

  test('retention: 7 spread over months leave the newest 5; 7 within a day all stay', async () => {
    for (let i = 0; i < 7; i++) await io.createSnapshot('first-sync', dump(60 + i), NOW + i * 20 * DAY);
    expect(io.listSnapshots()).toHaveLength(5);
    expect(io.listSnapshots().map((s) => s.at)).toEqual([6, 5, 4, 3, 2].map((i) => NOW + i * 20 * DAY));
    setup();
    for (let i = 0; i < 7; i++) await io.createSnapshot('first-sync', dump(60 + i), NOW + i * 3_600_000);
    expect(io.listSnapshots()).toHaveLength(7);
  });

  test('a pre-wipe snapshot is kept 30 days', async () => {
    await io.createSnapshot('pre-wipe', dump(60), NOW);
    await io.createSnapshot('pre-wipe', dump(61), NOW + 29 * DAY);
    expect(io.listSnapshots()).toHaveLength(2);
    await io.createSnapshot('pre-wipe', dump(62), NOW + 31 * DAY);
    expect(io.listSnapshots().map((s) => s.at)).toEqual([NOW + 31 * DAY, NOW + 29 * DAY]);
  });

  test('a failure while cleaning up never fails a snapshot that was saved', async () => {
    for (let i = 0; i < 3; i++) await io.createSnapshot('first-sync', dump(60 + i), NOW + i * 20 * DAY);
    fs.hook = (op) => {
      if (op === 'delete') throw new Error('EBUSY');
    };
    await expect(io.createSnapshot('first-sync', dump(70), NOW + 100 * DAY)).resolves.toMatchObject({ reused: false });
    expect(io.listSnapshots().length).toBeGreaterThan(0);
  });

  test('readSnapshot only reads real snapshot names', async () => {
    fs.put(fs.doc('backups', 'gym-auto-2026-01-01.json'), 'x');
    for (const bad of ['../gym-auto-2026-01-01.json', 'gym-auto-2026-01-01.json', 'notes.txt', '']) expect((await failing(io.readSnapshot(bad))).code).toBe('io');
  });

  test('listSnapshots is newest first and ignores weekly backups and other files', async () => {
    fs.put(fs.doc('backups', 'gym-auto-2026-01-01.json'), 'x');
    fs.put(fs.doc('backups', 'safety', 'readme.txt'), 'x');
    const a = await io.createSnapshot('pre-restore', dump(60), NOW);
    const b = await io.createSnapshot('first-sync', dump(61), NOW + 1000);
    expect(io.listSnapshots().map((s) => s.name)).toEqual([b.name, a.name]);
  });
});

describe('moving progress photos aside', () => {
  test('every photo moves into a recovery folder, with a manifest in state "ready"; nothing is deleted', async () => {
    seedPhotos(3);
    const before = photoContents();
    const r = await io.movePhotosToRecovery(NOW);
    expect(r).toEqual({ id: `photos-${NOW}`, count: 3 });
    expect(fs.names(photosDir())).toEqual([]);
    expect(fs.names(fs.doc('recovery', r.id))).toEqual([...Object.keys(before), 'manifest.json'].sort());
    for (const [n, text] of Object.entries(before)) expect(fs.read(fs.doc('recovery', r.id, n))).toBe(text); // same bytes
    expect(parseManifest(fs.read(fs.doc('recovery', r.id, 'manifest.json')))).toEqual({ v: 1, state: 'ready', names: Object.keys(before) });
    expect(await io.listRecoveries()).toEqual([{ id: r.id, createdAt: NOW, state: 'ready', count: 3 }]);
  });

  test('no photos: nothing happens and no folder is made', async () => {
    expect(await io.movePhotosToRecovery(NOW)).toEqual({ id: '', count: 0 });
    expect(fs.names(recDir())).toEqual([]);
  });

  test('a failure half way puts the moved photos back and nothing is left in the recovery folder', async () => {
    seedPhotos(5);
    const before = photoContents();
    failFrom('move', 3, (p) => p.includes('/photos/')); // the 3rd photo cannot move (moving them back is a different path)
    const e = await failing(io.movePhotosToRecovery(NOW));
    expect(e.code).toBe('photos');
    expect(photoContents()).toEqual(before);
    expect(fs.names(recDir())).toEqual([]);
  });

  test('even the move back can fail (a crash): photos stay split and marked "moving"; the next start puts them back', async () => {
    seedPhotos(5);
    const before = photoContents();
    failFrom('move', 3); // the 3rd move and every later one fail, including the rollback
    expect((await failing(io.movePhotosToRecovery(NOW))).code).toBe('photos');
    const id = `photos-${NOW}`;
    expect(fs.names(photosDir())).toHaveLength(3);
    expect(fs.names(fs.doc('recovery', id)).filter((n) => n !== 'manifest.json')).toHaveLength(2);
    expect((await io.listRecoveries())[0]).toMatchObject({ state: 'moving', count: 2 });
    fs.hook = undefined; // the app starts again
    expect(await io.repairRecoveries(true, NOW + 1000)).toEqual({ restored: 1, finished: 0, purged: 0, failed: 0 });
    expect(photoContents()).toEqual(before);
    expect(fs.names(recDir())).toEqual([]);
  });

  test('the same interrupted move on an empty phone (the wipe went ahead): the folder is marked finished and keeps the photos', async () => {
    seedPhotos(4);
    failFrom('move', 3);
    await failing(io.movePhotosToRecovery(NOW));
    fs.hook = undefined;
    expect(await io.repairRecoveries(false, NOW + 1000)).toEqual({ restored: 0, finished: 1, purged: 0, failed: 0 });
    const id = `photos-${NOW}`;
    expect(parseManifest(fs.read(fs.doc('recovery', id, 'manifest.json')))).toMatchObject({ state: 'wiped', wipedAt: NOW + 1000 });
    expect(fs.names(fs.doc('recovery', id)).filter((n) => n !== 'manifest.json')).toHaveLength(2); // the rest is still on the phone side
  });

  test('finishing a wipe starts the 30 days; data coming back later never rolls a finished folder back', async () => {
    seedPhotos(2);
    const { id } = await io.movePhotosToRecovery(NOW);
    await io.finishRecovery(id, NOW + DAY);
    expect(await io.repairRecoveries(true, NOW + 2 * DAY)).toEqual({ restored: 0, finished: 0, purged: 0, failed: 0 });
    expect(fs.names(photosDir())).toEqual([]);
    expect(await io.repairRecoveries(false, NOW + DAY + 29 * DAY)).toMatchObject({ purged: 0 });
    expect(fs.has(fs.doc('recovery', id))).toBe(true);
    expect(await io.repairRecoveries(false, NOW + DAY + 30 * DAY)).toMatchObject({ purged: 1 });
    expect(fs.has(fs.doc('recovery', id))).toBe(false);
  });

  test('an unfinished folder is never purged by age: it is finished first, and the 30 days start then', async () => {
    seedPhotos(2);
    const { id } = await io.movePhotosToRecovery(NOW);
    expect(await io.repairRecoveries(false, NOW + 400 * DAY)).toMatchObject({ finished: 1, purged: 0 });
    expect(fs.has(fs.doc('recovery', id))).toBe(true);
    expect(await io.repairRecoveries(false, NOW + 431 * DAY)).toMatchObject({ purged: 1 });
  });

  test('a missing or broken manifest counts as unfinished', async () => {
    const a = `photos-${NOW}`;
    fs.put(fs.doc('recovery', a, P(1)), 'one');
    fs.put(fs.doc('recovery', a, 'manifest.json'), '{ not json');
    const b = `photos-${NOW + 1}`;
    fs.put(fs.doc('recovery', b, P(2)), 'two');
    expect((await io.listRecoveries()).map((r) => r.state)).toEqual(['moving', 'moving']);
    expect(await io.repairRecoveries(true, NOW + 5)).toMatchObject({ restored: 2 });
    expect(photoContents()).toEqual({ [P(1)]: 'one', [P(2)]: 'two' });
    fs.put(fs.doc('recovery', a, P(3)), 'three');
    expect(await io.repairRecoveries(false, NOW + 9)).toMatchObject({ finished: 1 });
    expect(parseManifest(fs.read(fs.doc('recovery', a, 'manifest.json')))?.state).toBe('wiped');
  });

  test('giving the photos back: names that already exist stay where they are, the folder stays while it holds a photo', async () => {
    seedPhotos(3);
    const { id } = await io.movePhotosToRecovery(NOW);
    await io.finishRecovery(id, NOW);
    fs.put(fs.doc('photos', P(2)), 'a newer photo with the same name');
    expect(await io.restoreRecoveryPhotos(id)).toBe(2);
    expect(photoContents()).toEqual({ [P(1)]: 'bytes-1', [P(2)]: 'a newer photo with the same name', [P(3)]: 'bytes-3' });
    expect(fs.names(fs.doc('recovery', id)).filter((n) => n !== 'manifest.json')).toEqual([P(2)]);
  });

  test('cancelling a wipe puts every photo back and removes the folder', async () => {
    seedPhotos(3);
    const before = photoContents();
    const { id } = await io.movePhotosToRecovery(NOW);
    expect(await io.abortRecovery(id)).toBe(3);
    expect(photoContents()).toEqual(before);
    expect(fs.names(recDir())).toEqual([]);
  });

  test('without a platform "move": copy, check the size, delete the original', async () => {
    setup({ noMove: true });
    seedPhotos(3);
    const before = photoContents();
    const { id } = await io.movePhotosToRecovery(NOW);
    expect(fs.names(photosDir())).toEqual([]);
    for (const [n, text] of Object.entries(before)) expect(fs.read(fs.doc('recovery', id, n))).toBe(text);
    expect(fs.ops.some((o) => o.startsWith('copy '))).toBe(true);
    expect(fs.ops.some((o) => o.startsWith('move '))).toBe(false);
  });

  test('a copy that does not match is never trusted: the original stays, the copy is removed, the move fails', async () => {
    setup({ noMove: true });
    seedPhotos(2);
    const before = photoContents();
    fs.transformWrite = (p, t) => (p.includes('/recovery/') && p.endsWith('.jpg') ? t.slice(0, 2) : t);
    expect((await failing(io.movePhotosToRecovery(NOW))).code).toBe('photos');
    expect(photoContents()).toEqual(before);
    expect(fs.names(recDir())).toEqual([]);
  });

  test('ids that are not recovery folders are refused', async () => {
    for (const bad of ['../x', 'photos-abc', 'photos-1800000000000/../..', '']) {
      expect((await failing(io.finishRecovery(bad))).code).toBe('io');
      expect((await failing(io.deleteRecovery(bad))).code).toBe('io');
      expect((await failing(io.abortRecovery(bad))).code).toBe('io');
    }
  });

  test('deleting a recovery folder (the user asked) removes it', async () => {
    seedPhotos(2);
    const { id } = await io.movePhotosToRecovery(NOW);
    await io.deleteRecovery(id);
    expect(fs.names(recDir())).toEqual([]);
  });

  test('repair never throws, and one folder that fails does not stop the next', async () => {
    const a = `photos-${NOW}`;
    const b = `photos-${NOW + 1}`;
    fs.put(fs.doc('recovery', a, P(1)), 'one');
    fs.put(fs.doc('recovery', b, P(2)), 'two');
    fs.hook = (op, path) => {
      if (op === 'move' && path.includes(`/${a}/`)) throw new Error('EBUSY');
    };
    expect(await io.repairRecoveries(true, NOW + 5)).toEqual({ restored: 1, finished: 0, purged: 0, failed: 1 });
    expect(photoContents()).toEqual({ [P(2)]: 'two' });
    expect(fs.has(fs.doc('recovery', a, P(1)))).toBe(true); // the failed one is untouched, tried again next start
    fs.hook = (op) => {
      if (op === 'list') throw new Error('EIO');
    };
    await expect(io.repairRecoveries(true, NOW + 6)).resolves.toEqual({ restored: 0, finished: 0, purged: 0, failed: 0 });
  });

  test('two operations at once run one after the other', async () => {
    seedPhotos(3);
    const [a, b] = await Promise.all([io.movePhotosToRecovery(NOW), io.movePhotosToRecovery(NOW + 1)]);
    expect(a.count).toBe(3);
    expect(b).toEqual({ id: '', count: 0 }); // the second one found nothing left to move
    expect(fs.names(recDir())).toEqual([`photos-${NOW}`]);
  });
});

describe('reuse refreshes the age; verify ignores rows parseBackup drops', () => {
  test('a reused snapshot is stamped again, so it is not pruned a day later by its old age', async () => {
    const a = await io.createSnapshot('pre-wipe', dump(), NOW);
    const b = await io.createSnapshot('pre-wipe', dump(), NOW + 29 * DAY);
    expect(b.reused).toBe(true);
    expect(fs.names(snapDir())).toEqual([b.name]);
    expect(parseSnapshotName(b.name)?.at).toBe(NOW + 29 * DAY);
    await io.pruneSnapshots(NOW + 31 * DAY); // 31 days after the first, 2 after the reuse
    expect(fs.names(snapDir())).toEqual([b.name]);
    expect(a.name).not.toBe(b.name);
  });

  test('a dump with rows the backup format drops still gets a snapshot (verify does not fail on them)', async () => {
    const d = dump();
    d.sets.push({ date: 'not-a-date', weekday: 1, exId: 'bench', idx: 1, kg: 1, reps: 1, done: 1 }, { date: '2026-11-01', weekday: 1, exId: 'bench', idx: -1, kg: 1, reps: 1, done: 1 });
    const r = await io.createSnapshot('pre-restore', d, NOW);
    expect(r.reused).toBe(false);
    expect(fs.names(snapDir())).toEqual([r.name]);
  });
});
