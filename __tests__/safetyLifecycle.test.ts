/// <reference types="jest" />
// The safety net inside a whole simulated phone (test-utils/syncSim.ts): what the sign-out, unlink, restore and wipe code
// does to the places the safety net keeps its state, recovery without any server, and the weekly backup's rotation.
// Nothing here changes production behavior: these are facts about the code as it is, and about the new modules.
import { parseBackup } from '../src/lib/backup';
import { hasAnythingToProtect, parseManifest } from '../src/lib/safety';
import { Sim } from '../test-utils/syncSim';

let sim: Sim;
beforeEach(() => {
  sim = new Sim();
  sim.install();
});
afterEach(() => sim.uninstall());

const A = 'a@x.test';
const DAY = 86_400_000;
const P = (i: number) => `2026-11-0${i}_${i}.jpg`;
const w = (kg: number) => JSON.stringify([{ date: '2026-11-01', kg }]);
/** What the user logged: the phone's own account and welcome keys (kept by a restore, blank after a sign-out) and empty values are left out. */
const logged = (d: { sets: unknown[]; meals: unknown[]; shop: unknown[]; meta: Record<string, string> }) => ({
  ...d,
  meta: Object.fromEntries(Object.entries(d.meta).filter(([k, v]) => v !== '' && !['driveUser', 'driveName', 'drivePhoto', 'welcomeDone'].includes(k))),
});

describe('can a pending-wipe marker be removed by unlinkCloud, unlinkGoogle or the restore inside wipeLocal?', () => {
  test('unlinkCloud only clears its own session keys; a `sync.` meta marker survives it', async () => {
    const d = sim.device('A');
    await d.signIn(A);
    d.setMeta('sync.wipePending', 'photos-1');
    d.do(() => d.cloud.unlinkCloud());
    expect(d.meta('sync.wipePending')).toBe('photos-1');
    for (const k of ['sync.session', 'sync.cursor', 'sync.full']) expect(d.meta(k)).toBeFalsy(); // its own keys are cleared
  });

  test('...but it also survives the wipe itself (track.restore re-applies every `sync.` key), so after a wipe it would be stale', async () => {
    const d = sim.device('A');
    d.setRow('2026-11-01', 'bench', 0);
    d.setMeta('weights', w(80));
    await d.signIn(A);
    d.setMeta('sync.wipePending', 'photos-1');
    await d.signOut({ wipe: true }); // unlinkCloud, the Google keys, wipeLocal: what account.tsx runs
    expect(d.setKeys()).toEqual([]);
    expect(d.meta('weights')).toBeFalsy(); // the data is gone...
    expect(d.meta('sync.wipePending')).toBe('photos-1'); // ...the marker is not
  });

  test('a restore keeps it too', async () => {
    const d = sim.device('A');
    d.setMeta('sync.wipePending', 'photos-1');
    await d.act(() => d.restoreMod.applyBackup({ sets: [], meals: [], shop: [], meta: { weights: w(80) } }, []));
    expect(d.meta('weights')).toBe(w(80));
    expect(d.meta('sync.wipePending')).toBe('photos-1');
  });

  test('so the state is kept in a file inside the recovery folder, and the whole sign-out sequence leaves it alone', async () => {
    const d = sim.device('A');
    d.setRow('2026-11-01', 'bench', 0);
    for (let i = 1; i <= 3; i++) d.addPhoto(P(i));
    await d.signIn(A);
    const { id } = await d.act(() => d.safety.movePhotosToRecovery(sim.time));
    const manifest = d.fs.doc('recovery', id, 'manifest.json');
    await d.signOut({ wipe: true });
    expect(parseManifest(d.fs.read(manifest))).toMatchObject({ state: 'ready' });
    expect(d.fs.names(d.fs.doc('recovery', id)).filter((n) => n !== 'manifest.json')).toEqual([P(1), P(2), P(3)]);
    await d.act(() => d.restoreMod.applyBackup({ sets: [], meals: [], shop: [], meta: { weights: w(80) } }, [])); // a restore too
    expect(parseManifest(d.fs.read(manifest))?.state).toBe('ready');
  });
});

describe('an interrupted wipe', () => {
  const dataHere = (d: ReturnType<Sim['device']>) => hasAnythingToProtect(d.do(() => d.storage.dump()));

  test('interrupted after the photos moved and before the wipe: at the next start the photos are back', async () => {
    const d = sim.device('A');
    d.setRow('2026-11-01', 'bench', 0);
    for (let i = 1; i <= 3; i++) d.addPhoto(P(i));
    await d.act(() => d.safety.movePhotosToRecovery(sim.time));
    expect(d.photoNames()).toEqual([]); // the app was killed here: the user sees no photos
    expect(dataHere(d)).toBe(true);
    expect(await d.safety.repairRecoveries(dataHere(d), sim.time)).toMatchObject({ restored: 1 });
    expect(d.photoNames()).toEqual([P(1), P(2), P(3)]);
    expect(d.recoveryFolders()).toEqual([]);
  });

  test('interrupted after the wipe and before the last note: the next start finishes the note and the photos stay recoverable', async () => {
    const d = sim.device('A');
    d.setRow('2026-11-01', 'bench', 0);
    for (let i = 1; i <= 2; i++) d.addPhoto(P(i));
    await d.signIn(A);
    const { id } = await d.act(() => d.safety.movePhotosToRecovery(sim.time));
    await d.signOut({ wipe: true }); // finishRecovery never ran
    expect(dataHere(d)).toBe(false);
    expect(await d.safety.repairRecoveries(dataHere(d), sim.time + 1000)).toMatchObject({ finished: 1, restored: 0 });
    expect(parseManifest(d.fs.read(d.fs.doc('recovery', id, 'manifest.json')))?.state).toBe('wiped');
    // The user signs in again and the account's data comes back; the next start must not move the photos back by surprise.
    await d.signIn(A);
    expect(dataHere(d)).toBe(true);
    expect(await d.safety.repairRecoveries(dataHere(d), sim.time + 2000)).toMatchObject({ restored: 0, finished: 0, purged: 0 });
    expect(d.photoNames()).toEqual([]);
    expect(d.fs.names(d.fs.doc('recovery', id)).filter((n) => n !== 'manifest.json')).toEqual([P(1), P(2)]);
  });
});

describe('recovery does not depend on Supabase', () => {
  test('with sync not configured and the server unreachable: snapshot, wipe, restore from the snapshot, photos back, zero requests', async () => {
    sim.server.offline.add('A');
    const d = sim.device('A', { configured: false });
    d.setRow('2026-11-01', 'bench', 0, 60);
    d.setMeta('weights', w(80));
    d.setMeta('tasks', JSON.stringify([{ id: 't1', title: 'one' }]));
    for (let i = 1; i <= 2; i++) d.addPhoto(P(i), `photo-${i}`);
    const original = d.do(() => d.storage.dump());

    const snap = await d.act(() => d.safety.createSnapshot('pre-wipe', original, sim.time));
    const moved = await d.act(() => d.safety.movePhotosToRecovery(sim.time));
    await d.signOut({ wipe: true });
    await d.safety.finishRecovery(moved.id, sim.time);
    expect(d.setKeys()).toEqual([]);

    const parsed = parseBackup(await d.safety.readSnapshot(snap.name));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    await d.act(() => d.restoreMod.applyBackup(parsed.data, parsed.photos)); // the existing restore path, unchanged
    expect(logged(d.do(() => d.storage.dump()))).toEqual(logged(original));

    expect(await d.safety.restoreRecoveryPhotos(moved.id)).toBe(2);
    expect(d.photoNames()).toEqual([P(1), P(2)]);
    expect(d.fs.read(d.fs.doc('photos', P(1)))).toBe('photo-1');
    expect(sim.server.requests).toHaveLength(0);
  });
});

describe('the weekly automatic backup never touches the safety net', () => {
  test('rotation deletes only old gym-auto files directly in backups/; snapshots and recovery folders stay', async () => {
    const d = sim.device('A');
    d.setRow('2026-11-01', 'bench', 0);
    for (let i = 1; i <= 2; i++) d.addPhoto(P(i));
    for (const day of ['01', '02', '03', '04', '05', '06']) d.fs.put(d.fs.doc('backups', `gym-auto-2020-01-${day}.json`), '{}'); // six old weekly copies
    const snap = await d.act(() => d.safety.createSnapshot('first-sync', d.do(() => d.storage.dump()), sim.time));
    await d.act(() => d.safety.movePhotosToRecovery(sim.time));
    const safetyBefore = d.snapshotFiles();
    const recoveryBefore = d.fs.names(d.fs.doc('recovery', d.recoveryFolders()[0]));

    for (let i = 0; i < 3; i++) expect(await d.act(() => d.autoBackup.runAutoBackup(true))).toBe('saved');

    expect(d.autoBackupFiles()).toHaveLength(d.autoBackup.AUTO_KEEP); // the weekly rotation did its job: 4 kept
    expect(d.autoBackupFiles().some((n) => ['01', '02', '03'].some((day) => n === `gym-auto-2020-01-${day}.json`))).toBe(false); // the oldest were rotated out
    expect(d.snapshotFiles()).toEqual(safetyBefore);
    expect(safetyBefore).toEqual([snap.name]);
    expect(d.fs.names(d.fs.doc('recovery', d.recoveryFolders()[0]))).toEqual(recoveryBefore);
    expect(d.autoBackup.listAutoBackups().every((f) => f.name.startsWith('gym-auto-'))).toBe(true); // it does not even list them
  });
});

describe('phones are isolated', () => {
  test('each simulated phone has its own file system', async () => {
    const a = sim.device('A');
    const b = sim.device('B');
    a.addPhoto(P(1));
    expect(a.photoNames()).toEqual([P(1)]);
    expect(b.photoNames()).toEqual([]);
    await a.act(() => a.safety.movePhotosToRecovery(sim.time));
    expect(b.recoveryFolders()).toEqual([]);
    expect(DAY).toBeGreaterThan(0);
  });
});
