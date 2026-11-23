/// <reference types="jest" />
import type { Exercise } from '../src/data/program';
import { recentFor, dayKey } from '../src/lib/journal';
import type { SetEntry } from '../src/lib/logic';
import { firstTimeHint, progressChip, progressFor, progressWhy, toStep } from '../src/lib/progression';

const ex: Exercise = { id: 'bench', name: 'Bench Press', muscle: 'chest', sets: 3, repLow: 6, repHigh: 10, tag: null, restSec: 90 } as Exercise;
const s = (kg: number | null, reps: number | null, rir?: number): SetEntry => ({ kg, reps, done: true, ...(rir != null ? { rir } : {}) });
const same = (kg: number, reps: number, rir?: number) => [s(kg, reps, rir), s(kg, reps, rir), s(kg, reps, rir)];
const nums = (p: ReturnType<typeof progressFor>) => p?.sets.map((x) => [x.kg, x.reps]);

test('first time: nothing to go on', () => {
  expect(progressFor(ex, [], 2.5, false)).toBeNull();
  expect(progressFor(ex, [[s(null, null)]], 2.5, false)).toBeNull();
});

test('top of the range on every set: add a step, back to the bottom', () => {
  const p = progressFor(ex, [same(60, 10)], 2.5, false);
  expect(p?.kind).toBe('up');
  expect(p?.why).toBe('top');
  expect(nums(p)).toEqual([[62.5, 6], [62.5, 6], [62.5, 6]]);
  expect(progressChip(p, 2.5)).toBe('+2.5 ↑');
});

test('RIR 3+ in the range: too light, add a step', () => {
  const p = progressFor(ex, [same(60, 7, 3)], 2.5, false);
  expect(p?.kind).toBe('up');
  expect(p?.why).toBe('easy');
  expect(progressWhy(p!, ex, 2.5).title).toBe('زوّد 2.5 كجم');
});

test('in the range: one more rep per set, capped at the top', () => {
  const p = progressFor(ex, [[s(60, 8), s(60, 10), s(60, 7)]], 2.5, false);
  expect(p?.kind).toBe('reps');
  expect(nums(p)).toEqual([[60, 9], [60, 10], [60, 8]]);
  expect(progressChip(p, 2.5)).toBe('+1 تكرار');
});

test('pyramid: each set keeps its own weight', () => {
  const p = progressFor(ex, [[s(60, 10), s(65, 10), s(70, 10)]], 2.5, false);
  expect(nums(p)).toEqual([[62.5, 6], [67.5, 6], [72.5, 6]]);
});

test('below the range once: hold the weight, aim for the bottom', () => {
  const p = progressFor(ex, [same(80, 4), same(77.5, 7)], 2.5, false);
  expect(p?.kind).toBe('hold');
  expect(nums(p)).toEqual([[80, 6], [80, 6], [80, 6]]);
  expect(progressChip(p, 2.5)).toBeNull();
});

test('below the range twice at the same weight: drop ~10%, rounded to the step', () => {
  const p = progressFor(ex, [same(80, 4), same(80, 5)], 2.5, false);
  expect(p?.kind).toBe('down');
  expect(nums(p)).toEqual([[72.5, 6], [72.5, 6], [72.5, 6]]);
  expect(progressChip(p, 2.5)).toBe('خفّف ↓');
});

test('light week: repeat last time', () => {
  const p = progressFor(ex, [same(60, 10)], 2.5, true);
  expect(p?.kind).toBe('same');
  expect(nums(p)).toEqual([[60, 10], [60, 10], [60, 10]]);
  expect(progressChip(p, 2.5)).toBeNull();
});

test('fewer sets last time: the missing ones repeat the last worked set', () => {
  const p = progressFor(ex, [[s(60, 8), s(60, 7)]], 2.5, false);
  expect(nums(p)).toEqual([[60, 9], [60, 8], [60, 8]]);
});

test('bodyweight at the top: repeat (no weight to add)', () => {
  const p = progressFor(ex, [same(0, 10)], 2.5, false);
  expect(p?.kind).toBe('same');
  expect(nums(p)).toEqual([[0, 10], [0, 10], [0, 10]]);
});

test('toStep rounds to the weight step', () => {
  expect(toStep(72, 2.5)).toBe(72.5);
  expect(toStep(71, 2.5)).toBe(70);
  expect(toStep(-3, 2.5)).toBe(0);
});

test('recentFor: newest first, same variant, strictly before the date', () => {
  const hist = [
    { date: '2026-10-01', sets: [s(100, 5)] },
    { date: '2026-10-05', sets: [s(105, 5)] },
    { date: '2026-10-08', sets: [s(120, 5)] }, // swapped
    { date: '2026-10-12', sets: [s(110, 5)] },
  ];
  const swaps = { [dayKey('2026-10-08', 'deadlift')]: 'Trap Bar Deadlift' };
  expect(recentFor(hist, '2026-10-12', 'deadlift', swaps, null, 2)).toEqual([[s(105, 5)], [s(100, 5)]]);
  expect(recentFor(hist, '2026-10-20', 'deadlift', swaps, 'Trap Bar Deadlift', 2)).toEqual([[s(120, 5)]]);
});

test('first time on an exercise: start where you could do 2–3 more than the top of the range', () => {
  expect(firstTimeHint(ex)).toContain('10 تكرار');
});
