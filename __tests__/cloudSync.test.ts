/// <reference types="jest" />
import { applyRows, diffRows, isLocalMeta, localRows, mealRow, pushItems, setRow, type Dirty, type Pulled, type Target } from '../src/lib/cloudSync';
import type { SetRow } from '../src/lib/storage.types';

const set = (o: Partial<SetRow> = {}): SetRow => ({ date: '2026-11-01', weekday: 1, exId: 'bench', idx: 0, kg: 60, reps: 8, done: 1, rir: null, at: null, ...o });

function fakeTarget() {
  const sets = new Map<string, SetRow>();
  const meals = new Set<string>();
  const shop = new Set<string>();
  const meta: Record<string, string> = {};
  const t: Target = {
    saveSet: (r) => void sets.set(`${r.date}|${r.exId}|${r.idx}`, r),
    deleteSet: (d, e, i) => void sets.delete(`${d}|${e}|${i}`),
    setMealCheck: (d, m, on) => void (on ? meals.add(`${d}|${m}`) : meals.delete(`${d}|${m}`)),
    setShopCheck: (w, i, on) => void (on ? shop.add(`${w}|${i}`) : shop.delete(`${w}|${i}`)),
    getMeta: (k) => meta[k] ?? null,
    setMeta: (k, v) => void (meta[k] = v),
  };
  return { t, sets, meals, shop, meta };
}
const pulled = (r: ReturnType<typeof setRow>, rev: number): Pulled => ({ ...r, rev });

test('pulled rows land on the phone: sets, meals, shop, meta, deletes', () => {
  const f = fakeTarget();
  f.t.saveSet(set({ idx: 1 }));
  const rows: Pulled[] = [
    pulled(setRow(set(), false, 10), 1),
    pulled(setRow(set({ idx: 1 }), true, 10), 2),
    { kind: 'meal', key: '2026-11-01|breakfast', data: { date: '2026-11-01', meal: 'breakfast' }, deleted: false, updated_at: 10, rev: 3 },
    { kind: 'shop', key: '2026-W44|eggs', data: { week: '2026-W44', item: 'eggs' }, deleted: false, updated_at: 10, rev: 4 },
    { kind: 'meta', key: 'habits', data: '[1]', deleted: false, updated_at: 10, rev: 5 },
  ];
  const r = applyRows(rows, {}, f.t);
  expect(r).toEqual({ changed: true, meta: ['habits'] });
  expect([...f.sets.keys()]).toEqual(['2026-11-01|bench|0']);
  expect(f.sets.get('2026-11-01|bench|0')?.kg).toBe(60);
  expect(f.meals.has('2026-11-01|breakfast')).toBe(true);
  expect(f.shop.has('2026-W44|eggs')).toBe(true);
  expect(f.meta.habits).toBe('[1]');
});

test('a newer change on the phone beats the server; an older one is dropped', () => {
  const f = fakeTarget();
  f.meta.goals = 'mine';
  const dirty: Dirty = { 'meta:goals': { t: 50 }, 'meta:notes': { t: 5 } };
  applyRows(
    [
      { kind: 'meta', key: 'goals', data: 'theirs', deleted: false, updated_at: 40, rev: 1 },
      { kind: 'meta', key: 'notes', data: 'theirs', deleted: false, updated_at: 40, rev: 2 },
    ],
    dirty,
    f.t,
  );
  expect(f.meta.goals).toBe('mine');
  expect(f.meta.notes).toBe('theirs');
  expect(Object.keys(dirty)).toEqual(['meta:goals']);
});

test('the same value again is not a change; phone-only keys are never touched', () => {
  const f = fakeTarget();
  f.meta.water = '{"a":1}';
  const r = applyRows(
    [
      { kind: 'meta', key: 'water', data: '{"a":1}', deleted: false, updated_at: 1, rev: 1 },
      { kind: 'meta', key: 'driveUser', data: 'x@y', deleted: false, updated_at: 1, rev: 2 },
      { kind: 'meta', key: 'sync.session', data: 'x', deleted: false, updated_at: 1, rev: 3 },
    ],
    {},
    f.t,
  );
  expect(r.changed).toBe(false);
  expect(f.meta.driveUser).toBeUndefined();
  expect(isLocalMeta('sync.dirty')).toBe(true);
  expect(isLocalMeta('habits')).toBe(false);
});

test('broken rows are skipped', () => {
  const f = fakeTarget();
  const r = applyRows([{ kind: 'set', key: 'x', data: { date: 1 }, deleted: false, updated_at: 1, rev: 1 }, { kind: 'meal', key: 'y', data: null, deleted: false, updated_at: 1, rev: 2 }], {}, f.t);
  expect(r.changed).toBe(false);
});

test('push: saved rows as they are, meta read now, empty meta = deleted', () => {
  const meta: Record<string, string> = { habits: '[2]', water: '' };
  const dirty: Dirty = { 'set:a': { t: 3, row: setRow(set(), false, 3) }, 'meta:habits': { t: 4 }, 'meta:water': { t: 5 }, 'meta:sync.at': { t: 6 } };
  const items = pushItems(dirty, (k) => meta[k] ?? null);
  expect(items.map((x) => x.id)).toEqual(['set:a', 'meta:habits', 'meta:water']);
  expect(items[1].row).toEqual({ kind: 'meta', key: 'habits', data: '[2]', deleted: false, updated_at: 4 });
  expect(items[2].row.deleted).toBe(true);
});

test('first sync sends everything on the phone except empty and phone-only meta', () => {
  const rows = localRows({ sets: [set()], meals: [{ date: 'd', meal: 'm' }], shop: [{ week: 'w', item: 'i' }], meta: { habits: '[]', water: '', driveUser: 'x', 'sync.on': '1' } }, 7);
  expect(rows.map((r) => `${r.kind}:${r.key}`)).toEqual(['set:2026-11-01|bench|0', 'meal:d|m', 'shop:w|i', 'meta:habits']);
  expect(rows.every((r) => r.updated_at === 7 && !r.deleted)).toBe(true);
});

test('restoring a file: new rows go up, rows that are gone go up as deletes', () => {
  const before = { sets: [set(), set({ idx: 1 })], meals: [{ date: 'd', meal: 'm' }], shop: [], meta: { a: '1', b: '2' } };
  const after = { sets: [set({ kg: 70 })], meals: [], shop: [], meta: { a: '9' } };
  const rows = diffRows(before, after, 9);
  const by = Object.fromEntries(rows.map((r) => [`${r.kind}:${r.key}`, r]));
  expect((by['set:2026-11-01|bench|0'].data as SetRow).kg).toBe(70);
  expect(by['set:2026-11-01|bench|1'].deleted).toBe(true);
  expect(by['meal:d|m'].deleted).toBe(true);
  expect(by['meta:a'].data).toBe('9');
  expect(by['meta:b']).toMatchObject({ deleted: true, data: null });
  expect(mealRow('d', 'm', true, 1).key).toBe('d|m');
});
