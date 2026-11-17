/// <reference types="jest" />
// Store actions (one write path per area): the food tab's writes (src/lib/foodStore.ts), ticking a task or a goal's
// step with the other side following (src/lib/goalTaskStore.ts), and the multi-key task writes (src/lib/taskStore.ts).
// Real storage (storage.ts, with its all-or-nothing transaction and the sync tracking wrapper) on Node's built-in
// SQLite (test-utils/nodeSqlite.ts), so a write that throws halfway really rolls back.
jest.mock('../src/lib/storage', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const fs = require('fs') as typeof import('fs');
  const os = require('os') as typeof import('os');
  const path = require('path') as typeof import('path');
  const { loadNativeStorage } = require('../test-utils/nodeSqlite') as typeof import('../test-utils/nodeSqlite');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainy-stores-'));
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
// eslint-disable-next-line import/first
import { tickStep, tickTask, stepsIntoTasks } from '../src/lib/goalTaskStore';
// eslint-disable-next-line import/first
import { findStep, GOALS_KEY, type Goal } from '../src/lib/goals';
// eslint-disable-next-line import/first
import { readGoals, saveGoal } from '../src/lib/goalStore';
// eslint-disable-next-line import/first
import { TASKS_KEY, TRASH_KEY, type Task } from '../src/lib/tasks';
// eslint-disable-next-line import/first
import { deleteTask, readTasks, readTrash, restoreTask, saveTask, writeTasks } from '../src/lib/taskStore';

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

const goal = (): Goal => ({
  id: 'g1', name: 'هدف', icon: 'cash', color: '#3E9A68', unit: '$', start: 0, target: 100, startDate: '2026-11-01', due: null, why: '',
  stages: [{ id: 's1', title: 'مرحلة', tasks: [{ id: 'st1', title: 'خطوة', done: null }, { id: 'st2', title: 'تانية', done: null }] }],
  entries: [], wins: [], reviews: [],
});
const task = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: id, due: D, time: null, priority: 3, subs: [], repeat: null, remind: false, done: null, created: D, ...extra });
const stepDone = (id: string) => findStep(readGoals()[0], id)!.done;
const taskDone = (id: string) => readTasks().find((t) => t.id === id)?.done ?? null;

function setup() {
  saveGoal(goal());
  writeTasks([task('t1', { goal: { goal: 'g1', step: 'st1' } }), task('t2')]);
}

describe('tickTask / tickStep', () => {
  test('ticking a linked task ticks its step; undo puts both back and keeps edits made meanwhile', () => {
    setup();
    const undo = tickTask('t1', D, 'new');
    expect(taskDone('t1')).toBe(D);
    expect(stepDone('st1')).toBe(D);
    saveGoal({ ...readGoals()[0], name: 'اسم جديد' }); // edited (or synced) meanwhile
    saveTask(task('t3'));
    undo();
    expect(taskDone('t1')).toBeNull();
    expect(stepDone('st1')).toBeNull();
    expect(readGoals()[0].name).toBe('اسم جديد');
    expect(readTasks().map((t) => t.id)).toEqual(['t1', 't2', 't3']);
  });

  test('a repeating task linked to a goal: the step stays, a done copy is added and the task moves on; undo puts it back', () => {
    saveGoal(goal());
    writeTasks([task('r', { repeat: 'daily', goal: { goal: 'g1', step: 'st1' } })]);
    const goalsBefore = meta(GOALS_KEY);
    const tasksBefore = meta(TASKS_KEY);
    const undo = tickTask('r', D, 'copy');
    expect(meta(GOALS_KEY)).toBe(goalsBefore);
    const list = readTasks();
    expect(list.map((t) => t.id)).toEqual(['r', 'copy']);
    expect(list[0]).toMatchObject({ done: null, due: '2026-11-18' });
    expect(list[1]).toMatchObject({ done: D, from: 'r', repeat: null });
    undo();
    expect(meta(TASKS_KEY)).toBe(tasksBefore);
    expect(meta(GOALS_KEY)).toBe(goalsBefore);
  });

  test('a plain task touches no goal', () => {
    setup();
    const goalsBefore = meta(GOALS_KEY);
    const tasksBefore = meta(TASKS_KEY);
    const undo = tickTask('t2', D, 'new');
    expect(meta(GOALS_KEY)).toBe(goalsBefore);
    undo();
    expect(meta(TASKS_KEY)).toBe(tasksBefore);
  });

  test('ticking a step ticks its task (on and off); undo puts both back', () => {
    setup();
    const goalsBefore = meta(GOALS_KEY);
    const tasksBefore = meta(TASKS_KEY);
    const undo = tickStep('g1', 'st1', D)!;
    expect(stepDone('st1')).toBe(D);
    expect(taskDone('t1')).toBe(D);
    undo();
    expect(meta(GOALS_KEY)).toBe(goalsBefore);
    expect(meta(TASKS_KEY)).toBe(tasksBefore);

    tickStep('g1', 'st1', D);
    tickStep('g1', 'st1', D); // off again
    expect(stepDone('st1')).toBeNull();
    expect(taskDone('t1')).toBeNull();
  });

  test('a step without a task, or a goal that is gone: nothing else changes', () => {
    setup();
    const tasksBefore = meta(TASKS_KEY);
    tickStep('g1', 'st2', D);
    expect(meta(TASKS_KEY)).toBe(tasksBefore);
    const before = meta(GOALS_KEY);
    expect(tickStep('nope', 'st1', D)).toBeNull();
    expect(tickStep('g1', 'gone', D)).toBeNull();
    expect(meta(GOALS_KEY)).toBe(before);
  });

  test('steps into tasks and undo', () => {
    setup();
    const g = readGoals()[0];
    const before = meta(TASKS_KEY);
    const { made, undo } = stepsIntoTasks([{ goal: g, stage: g.stages[0], step: g.stages[0].tasks[1], date: D }], D, 'work', (i) => `m${i}`);
    expect(made).toBe(1);
    expect(readTasks().find((t) => t.id === 'm0')).toMatchObject({ space: 'work', goal: { goal: 'g1', step: 'st2' } });
    undo();
    expect(meta(TASKS_KEY)).toBe(before);
  });
});

// ---- all or nothing ----

/** Makes the write of `key` throw (a full disk, say), once. */
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
  test('tickTask: the task is not left ticked when the step write fails', () => {
    setup();
    const tasksBefore = meta(TASKS_KEY);
    failWrite(GOALS_KEY);
    expect(() => tickTask('t1', D, 'new')).toThrow('disk full');
    jest.restoreAllMocks();
    expect(meta(TASKS_KEY)).toBe(tasksBefore);
    expect(stepDone('st1')).toBeNull();
  });

  test('tickStep: the step is not left ticked when the task write fails', () => {
    setup();
    const goalsBefore = meta(GOALS_KEY);
    failWrite(TASKS_KEY);
    expect(() => tickStep('g1', 'st1', D)).toThrow('disk full');
    jest.restoreAllMocks();
    expect(meta(GOALS_KEY)).toBe(goalsBefore);
  });

  test('deleteTask: nothing goes to the trash when the list write fails; restoreTask likewise', () => {
    setup();
    failWrite(TASKS_KEY);
    expect(() => deleteTask('t2')).toThrow('disk full');
    jest.restoreAllMocks();
    expect(meta(TRASH_KEY)).toBeNull();
    expect(readTasks().map((t) => t.id)).toEqual(['t1', 't2']);

    deleteTask('t2');
    expect(readTrash().map((x) => x.task.id)).toEqual(['t2']);
    const trashBefore = meta(TRASH_KEY);
    failWrite(TRASH_KEY);
    expect(() => restoreTask('t2')).toThrow('disk full');
    jest.restoreAllMocks();
    expect(meta(TRASH_KEY)).toBe(trashBefore);
    expect(readTasks().map((t) => t.id)).toEqual(['t1']);
    restoreTask('t2');
    expect(readTasks().map((t) => t.id)).toEqual(['t1', 't2']);
    expect(readTrash()).toEqual([]);
  });
});
