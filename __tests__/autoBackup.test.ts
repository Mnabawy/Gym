/// <reference types="jest" />
// The real src/lib/autoBackup.ts (and verifiedWrite.ts under it) on an in-memory file system (test-utils/fakeFs.ts).
import { LAST_BACKUP_KEY, parseBackup } from '../src/lib/backup';
import type * as AutoBackupMod from '../src/lib/autoBackup';
import type { Storage } from '../src/lib/storage.types';
import { createFakeFs, type FakeFs } from '../test-utils/fakeFs';
import { memoryStorage } from '../test-utils/memoryStorage';

let fs: FakeFs;
let store: Storage;
let auto: typeof AutoBackupMod;
let settings: { autoBackup: boolean; backupDir: string | null };
const PICKED = 'file:///picked';

beforeEach(() => {
  fs = createFakeFs();
  store = memoryStorage();
  settings = { autoBackup: true, backupDir: null };
  jest.isolateModules(() => {
    jest.doMock('expo-file-system', () => fs.module);
    jest.doMock('../src/lib/storage', () => ({ storage: store }));
    jest.doMock('../src/lib/settings', () => ({ useSettings: { getState: () => settings } }));
    jest.doMock('../src/lib/photos', () => ({ exportPhotos: async () => [] }));
    auto = jest.requireActual<typeof AutoBackupMod>('../src/lib/autoBackup');
  });
});

const backups = () => fs.names(fs.doc('backups'));
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const failFrom = (op: string, only?: (path: string) => boolean) => {
  fs.hook = (o, path) => {
    if (o === op && (!only || only(path))) throw new Error(`injected ${op} failure`);
  };
};

test('a phone with only weights (no sets, no meals) gets its weekly backup', async () => {
  store.setMeta('weights', JSON.stringify([{ date: '2026-11-01', kg: 80 }]));
  expect(await auto.runAutoBackup(true)).toBe('saved');
  expect(backups()).toEqual([`gym-auto-${today()}.json`]);
  const p = parseBackup(String(fs.read(fs.doc('backups', `gym-auto-${today()}.json`))));
  expect(p.ok && p.data.meta.weights).toContain('80');
  expect(store.getMeta(auto.AUTO_KEY)).toBe(today());
});

test('only exercise notes still count as data', async () => {
  store.setMeta('notes', JSON.stringify({ bench: 'grip wider' }));
  expect(await auto.runAutoBackup(true)).toBe('saved');
});

test('settings alone are skipped', async () => {
  store.setMeta('settings', '{"autoBackup":true}');
  expect(await auto.runAutoBackup(true)).toBe('skipped');
  expect(backups()).toEqual([]);
});

describe('a failed write leaves the earlier backups and the dates as they were', () => {
  const seed = () => {
    store.setMeta('weights', '[{"date":"2026-11-01","kg":80}]');
    for (const day of ['01', '02', '03', '04']) fs.put(fs.doc('backups', `gym-auto-2020-01-${day}.json`), `old-${day}`);
    store.setMeta(auto.AUTO_KEY, '2020-01-04');
    store.setMeta(LAST_BACKUP_KEY, '2020-01-04');
  };
  const expectUntouched = () => {
    expect(backups()).toEqual(['gym-auto-2020-01-01.json', 'gym-auto-2020-01-02.json', 'gym-auto-2020-01-03.json', 'gym-auto-2020-01-04.json']);
    expect(fs.read(fs.doc('backups', 'gym-auto-2020-01-01.json'))).toBe('old-01');
    expect(store.getMeta(auto.AUTO_KEY)).toBe('2020-01-04');
    expect(store.getMeta(LAST_BACKUP_KEY)).toBe('2020-01-04');
    expect(store.getMeta(auto.AUTO_ERROR_KEY)).toBe(today()); // the failure is noted for settings, not swallowed
  };

  test('the write throws (disk full)', async () => {
    seed();
    fs.free = 10;
    await expect(auto.runAutoBackup(true)).rejects.toMatchObject({ code: 'space' });
    expectUntouched();
  });

  test('the file comes back torn (verify fails)', async () => {
    seed();
    fs.transformWrite = (_p, text) => text.slice(0, text.length / 2);
    await expect(auto.runAutoBackup(true)).rejects.toMatchObject({ code: 'verify' });
    expectUntouched();
  });

  test('the rename fails', async () => {
    seed();
    failFrom('rename');
    await expect(auto.runAutoBackup(true)).rejects.toBeTruthy();
    expectUntouched();
  });

  test("today's earlier copy survives a failed second run the same day", async () => {
    store.setMeta('weights', '[{"date":"2026-11-01","kg":80}]');
    await auto.runAutoBackup(true);
    const name = `gym-auto-${today()}.json`;
    const first = fs.read(fs.doc('backups', name));
    store.setMeta('weights', '[{"date":"2026-11-01","kg":81}]');
    failFrom('rename', (p) => p.endsWith('.tmp'));
    await expect(auto.runAutoBackup(true)).rejects.toBeTruthy();
    expect(backups()).toEqual([name]);
    expect(fs.read(fs.doc('backups', name))).toBe(first);
  });
});

test('a failed in-app copy is noted (no picked folder), and the next good run clears it', async () => {
  store.setMeta('weights', '[{"date":"2026-11-01","kg":80}]');
  fs.free = 10;
  await expect(auto.runAutoBackup(true)).rejects.toBeTruthy();
  expect(store.getMeta(auto.AUTO_ERROR_KEY)).toBe(today());
  expect(store.getMeta(auto.AUTO_KEY)).toBeNull();
  fs.free = 200_000_000;
  expect(await auto.runAutoBackup(true)).toBe('saved');
  expect(store.getMeta(auto.AUTO_ERROR_KEY)).toBe('');
});

test('success rotates to the newest copies only after the new one is in place', async () => {
  store.setMeta('weights', '[{"date":"2026-11-01","kg":80}]');
  for (const day of ['01', '02', '03', '04', '05']) fs.put(fs.doc('backups', `gym-auto-2020-01-${day}.json`), `old-${day}`);
  fs.put(fs.doc('backups', 'gym-auto-2020-01-06.json.tmp'), 'torn'); // left by a run that was cut off
  expect(await auto.runAutoBackup(true)).toBe('saved');
  expect(backups()).toEqual(['gym-auto-2020-01-03.json', 'gym-auto-2020-01-04.json', 'gym-auto-2020-01-05.json', `gym-auto-${today()}.json`]);
});

describe('the copy in the picked folder', () => {
  beforeEach(() => {
    fs.put(`${PICKED}/keep.txt`, 'x');
    settings.backupDir = PICKED;
    store.setMeta('weights', '[{"date":"2026-11-01","kg":80}]');
  });

  test('a verified copy counts as the last backup', async () => {
    expect(await auto.runAutoBackup(true)).toBe('saved');
    expect(fs.names(PICKED)).toContain(`gym-auto-${today()}.json`);
    expect(store.getMeta(LAST_BACKUP_KEY)).toBe(today());
    expect(store.getMeta(auto.AUTO_ERROR_KEY)).toBe('');
  });

  test('a torn copy is deleted, noted as an error, and is not counted', async () => {
    fs.transformWrite = (p, text) => (p.startsWith(PICKED) ? text.slice(0, 20) : text);
    expect(await auto.runAutoBackup(true)).toBe('saved'); // the copy inside the app is fine
    expect(fs.names(PICKED)).toEqual(['keep.txt']);
    expect(store.getMeta(LAST_BACKUP_KEY)).toBeNull();
    expect(store.getMeta(auto.AUTO_ERROR_KEY)).toBe(today());
  });
});
