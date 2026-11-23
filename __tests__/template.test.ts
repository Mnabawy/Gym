/// <reference types="jest" />
import { ALL_EXERCISES, applyBase, applyProgram, BASE_PROGRAM, dayFor, dayTitle, PAST_DAYS, PLAN_WEEKDAYS, PROGRAM, type Template } from '../src/data/program';
import { parseProgram } from '../src/lib/programEdit';
import { nextDayId, parsePastDays, parseTemplate } from '../src/lib/template';
import { after, currentWorkout } from '../src/lib/schedule';

const def = (id: string, muscle = 'chest') => ({ id, name: id, muscle, sets: 3, repLow: 8, repHigh: 12, tag: null, perLeg: false });
const tpl: Template = {
  days: [
    { id: 100, titleAr: 'جسم كامل أ', exercises: [def('leg-press', 'quads') as never, def('barbell-bench-press') as never] },
    { id: 101, titleAr: 'جسم كامل ب', exercises: [def('lat-pulldown', 'back') as never] },
  ],
  weekdays: [5, 1, 3],
  goal: 'muscle',
  level: 'beginner',
};

afterEach(() => {
  applyBase(null);
  applyProgram(null);
});

test('parseTemplate keeps valid days, drops broken ones', () => {
  expect(parseTemplate(null)).toBeNull();
  expect(parseTemplate('{oops')).toBeNull();
  expect(parseTemplate(JSON.stringify({ days: [] }))).toBeNull();
  const raw = JSON.stringify({
    ...tpl,
    days: [...tpl.days, { id: 3, titleAr: 'PDF id', exercises: [def('x')] }, { id: 102, titleAr: 'repeat', exercises: [def('leg-press')] }],
  });
  const t = parseTemplate(raw)!;
  expect(t.days.map((d) => d.id)).toEqual([100, 101]);
  expect(t.weekdays).toEqual([1, 3, 5]);
});

test('applyBase puts a generated plan everywhere, null brings the PDF back', () => {
  applyBase(tpl);
  applyProgram(null);
  expect(PROGRAM.map((d) => d.weekday)).toEqual([100, 101]);
  expect(dayFor(100)!.exercises.map((e) => e.id)).toEqual(['leg-press', 'barbell-bench-press']);
  expect(ALL_EXERCISES.length).toBe(3);
  expect(PLAN_WEEKDAYS).toEqual([1, 3, 5]);
  expect(after(101)).toBe(100);
  expect(currentWorkout([], '2026-11-23').id).toBe(100);
  // edits only apply to the base's days
  expect(parseProgram(JSON.stringify({ 1: [def('deadlift', 'back')], 101: [def('cable-row', 'back')] }))).toEqual({ 101: [def('cable-row', 'back')] });
  expect(Object.keys(BASE_PROGRAM)).toEqual(['100', '101']);

  applyBase(null);
  applyProgram(null);
  expect(PROGRAM.map((d) => d.weekday)).toEqual([1, 2, 3, 5]);
  expect(PLAN_WEEKDAYS).toEqual([1, 2, 3, 5]);
});

test('old days keep their names; new day ids never reuse old ones', () => {
  expect(parsePastDays(JSON.stringify({ 100: 'جسم كامل أ', x: 'no', 101: 5 }))).toEqual({ 100: 'جسم كامل أ' });
  expect(nextDayId({}, [1, 2, 3, 5])).toBe(100);
  expect(nextDayId({ 100: 'a', 104: 'b' }, [102])).toBe(105);
  PAST_DAYS[100] = 'جسم كامل أ';
  expect(dayTitle(100)).toBe('جسم كامل أ');
  delete PAST_DAYS[100];
});
