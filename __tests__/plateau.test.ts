/// <reference types="jest" />
import { plateau, type PlateauInput } from '../src/lib/plateau';

const bench = { exId: 'barbell-bench-press', name: 'Barbell Bench Press', sessions: 3, down: false };
const ok: PlateauInput = { stuck: [bench], attendance: { done: 12, due: 12 }, meals: 0.9, rate: 0, kg: 80, hardWeeks: 2, lightOn: false };

test('nothing stuck, or a light week already on: nothing to say', () => {
  expect(plateau({ ...ok, stuck: [] })).toBeNull();
  expect(plateau({ ...ok, lightOn: true })).toBeNull();
});

test('many lifts at once, a lift going down, or 6+ hard weeks: fatigue first', () => {
  const three = [bench, { ...bench, exId: 'a', name: 'A' }, { ...bench, exId: 'b', name: 'B' }];
  expect(plateau({ ...ok, stuck: three })?.cause).toBe('fatigue');
  expect(plateau({ ...ok, stuck: [{ ...bench, down: true }] })?.cause).toBe('fatigue');
  const p = plateau({ ...ok, hardWeeks: 7, attendance: { done: 2, due: 12 } })!;
  expect(p.cause).toBe('fatigue');
  expect(p.body).toContain('7 أسابيع');
});

test('then attendance, food, fast weight loss, in that order', () => {
  expect(plateau({ ...ok, attendance: { done: 8, due: 12 }, meals: 0.2 })?.cause).toBe('attendance');
  expect(plateau({ ...ok, attendance: { done: 2, due: 3 } })?.cause).not.toBe('attendance'); // too few sessions to judge
  expect(plateau({ ...ok, meals: 0.5, rate: -2 })?.cause).toBe('food');
  expect(plateau({ ...ok, meals: null, rate: -1 })?.cause).toBe('cut'); // 1 kg a week at 80 kg is over 1%
  expect(plateau({ ...ok, rate: -0.5 })?.cause).toBe('exercise');
});

test('everything else in order: the exercise itself', () => {
  const p = plateau(ok)!;
  expect(p.cause).toBe('exercise');
  expect(p.body).toContain('Barbell Bench Press');
});
