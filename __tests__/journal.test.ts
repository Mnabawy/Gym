/// <reference types="jest" />
import { adherence, dayKey, extrasTotal, foodHistory, isDaySwap, lastFor, parseExtras, parseMap, waterDaysMet, waterGoalMl } from '../src/lib/journal';

const set = (kg: number | null, reps: number | null, done = true) => ({ kg, reps, done });

test('parseMap keeps only the right type', () => {
  expect(parseMap('{"a":"x","b":2,"c":""}', 'string')).toEqual({ a: 'x' });
  expect(parseMap('{"a":"x","b":2}', 'number')).toEqual({ b: 2 });
  expect(parseMap('[1]', 'number')).toEqual({});
  expect(parseMap('oops', 'string')).toEqual({});
});

test('isDaySwap: only the cleared day and its exercises', () => {
  const ids = ['deadlift', 'lat-pulldown'];
  expect(isDaySwap(dayKey('2026-11-03', 'deadlift'), '2026-11-03', ids)).toBe(true);
  expect(isDaySwap(dayKey('2026-11-03', 'barbell-bench-press'), '2026-11-03', ids)).toBe(false); // another day's exercise
  expect(isDaySwap(dayKey('2026-11-04', 'deadlift'), '2026-11-03', ids)).toBe(false); // another date
});

test('water days: each day against its own goal (training needs +0.5 L)', () => {
  const days = [
    { date: '2026-11-01', water: 3000 }, // rest: met
    { date: '2026-11-02', water: 3000 }, // training: short of 3.5 L
    { date: '2026-11-03', water: 3500 }, // training: met
  ];
  const training = new Set(['2026-11-02', '2026-11-03']);
  expect(waterDaysMet(days, (d) => waterGoalMl(null, training.has(d)))).toBe(2);
});

test('lastFor: same variant only', () => {
  const hist = [
    { date: '2026-10-01', sets: [set(100, 5)] },
    { date: '2026-10-08', sets: [set(120, 5)] }, // swapped to Trap Bar Deadlift
    { date: '2026-10-10', sets: [set(null, null, false)] }, // empty
  ];
  const swaps = { [dayKey('2026-10-08', 'deadlift')]: 'Trap Bar Deadlift' };
  expect(lastFor(hist, '2026-10-15', 'deadlift', swaps, null)).toEqual([set(100, 5)]);
  expect(lastFor(hist, '2026-10-15', 'deadlift', swaps, 'Trap Bar Deadlift')).toEqual([set(120, 5)]);
  expect(lastFor(hist, '2026-10-15', 'deadlift', swaps, 'Rack Pull')).toBeUndefined();
  expect(lastFor(hist, '2026-10-01', 'deadlift', swaps, null)).toBeUndefined(); // strictly before
});

test('water goal', () => {
  expect(waterGoalMl(null, false)).toBe(3000);
  expect(waterGoalMl(2.9, true)).toBe(3400);
});

test('food history starts at the first log and counts meals and water', () => {
  const checks = [
    { date: '2026-11-02', meal: 'الفطار' },
    { date: '2026-11-02', meal: 'الغدا' },
    { date: '2026-11-04', meal: 'الفطار' },
  ];
  const h = foodHistory(checks, { '2026-11-03': 2000 }, '2026-11-05', 14);
  expect(h).toEqual([
    { date: '2026-11-02', meals: 2, water: 0 },
    { date: '2026-11-03', meals: 0, water: 2000 },
    { date: '2026-11-04', meals: 1, water: 0 },
    { date: '2026-11-05', meals: 0, water: 0 },
  ]);
  // today without a tick doesn't count yet: (2 + 0 + 1) / 15
  expect(adherence(h, 5, '2026-11-05')).toBeCloseTo(3 / 15);
  expect(foodHistory([], {}, '2026-11-05')).toEqual([]);
  expect(adherence([], 5, '2026-11-05')).toBeNull();
});

test('extras keep valid entries and round', () => {
  const raw = JSON.stringify({ '2026-11-05': [{ name: 'شاورما', kcal: 650.4, p: 30.6 }, { name: 'x', kcal: -1, p: 0 }, { name: 2, kcal: 1, p: 1 }], bad: [{ name: 'y', kcal: 1, p: 1 }] });
  expect(parseExtras(raw)).toEqual({ '2026-11-05': [{ name: 'شاورما', kcal: 650, p: 31 }] });
  expect(extrasTotal([{ name: 'a', kcal: 100, p: 5 }, { name: 'b', kcal: 50, p: 2 }])).toEqual({ kcal: 150, p: 7 });
  expect(parseExtras('oops')).toEqual({});
});

test('parseExtras keeps big entries instead of dropping them', () => {
  const raw = JSON.stringify({ '2026-11-01': [{ name: 'وليمة', kcal: 6000, p: 700 }] });
  expect(parseExtras(raw)['2026-11-01']).toEqual([{ name: 'وليمة', kcal: 6000, p: 700 }]);
});
