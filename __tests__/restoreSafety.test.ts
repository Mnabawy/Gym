/// <reference types="jest" />
// applyBackup (src/lib/restore.ts): a safety copy of what's on the phone first, nothing touched when it can't be made,
// and this phone's own settings (`device`) kept. Real storage on Node's SQLite; the snapshot file itself is mocked
// (safetyIO.ts on a fake file system is tested in safetyIO.test.ts).
jest.mock('../src/lib/storage', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const fs = require('fs') as typeof import('fs');
  const os = require('os') as typeof import('os');
  const path = require('path') as typeof import('path');
  const { loadNativeStorage } = require('../test-utils/nodeSqlite') as typeof import('../test-utils/nodeSqlite');
  return loadNativeStorage(fs.mkdtempSync(path.join(os.tmpdir(), 'gymapp-restore-'))).mod;
  /* eslint-enable @typescript-eslint/no-require-imports */
});
const mockSnapshot = jest.fn(async (_why: string, _d: unknown): Promise<void> => {});
jest.mock('../src/lib/safetyIO', () => ({ createSnapshot: (why: string, d: unknown) => mockSnapshot(why, d) }));
jest.mock('../src/lib/photos', () => ({ photosSupported: false, importPhotos: () => 0 }));
/* eslint-disable import/first */
import { storage } from '../src/lib/storage';
import { applyBackup, safetyText } from '../src/lib/restore';
import { SafetyError } from '../src/lib/safety';
import type { Dump } from '../src/lib/storage.types';
/* eslint-enable import/first */

const file: Dump = { sets: [{ date: '2026-10-01', weekday: 1, exId: 'squat', idx: 0, kg: 100, reps: 5, done: 1 }], meals: [], shop: [], meta: { device: '{"haptics":false}' } };
const setKeys = () => storage.dump().sets.map((r) => `${r.date}|${r.exId}|${r.idx}`);

beforeEach(() => {
  storage.restore({ sets: [], meals: [], shop: [], meta: {} });
  mockSnapshot.mockReset().mockResolvedValue(undefined);
});

test('saves a pre-restore snapshot of what was on the phone, then restores', async () => {
  storage.restore({ sets: [{ date: '2026-11-01', weekday: 1, exId: 'bench', idx: 0, kg: 60, reps: 8, done: 1 }], meals: [], shop: [], meta: {} });
  await applyBackup(file, []);
  expect(mockSnapshot).toHaveBeenCalledTimes(1);
  expect(mockSnapshot.mock.calls[0][0]).toBe('pre-restore');
  expect((mockSnapshot.mock.calls[0][1] as Dump).sets.map((s) => s.exId)).toEqual(['bench']);
  expect(setKeys()).toEqual(['2026-10-01|squat|0']);
});

test('no safety copy: nothing is restored and the error says so', async () => {
  storage.restore({ sets: [{ date: '2026-11-01', weekday: 1, exId: 'bench', idx: 0, kg: 60, reps: 8, done: 1 }], meals: [], shop: [], meta: {} });
  mockSnapshot.mockRejectedValue(new SafetyError('space', 'no space'));
  const e = await applyBackup(file, []).catch((x: unknown) => x);
  expect(e).toBeInstanceOf(SafetyError);
  expect(safetyText(e)).toContain('مساحة');
  expect(setKeys()).toEqual(['2026-11-01|bench|0']);
});

test('an empty phone needs no snapshot', async () => {
  await applyBackup(file, []);
  expect(mockSnapshot).not.toHaveBeenCalled();
  expect(setKeys()).toEqual(['2026-10-01|squat|0']);
});

test("this phone's own settings stay; the backup's are ignored", async () => {
  storage.setMeta('device', '{"haptics":true}');
  await applyBackup(file, []);
  expect(storage.getMeta('device')).toBe('{"haptics":true}');
});
