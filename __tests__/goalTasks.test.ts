/// <reference types="jest" />
import { stepFollows, stepsBetween, stepsToTasks, taskFollows, taskFor } from '../src/lib/goalTasks';
import { parseTasks, type Task } from '../src/lib/tasks';
import type { Goal } from '../src/lib/goals';

// A goal from 1 Nov to 31 Dec: three steps; the schedule spreads them (or uses a date you set).
const g: Goal = {
  id: 'g', name: 'شراكة', icon: 'rocket', color: '#5B7FE0', unit: '', start: 0, target: 1, startDate: '2026-11-01', due: '2026-12-31', why: '',
  stages: [{ id: 's', title: 'أ', tasks: [
    { id: 'a', title: 'صفحة تعريف', done: null, due: '2026-11-22' },
    { id: 'b', title: 'بروفايل', done: null, due: '2026-12-03' },
    { id: 'c', title: 'خلصت', done: '2026-11-05', due: '2026-11-06' },
  ] }],
  entries: [], wins: [], reviews: [],
};
const parked: Goal = { ...g, id: 'p', later: '2026-11-10' };
const big: Goal = { ...g, id: 'u', umbrella: true };

test('steps in a stretch of days: open ones of running goals, by date', () => {
  expect(stepsBetween([g], '2026-11-15', '2026-11-30').map((p) => p.step.id)).toEqual(['a']);
  expect(stepsBetween([g], '2026-11-01', '2026-12-31').map((p) => [p.step.id, p.date])).toEqual([['a', '2026-11-22'], ['b', '2026-12-03']]); // the done one is left out
  expect(stepsBetween([g, parked, big], '2026-11-01', '2026-12-31').every((p) => p.goal.id === 'g')).toBe(true);
  // A goal without a due date and no dates on its steps plans nothing.
  const noDates: Goal = { ...g, due: null, stages: [{ id: 's', title: 'أ', tasks: [{ id: 'x', title: 'x', done: null }] }] };
  expect(stepsBetween([noDates], '2026-01-01', '2027-01-01')).toEqual([]);
});

test('steps become linked tasks, once each, never born late', () => {
  const steps = stepsBetween([g], '2026-11-01', '2026-12-31');
  const made = stepsToTasks(steps, [], '2026-11-25', 'work', (i) => `t${i}`);
  expect(made.map((t) => [t.title, t.due, t.space, t.goal])).toEqual([
    ['صفحة تعريف', '2026-11-25', 'work', { goal: 'g', step: 'a' }], // planned for the 22nd, already past → today
    ['بروفايل', '2026-12-03', 'work', { goal: 'g', step: 'b' }],
  ]);
  expect(stepsToTasks(steps, made, '2026-11-25', 'work', (i) => `n${i}`)).toEqual([]); // already tasks
  expect(taskFor(made, 'g', 'b')?.id).toBe('t1');
  // The link survives saving.
  expect(parseTasks(JSON.stringify(made))[0].goal).toEqual({ goal: 'g', step: 'a' });
  expect(parseTasks(JSON.stringify([{ ...made[0], goal: { goal: 1 } }]))[0].goal).toBeUndefined();
});

test('ticking one ticks the other', () => {
  const task: Task = stepsToTasks(stepsBetween([g], '2026-11-01', '2026-11-30'), [], '2026-11-20', 'personal', () => 't')[0];
  const done = { ...task, done: '2026-11-21' };
  expect(stepFollows([g], done)!.stages[0].tasks[0].done).toBe('2026-11-21');
  expect(stepFollows([g], task)).toBeNull(); // already open: nothing to change
  expect(stepFollows([g], { ...done, goal: undefined })).toBeNull();
  expect(taskFollows([task], 'g', 'a', '2026-11-21')![0].done).toBe('2026-11-21');
  expect(taskFollows([done], 'g', 'a', null)![0].done).toBeNull();
  expect(taskFollows([task], 'g', 'b', '2026-11-21')).toBeNull();
});
