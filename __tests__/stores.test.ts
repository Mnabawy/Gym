/// <reference types="jest" />
// Store actions: the food tab's writes (src/lib/foodStore.ts) and atomic multi-key writes (src/lib/atomic.ts).
// Real storage (storage.ts, with its all-or-nothing transaction and the sync tracking wrapper) on Node's built-in
// SQLite (test-utils/nodeSqlite.ts), so a write that throws halfway really rolls back.
jest.mock('../src/lib/storage', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const fs = require('fs') as typeof import('fs');
  const os = require('os') as typeof import('os');
  const path = require('path') as typeof import('path');
  const { loadNativeStorage } = require('../test-utils/nodeSqlite') as typeof import('../test-utils/nodeSqlite');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gymapp-stores-'));
  return loadNativeStorage(dir).mod;
  /* eslint-enable @typescript-eslint/no-require-imports */
});
// eslint-disable-next-line import/first
import { storage } from '../src/lib/storage';
// eslint-disable-next-line import/first
import { atomic } from '../src/lib/atomic';
// eslint-disable-next-line import/first
import * as food from '../src/lib/foodStore';
// eslint-disable-next-line import/first
import { dayKey, EXTRAS_KEY, MEAL_PICKS_KEY, parseExtras, SUPPS_KEY, WATER_KEY } from '../src/lib/journal';
// eslint-disable-next-line import/first
import { readNumbers, writeEntry } from '../src/lib/meta';
const D = '2026-11-17';
const meta = (k: string) => storage.getMeta(k);

beforeEach(() => {
  storage.restore({ sets: [], meals: [], shop: [], meta: {} });
  jest.restoreAllMocks();
});

describe('food store', () => {
  test('a meal tick and its undo; another meal ticked meanwhile stays', () => {
    const undo = food.tickMeal(D, 'الفطار', true);
    expect(storage.mealChecks(D)).toEqual(['الفطار']);
    food.tickMeal(D, 'الغدا', true);
    undo();
    expect(storage.mealChecks(D)).toEqual(['الغدا']);
  });

  test('water: undo takes back only what was added, also after a sync changed the day', () => {
    const before = meta(WATER_KEY);
    const undo = food.addWater(D, 250);
    expect(readNumbers(WATER_KEY)[D]).toBe(250);
    undo();
    expect(meta(WATER_KEY)).toBe(before === null ? '{}' : before);
    expect(readNumbers(WATER_KEY)[D]).toBeUndefined();

    writeEntry(WATER_KEY, 'number', D, 500);
    const undo2 = food.addWater(D, 250);
    writeEntry(WATER_KEY, 'number', D, 1500); // another phone's cups came in
    undo2();
    expect(readNumbers(WATER_KEY)[D]).toBe(1250);
    // Taking a cup off never goes below 0, and its undo gives back only what was taken.
    writeEntry(WATER_KEY, 'number', D, 100);
    const undo3 = food.addWater(D, -250);
    expect(readNumbers(WATER_KEY)[D]).toBeUndefined();
    undo3();
    expect(readNumbers(WATER_KEY)[D]).toBe(100);
  });

  test('supplements and meal picks: undo puts back the exact stored entry (also one a newer build wrote), nothing else', () => {
    storage.setMeta(SUPPS_KEY, JSON.stringify({ [dayKey(D, 'Creatine')]: { future: true }, other: 1 }));
    const before = meta(SUPPS_KEY);
    const undo = food.tickSupp(D, 'Creatine', true);
    expect(JSON.parse(meta(SUPPS_KEY)!)[dayKey(D, 'Creatine')]).toBe(1);
    undo();
    expect(meta(SUPPS_KEY)).toBe(before);

    const u2 = food.setMealPick(D, 'الغدا', 2);
    food.setMealPick(D, 'العشا', 1);
    u2();
    expect(JSON.parse(meta(MEAL_PICKS_KEY)!)).toEqual({ [dayKey(D, 'العشا')]: 1 });
  });

  test('rest day and its undo', () => {
    const undo = food.setRestDay(D, true);
    expect(meta(food.REST_DAY_KEY)).toBe(D);
    undo();
    expect(meta(food.REST_DAY_KEY) || null).toBeNull();
  });

  test('extras: add/remove touch only that day, keep items this build cannot read, and undo restores the exact list', () => {
    const odd = { kind: 'photo', id: 'x' };
    const start = { [D]: [{ name: 'a', kcal: 100, p: 5 }, odd, { name: 'b', kcal: 200, p: 10, brand: 'z' }], '2026-11-10': [{ name: 'old', kcal: 99.6, p: 1 }] };
    storage.setMeta(EXTRAS_KEY, JSON.stringify(start));
    const before = meta(EXTRAS_KEY);

    // «b» is the second item on screen (the unreadable one isn't shown).
    const undo = food.removeExtra(D, 1, parseExtras(before)[D][1])!;
    const after = JSON.parse(meta(EXTRAS_KEY)!);
    expect(after[D]).toEqual([{ name: 'a', kcal: 100, p: 5 }, odd]);
    expect(after['2026-11-10']).toEqual(start['2026-11-10']); // not rounded or rewritten
    undo();
    expect(meta(EXTRAS_KEY)).toBe(before);

    // A stale index never removes the wrong item; gone = nothing to do.
    expect(food.removeExtra(D, 0, { name: 'b', kcal: 200, p: 10 })).not.toBeNull();
    expect(parseExtras(meta(EXTRAS_KEY))[D].map((x) => x.name)).toEqual(['a']);
    expect(food.removeExtra(D, 0, { name: 'zz', kcal: 1, p: 1 })).toBeNull();

    // Adding, then something else added meanwhile: undo takes out only what this added.
    const add = food.addExtra(D, { name: 'c', kcal: 50, p: 2 });
    food.addExtra(D, { name: 'd', kcal: 60, p: 3 });
    add();
    expect(parseExtras(meta(EXTRAS_KEY))[D].map((x) => x.name)).toEqual(['a', 'd']);
  });

  test('removing the last item drops the day', () => {
    food.addExtra(D, { name: 'c', kcal: 50, p: 2 });
    food.removeExtra(D, 0, { name: 'c', kcal: 50, p: 2 });
    expect(JSON.parse(meta(EXTRAS_KEY)!)).toEqual({});
  });
});

// ---- tasks ↔ goal steps ----

function failWrite(key: string) {
  const real = storage.setMeta.bind(storage);
  jest.spyOn(storage, 'setMeta').mockImplementation((k, v) => {
    if (k === key) throw new Error('disk full');
    real(k, v);
  });
}

describe('atomic nesting', () => {
  test('an inner call that throws rolls back only its own writes; the outer one catches and commits its own', () => {
    atomic(() => {
      storage.setMeta('outer1', '1');
      expect(() =>
        atomic(() => {
          storage.setMeta('inner', 'x');
          storage.setMeta('outer1', 'changed');
          throw new Error('inner');
        }),
      ).toThrow('inner');
      storage.setMeta('outer2', '2');
    });
    expect(meta('inner')).toBeNull();
    expect(meta('outer1')).toBe('1');
    expect(meta('outer2')).toBe('2');
  });

  test('after a throw the next call is a real outer one again (commits, and rolls back on its own)', () => {
    expect(() => atomic(() => { storage.setMeta('a', '1'); throw new Error('x'); })).toThrow('x');
    expect(meta('a')).toBeNull();
    expect(atomic(() => { storage.setMeta('b', '1'); return 5; })).toBe(5);
    expect(meta('b')).toBe('1');
    expect(() => atomic(() => { storage.setMeta('c', '1'); throw new Error('y'); })).toThrow('y');
    expect(meta('c')).toBeNull();
  });
});

describe('a write that throws halfway rolls back the ones before it', () => {
  test('atomic: the first key is not left written when the second write fails', () => {
    storage.setMeta('k1', 'before');
    failWrite('k2');
    expect(() => atomic(() => { storage.setMeta('k1', 'after'); storage.setMeta('k2', 'x'); })).toThrow('disk full');
    jest.restoreAllMocks();
    expect(meta('k1')).toBe('before');
    expect(meta('k2')).toBeNull();
  });
});
