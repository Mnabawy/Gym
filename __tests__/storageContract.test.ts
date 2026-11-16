/// <reference types="jest" />
/// <reference types="node" />
// One set of `Storage` cases (src/lib/storage.types.ts) run against both real implementations, so web and phone can't
// drift: storage.web.ts on a fake localStorage, and storage.ts (expo-sqlite) on Node's built-in SQLite
// (test-utils/nodeSqlite.ts). Each case gets a fresh "phone"; `reopen()` starts the app again on the same saved data.
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DB_RECOVERED_KEY, parseDbRecovery } from '../src/lib/dbOpen';
import type * as StorageMod from '../src/lib/storage';
import type { Dump, SetRow, Storage } from '../src/lib/storage.types';
import { loadNativeStorage } from '../test-utils/nodeSqlite';

type Phone = { open(): Storage; breakIt(): void; cleanup(): void };

function webPhone(): Phone {
  const mem = new Map<string, string>();
  const ls = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, String(v)), removeItem: (k: string) => void mem.delete(k) };
  return {
    open() {
      (globalThis as { localStorage?: unknown }).localStorage = ls;
      let mod!: typeof StorageMod;
      jest.isolateModules(() => {
        mod = jest.requireActual<typeof StorageMod>('../src/lib/storage.web');
      });
      // storage.web.ts reads globalThis.localStorage on every write, so it stays in place for the phone's life.
      return mod.storage;
    },
    breakIt: () => void mem.set('gym-app-v1', '{"sets": [ broken'),
    cleanup: () => void delete (globalThis as { localStorage?: unknown }).localStorage,
  };
}

function nativePhone(): Phone {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainy-contract-'));
  return {
    open: () => loadNativeStorage(dir).mod.storage,
    breakIt: () => {
      // As after the app was closed: no -wal / -shm left (the open connection of this test can't be closed from outside).
      for (const tail of ['-wal', '-shm']) fs.rmSync(path.join(dir, `gym.db${tail}`), { force: true });
      fs.writeFileSync(path.join(dir, 'gym.db'), 'not a database '.repeat(300));
    },
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

const row = (date: string, exId: string, idx: number, kg: number | null = 60, done = 1, extra: Partial<SetRow> = {}): SetRow => ({ date, weekday: 1, exId, idx, kg, reps: kg == null ? null : 8, done, ...extra });
const byKey = <T>(a: T[], key: (x: T) => string) => [...a].sort((p, q) => (key(p) < key(q) ? -1 : key(p) > key(q) ? 1 : 0));
const norm = (d: Dump) => ({
  sets: d.sets.map((r) => ({ ...r, rir: r.rir ?? null, at: r.at ?? null })),
  meals: byKey(d.meals, (m) => `${m.date}|${m.meal}`),
  shop: byKey(d.shop, (x) => `${x.week}|${x.item}`),
  meta: d.meta,
});

describe.each([
  ['web (localStorage)', webPhone],
  ['native (SQLite)', nativePhone],
])('%s', (_name, make) => {
  let phone: Phone;
  let s: Storage;
  beforeEach(() => {
    phone = make();
    s = phone.open();
  });
  afterEach(() => phone.cleanup());

  test('a set is saved, read back and overwritten in place; missing indexes are blank', () => {
    s.saveSet(row('2026-11-01', 'bench', 0, 60));
    s.saveSet(row('2026-11-01', 'bench', 2, 70, 0, { rir: 2, at: 123 }));
    s.saveSet(row('2026-11-01', 'bench', 0, 65));
    expect(s.setsFor('2026-11-01', 'bench')).toEqual([
      { kg: 65, reps: 8, done: true, rir: null, at: null },
      { kg: null, reps: null, done: false },
      { kg: 70, reps: 8, done: false, rir: 2, at: 123 },
    ]);
    expect(s.setsFor('2026-11-01', 'squat')).toEqual([]);
  });

  test('lastSession: the newest earlier day with a number, not the same day, not an empty one', () => {
    s.saveSet(row('2026-11-01', 'bench', 0, 60));
    s.saveSet(row('2026-11-03', 'bench', 0, 62));
    s.saveSet(row('2026-11-04', 'bench', 0, null));
    s.saveSet(row('2026-11-05', 'bench', 0, 64));
    expect(s.lastSession('bench', '2026-11-05')?.[0].kg).toBe(62);
    expect(s.lastSession('bench', '2026-11-01')).toBeUndefined();
  });

  test('clearDay and deleteSet remove only what they name', () => {
    s.saveSet(row('2026-11-01', 'bench', 0));
    s.saveSet(row('2026-11-01', 'bench', 1));
    s.saveSet(row('2026-11-01', 'squat', 0));
    s.saveSet(row('2026-11-02', 'bench', 0));
    s.deleteSet('2026-11-01', 'bench', 1);
    expect(s.setsFor('2026-11-01', 'bench')).toHaveLength(1);
    s.clearDay('2026-11-01', ['bench']);
    expect(s.setsFor('2026-11-01', 'bench')).toEqual([]);
    expect(s.setsFor('2026-11-01', 'squat')).toHaveLength(1);
    expect(s.setsFor('2026-11-02', 'bench')).toHaveLength(1);
  });

  test('history, doneSetsBetween, sessionDates, trainedDays and allSets agree', () => {
    s.saveSet(row('2026-11-03', 'bench', 0));
    s.saveSet(row('2026-11-01', 'bench', 0));
    s.saveSet(row('2026-11-01', 'bench', 1, 60, 0));
    s.saveSet({ ...row('2026-11-01', 'squat', 0), weekday: 2 });
    s.saveSet(row('2026-11-09', 'squat', 0));
    expect(s.history('bench').map((h) => h.date)).toEqual(['2026-11-01', '2026-11-03']);
    expect(byKey(s.doneSetsBetween('2026-11-01', '2026-11-03'), (x) => x.exId)).toEqual([
      { exId: 'bench', n: 2 },
      { exId: 'squat', n: 1 },
    ]);
    expect(s.sessionDates('2026-11-02', '2026-11-09')).toEqual(['2026-11-03', '2026-11-09']);
    expect(s.trainedDays().map((d) => ({ ...d, weekdays: [...d.weekdays].sort() }))).toEqual([
      { date: '2026-11-01', weekdays: [1, 2], sets: 2 },
      { date: '2026-11-03', weekdays: [1], sets: 1 },
      { date: '2026-11-09', weekdays: [1], sets: 1 },
    ]);
    expect(s.allSets().map((r) => `${r.date} ${r.exId} ${r.idx}`)).toEqual(['2026-11-01 bench 0', '2026-11-01 bench 1', '2026-11-01 squat 0', '2026-11-03 bench 0', '2026-11-09 squat 0']);
  });

  test('meal and shopping ticks: on twice is one tick, off removes it, clearShop empties one week', () => {
    s.setMealCheck('2026-11-02', 'lunch', true);
    s.setMealCheck('2026-11-01', 'breakfast', true);
    s.setMealCheck('2026-11-01', 'breakfast', true);
    s.setMealCheck('2026-11-02', 'dinner', true);
    s.setMealCheck('2026-11-02', 'dinner', false);
    expect(s.mealChecks('2026-11-01')).toEqual(['breakfast']);
    expect(s.allMealChecks()).toEqual([
      { date: '2026-11-01', meal: 'breakfast' },
      { date: '2026-11-02', meal: 'lunch' },
    ]);
    s.setShopCheck('w1', 'eggs', true);
    s.setShopCheck('w1', 'eggs', true);
    s.setShopCheck('w1', 'rice', true);
    s.setShopCheck('w2', 'milk', true);
    s.setShopCheck('w1', 'rice', false);
    expect(s.shopChecks('w1')).toEqual(['eggs']);
    s.clearShop('w1');
    expect(s.shopChecks('w1')).toEqual([]);
    expect(s.shopChecks('w2')).toEqual(['milk']);
  });

  test('meta: null when missing, last write wins', () => {
    expect(s.getMeta('x')).toBeNull();
    s.setMeta('x', '1');
    s.setMeta('x', '2');
    expect(s.getMeta('x')).toBe('2');
  });

  test('a transaction applies all its writes', () => {
    s.transaction(() => {
      s.saveSet(row('2026-11-01', 'bench', 0));
      s.setMealCheck('2026-11-01', 'lunch', true);
      s.setMeta('k', 'v');
    });
    expect(s.setsFor('2026-11-01', 'bench')).toHaveLength(1);
    expect(s.mealChecks('2026-11-01')).toEqual(['lunch']);
    expect(s.getMeta('k')).toBe('v');
  });

  test('dump → restore puts back exactly the same data, replacing what was there', () => {
    s.saveSet(row('2026-11-01', 'bench', 0, 60, 1, { rir: 1, at: 99 }));
    s.setMealCheck('2026-11-01', 'lunch', true);
    s.setShopCheck('w1', 'eggs', true);
    s.setMeta('weights', '[1]');
    const d = s.dump();
    s.saveSet(row('2026-11-05', 'squat', 0));
    s.setMeta('other', 'x');
    s.restore(d);
    expect(norm(s.dump())).toEqual(norm(d));
    expect(s.getMeta('other')).toBeNull();
  });

  test('everything is still there after the app starts again', () => {
    s.saveSet(row('2026-11-01', 'bench', 0));
    s.setMealCheck('2026-11-01', 'lunch', true);
    s.setShopCheck('w1', 'eggs', true);
    s.setMeta('weights', '[1]');
    const before = norm(s.dump());
    expect(norm(phone.open().dump())).toEqual(before);
  });

  test('broken saved data: the app still starts, empty, with a note to restore a backup', () => {
    s.saveSet(row('2026-11-01', 'bench', 0));
    phone.breakIt();
    const again = phone.open();
    expect(again.allSets()).toEqual([]);
    expect(parseDbRecovery(again.getMeta(DB_RECOVERED_KEY))?.file).toMatch(/\.broken-\d+$/);
    again.setMeta('weights', '[2]');
    expect(again.getMeta('weights')).toBe('[2]');
  });
});
