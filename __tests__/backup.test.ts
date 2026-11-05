/// <reference types="jest" />
import { BACKUP_APP, backupFileName, backupInfo, parseBackup, toBackup } from '../src/lib/backup';
import type { Dump } from '../src/lib/storage.types';

const dump: Dump = {
  sets: [
    { date: '2026-11-01', weekday: 1, exId: 'deadlift', idx: 0, kg: 100, reps: 5, done: 1, rir: 2, at: 1_800_000_000_000 },
    { date: '2026-11-01', weekday: 1, exId: 'deadlift', idx: 1, kg: null, reps: null, done: 0 },
    { date: '2026-11-03', weekday: 2, exId: 'barbell-bench-press', idx: 0, kg: 70, reps: 8, done: 1 },
  ],
  meals: [{ date: '2026-11-01', meal: 'الفطار' }],
  shop: [{ week: '2026-10-31', item: 'بيض' }],
  meta: { settings: '{"verse":false}', weights: '[]' },
};

test('round trip keeps everything', () => {
  const p = parseBackup(toBackup(dump, new Date('2026-11-05T10:00:00Z')));
  expect(p.ok).toBe(true);
  if (!p.ok) return;
  expect(p.data).toEqual(dump);
  expect(p.exportedAt).toBe('2026-11-05T10:00:00.000Z');
  expect(p.info).toEqual({ sets: 2, days: 2, meals: 1, photos: 0, from: '2026-11-01', to: '2026-11-03' });
  expect(p.photos).toEqual([]);
});

test('rejects files that are not ours or from a newer app', () => {
  expect(parseBackup('hello').ok).toBe(false);
  expect(parseBackup('{"a":1}').ok).toBe(false);
  expect(parseBackup(JSON.stringify({ app: BACKUP_APP, version: 99, data: {} })).ok).toBe(false);
});

test('drops broken rows, keeps the good ones', () => {
  const text = JSON.stringify({
    app: BACKUP_APP,
    version: 1,
    data: {
      sets: [dump.sets[0], { ...dump.sets[0], date: 'yesterday' }, { ...dump.sets[0], idx: -1 }, { ...dump.sets[0], kg: 'heavy' }, null],
      meals: [{ date: '2026-11-01', meal: 3 }],
      meta: { a: 'x', b: 2 },
    },
  });
  const p = parseBackup(text);
  expect(p.ok).toBe(true);
  if (!p.ok) return;
  expect(p.data.sets).toEqual([dump.sets[0]]);
  expect(p.data.meals).toEqual([]);
  expect(p.data.shop).toEqual([]);
  expect(p.data.meta).toEqual({ a: 'x' });
});

test('info and file name', () => {
  expect(backupInfo({ sets: [], meals: [], shop: [], meta: {} })).toEqual({ sets: 0, days: 0, meals: 0, photos: 0, from: null, to: null });
  expect(backupFileName('2026-11-05')).toBe('gym-backup-2026-11-05.json');
});

test('photos ride along in the file, broken ones are dropped', () => {
  const photos = [{ name: '2026-11-01_1800000000000.jpg', data: '/9j/4AAQSkZJRg==' }];
  const p = parseBackup(toBackup(dump, new Date(), photos));
  expect(p.ok && p.photos).toEqual(photos);
  expect(p.ok && p.info.photos).toBe(1);
  const bad = JSON.parse(toBackup(dump, new Date(), photos));
  bad.photos.push({ name: '../evil.jpg', data: 'AAAA' }, { name: '2026-11-02_1.jpg', data: 'not base64!' });
  const q = parseBackup(JSON.stringify(bad));
  expect(q.ok && q.photos).toEqual(photos);
  // without photos the file has no photos field at all
  expect(JSON.parse(toBackup(dump)).photos).toBeUndefined();
});
