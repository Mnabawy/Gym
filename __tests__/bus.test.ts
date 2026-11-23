/// <reference types="jest" />
import { AREA, bumpAreas, bumpEverything, flushAreas, metaArea, useDataVersion, versionOf } from '../src/lib/bus';

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

