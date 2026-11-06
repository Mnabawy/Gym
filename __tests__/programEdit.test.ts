/// <reference types="jest" />
import { ALL_EXERCISES, applyPlan, applyProgram, DEFAULT_REST, DEFAULT_SETS, dayFor, exerciseById, PDF_PROGRAM, PROGRAM } from '../src/data/program';
import { exerciseInfo, isPdf, move, newId, parsePast, parseProgram, remember } from '../src/lib/programEdit';

const pdf = () => Object.fromEntries(Object.entries(PDF_PROGRAM).map(([k, v]) => [k, v.map((d) => ({ ...d }))]));
const plan = { sets: {}, restHeavy: DEFAULT_REST.heavy, restNormal: DEFAULT_REST.normal };
afterEach(() => {
  applyProgram(null);
  applyPlan(plan);
});

test('parse keeps valid exercises, drops broken ones, unknown days and repeated ids', () => {
  const ok = { id: 'cable-row', name: 'Cable Row', muscle: 'back', sets: 3, repLow: 8, repHigh: 12, tag: null };
  const raw = JSON.stringify({
    1: [ok, { ...ok, id: 'x', muscle: 'wings' }, { ...ok, id: 'y', repLow: 12, repHigh: 8 }, { ...ok, id: 'z', sets: 0 }, ok],
    4: [ok], // not a program day
    2: [],
  });
  expect(parseProgram(raw)).toEqual({ 1: [{ ...ok, perLeg: false }] });
  expect(parseProgram('nope')).toBeNull();
  expect(parseProgram(null)).toBeNull();
  expect(parseProgram('{}')).toBeNull();
});

test('new ids never clash', () => {
  expect(newId('Cable Row', ['deadlift'])).toBe('cable-row');
  expect(newId('Deadlift', ['deadlift', 'deadlift-2'])).toBe('deadlift-3');
  expect(newId('!!!', [])).toBe('exercise');
});

test('move clamps', () => {
  expect(move([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
  expect(move([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
  expect(move([1, 2, 3], 2, 5)).toEqual([1, 2, 3]);
});

test('isPdf spots an unchanged program', () => {
  expect(isPdf(pdf())).toBe(true);
  const e = pdf();
  e[1] = e[1].slice(1);
  expect(isPdf(e)).toBe(false);
});

test('applyProgram replaces a day everywhere, null brings the PDF back', () => {
  const back = [{ id: 'cable-row', name: 'Cable Row', muscle: 'back' as const, sets: 4, repLow: 8, repHigh: 12, tag: 'heavy' as const }];
  applyProgram({ 1: back });
  applyPlan(plan);
  expect(dayFor(1)!.exercises.map((e) => e.id)).toEqual(['cable-row']);
  expect(exerciseById('deadlift')).toBeUndefined();
  expect(DEFAULT_SETS['cable-row']).toBe(4);
  expect(exerciseById('cable-row')!.restSec).toBe(DEFAULT_REST.heavy);
  expect(dayFor(2)!.exercises.length).toBe(PDF_PROGRAM[2].length); // other days untouched
  applyProgram(null);
  expect(ALL_EXERCISES.length).toBe(Object.values(PDF_PROGRAM).flat().length);
  expect(exerciseById('deadlift')).toBeDefined();
  expect(PROGRAM.length).toBe(5);
});

test('past exercises keep a name and muscle after they leave the program', () => {
  const past = remember(parsePast(null), [{ id: 'cable-row', name: 'Cable Row', muscle: 'back' }]);
  expect(parsePast(JSON.stringify({ ...past, bad: { name: 1 }, worse: { name: 'x', muscle: 'wings' } }))).toEqual(past);
  expect(exerciseInfo('cable-row', ALL_EXERCISES, past)).toEqual({ name: 'Cable Row', muscle: 'back' });
  expect(exerciseInfo('deadlift', ALL_EXERCISES, {})).toEqual({ name: 'Deadlift', muscle: 'back' });
  // a PDF exercise you deleted still has its PDF name
  applyProgram({ 1: [{ id: 'cable-row', name: 'Cable Row', muscle: 'back', sets: 3, repLow: 8, repHigh: 12, tag: null }] });
  expect(exerciseInfo('deadlift', ALL_EXERCISES, {})).toEqual({ name: 'Deadlift', muscle: 'back' });
  expect(exerciseInfo('nope', ALL_EXERCISES, {})).toBeNull();
});

test('light week: half the sets, rounded up, never under one', () => {
  applyPlan({ ...plan, sets: { deadlift: 3, 'lat-pulldown': 1 }, deload: true });
  expect(exerciseById('deadlift')!.sets).toBe(2);
  expect(exerciseById('lat-pulldown')!.sets).toBe(1);
  expect(exerciseById('barbell-bench-press')!.sets).toBe(2); // 4 → 2
});
