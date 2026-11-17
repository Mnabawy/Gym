/// <reference types="jest" />
import { AREA, bumpAreas, bumpEverything, flushAreas, metaArea, useDataVersion, versionOf } from '../src/lib/bus';
import { track, untracked } from '../src/lib/track';
import { rowsToSets, type Dump, type Storage } from '../src/lib/storage.types';

function memory(): Storage {
  let S: Dump = { sets: [], meals: [], shop: [], meta: {} };
  return {
    setsFor: (d, e) => rowsToSets(S.sets.filter((r) => r.date === d && r.exId === e)),
    saveSet: (r) => void (S.sets = [...S.sets.filter((x) => !(x.date === r.date && x.exId === r.exId && x.idx === r.idx)), r]),
    lastSession: () => undefined,
    clearDay: (d, ids) => void (S.sets = S.sets.filter((r) => !(r.date === d && ids.includes(r.exId)))),
    deleteSet: () => {},
    transaction: (f) => f(),
    history: () => [],
    doneSetsBetween: () => [],
    sessionDates: () => [],
    trainedDays: () => [],
    allSets: () => S.sets,
    mealChecks: (d) => S.meals.filter((m) => m.date === d).map((m) => m.meal),
    allMealChecks: () => S.meals,
    setMealCheck: (d, m, on) => void (S.meals = [...S.meals.filter((x) => !(x.date === d && x.meal === m)), ...(on ? [{ date: d, meal: m }] : [])]),
    shopChecks: (w) => S.shop.filter((x) => x.week === w).map((x) => x.item),
    setShopCheck: (w, i, on) => void (S.shop = [...S.shop.filter((x) => !(x.week === w && x.item === i)), ...(on ? [{ week: w, item: i }] : [])]),
    clearShop: (w) => void (S.shop = S.shop.filter((x) => x.week !== w)),
    getMeta: (k) => S.meta[k] ?? null,
    setMeta: (k, v) => void (S.meta[k] = v),
    dump: () => ({ sets: [...S.sets], meals: [...S.meals], shop: [...S.shop], meta: { ...S.meta } }),
    restore: (d) => void (S = { sets: [...d.sets], meals: [...d.meals], shop: [...d.shop], meta: { ...d.meta } }),
  };
}

/** Counts how often a subscriber to `areas` would re-render (zustand calls it when its selected value changes). */
function watch(areas: string[]) {
  let calls = 0;
  let last = versionOf(useDataVersion.getState(), areas);
  const off = useDataVersion.subscribe((s) => {
    const v = versionOf(s, areas);
    if (v !== last) calls++;
    last = v;
  });
  return { calls: () => calls, off };
}
const TASKS = metaArea('tasks');

test('a per-key bump only notifies subscribers of that key', () => {
  const tasks = watch([TASKS]);
  const goals = watch([metaArea('goals')]);
  bumpAreas(TASKS);
  flushAreas();
  expect(tasks.calls()).toBe(1);
  expect(goals.calls()).toBe(0);
  tasks.off();
  goals.off();
});

test('bumpAll and bumpEverything notify every subscriber', () => {
  const a = watch([TASKS]);
  const b = watch([AREA.sets]);
  const cards = useDataVersion.getState().cards;
  useDataVersion.getState().bumpAll();
  expect(a.calls()).toBe(1);
  expect(b.calls()).toBe(1);
  expect(useDataVersion.getState().cards).toBe(cards + 1);
  bumpEverything();
  flushAreas();
  expect(a.calls()).toBe(2);
  expect(b.calls()).toBe(2);
  expect(useDataVersion.getState().cards).toBe(cards + 1); // a restore doesn't remount exercise cards on its own
  a.off();
  b.off();
});

test('the global v still goes up on every area bump (screens not migrated yet)', () => {
  const v = useDataVersion.getState().v;
  bumpAreas(AREA.shop);
  flushAreas();
  expect(useDataVersion.getState().v).toBe(v + 1);
});

test('bumps in a row re-render once, a microtask later', async () => {
  const tasks = watch([TASKS, AREA.meals]);
  bumpAreas(TASKS);
  bumpAreas(AREA.meals);
  bumpAreas(TASKS);
  expect(tasks.calls()).toBe(0);
  await Promise.resolve();
  expect(tasks.calls()).toBe(1);
  tasks.off();
});

test('storage writes bump their own area: a set write bumps sets, not meta:tasks', () => {
  const s = track(memory());
  const sets = watch([AREA.sets]);
  const tasks = watch([TASKS]);
  const meals = watch([AREA.meals]);
  const shop = watch([AREA.shop]);
  s.saveSet({ date: '2026-11-01', weekday: 1, exId: 'bench', idx: 0, kg: 60, reps: 8, done: 1 });
  flushAreas();
  expect(sets.calls()).toBe(1);
  expect(tasks.calls()).toBe(0);
  s.setMeta('tasks', '[]');
  flushAreas();
  expect(tasks.calls()).toBe(1);
  expect(sets.calls()).toBe(1);
  // The same value again: nothing changed, nothing re-renders.
  s.setMeta('tasks', '[]');
  flushAreas();
  expect(tasks.calls()).toBe(1);
  s.setMealCheck('2026-11-01', 'breakfast', true);
  s.setShopCheck('w', 'eggs', true);
  flushAreas();
  expect([meals.calls(), shop.calls(), sets.calls(), tasks.calls()]).toEqual([1, 1, 1, 1]);
  s.clearDay('2026-11-01', ['bench']);
  s.clearShop('w');
  flushAreas();
  expect([sets.calls(), shop.calls()]).toEqual([2, 2]);
  for (const w of [sets, tasks, meals, shop]) w.off();
});

test('a restore notifies everything', () => {
  const s = track(memory());
  const tasks = watch([TASKS]);
  const sets = watch([AREA.sets]);
  s.restore({ sets: [], meals: [], shop: [], meta: { tasks: '[]' } });
  flushAreas();
  expect(tasks.calls()).toBe(1);
  expect(sets.calls()).toBe(1);
  tasks.off();
  sets.off();
});

test('a store write with its own bump() raises v once, not twice', async () => {
  await Promise.resolve(); // earlier bumps settled
  const s = track(memory());
  const v = useDataVersion.getState().v;
  s.setMeta('goals', '[1]');
  useDataVersion.getState().bump();
  flushAreas();
  expect(useDataVersion.getState().v).toBe(v + 1);
  await Promise.resolve();
  // Later, a write on its own still raises v (the earlier bump doesn't hide it).
  s.setMeta('goals', '[2]');
  flushAreas();
  expect(useDataVersion.getState().v).toBe(v + 2);
});

test('a sync-only flush does not raise v', async () => {
  await Promise.resolve();
  const sync = watch([AREA.sync]);
  const v = useDataVersion.getState().v;
  bumpAreas(AREA.sync);
  flushAreas();
  expect(sync.calls()).toBe(1);
  expect(useDataVersion.getState().v).toBe(v);
  sync.off();
});

test('a sync.* write through the tracked storage bumps the sync area and its meta key', () => {
  const s = track(memory());
  const sync = watch([AREA.sync]);
  const key = watch([metaArea('sync.at')]);
  const tasks = watch([TASKS]);
  s.setMeta('sync.at', '123');
  flushAreas();
  expect([sync.calls(), key.calls(), tasks.calls()]).toEqual([1, 1, 0]);
  for (const w of [sync, key, tasks]) w.off();
});

test('an untracked restore (wiping the phone) still notifies every area', () => {
  const s = track(memory());
  const tasks = watch([TASKS]);
  const shop = watch([AREA.shop]);
  untracked(() => s.restore({ sets: [], meals: [], shop: [], meta: {} }));
  flushAreas();
  expect([tasks.calls(), shop.calls()]).toEqual([1, 1]);
  tasks.off();
  shop.off();
});

test('a rolled-back transaction leaves the data as it was (one extra render at most)', () => {
  const base = memory();
  // A storage whose transaction rolls back on a throw, like SQLite.
  const rollback: Storage = {
    ...base,
    transaction: (f) => {
      const before = base.dump();
      try {
        f();
      } catch (e) {
        base.restore(before);
        throw e;
      }
    },
  };
  const s = track(rollback);
  s.setMeta('tasks', '["a"]');
  flushAreas();
  const tasks = watch([TASKS]);
  expect(() =>
    s.transaction(() => {
      s.setMeta('tasks', '["b"]');
      throw new Error('boom');
    }),
  ).toThrow('boom');
  flushAreas();
  expect(s.getMeta('tasks')).toBe('["a"]');
  expect(tasks.calls()).toBeLessThanOrEqual(1);
  // A real change afterwards still notifies.
  const before = tasks.calls();
  s.setMeta('tasks', '["c"]');
  flushAreas();
  expect(tasks.calls()).toBe(before + 1);
  expect(s.getMeta('tasks')).toBe('["c"]');
  tasks.off();
});
