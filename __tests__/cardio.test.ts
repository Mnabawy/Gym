/// <reference types="jest" />
import { cardioKcal, cardioWeek, metOf, parseCardio, whoMinutes, type Cardio } from '../src/lib/cardio';

const walk: Cardio = { id: 'a', type: 'walk', minutes: 30, intensity: 'moderate' };
const run: Cardio = { id: 'b', type: 'run', minutes: 20, intensity: 'moderate', km: 3.2 };

test('parse keeps valid sessions', () => {
  const raw = JSON.stringify({ '2026-11-02': [walk, { ...walk, id: 'x', type: 'fly' }, { ...walk, id: 'y', minutes: 0 }, { ...run, km: -1 }], bad: [walk] });
  expect(parseCardio(raw)).toEqual({ '2026-11-02': [walk, { ...run, km: undefined }].map((c) => JSON.parse(JSON.stringify(c))) });
  expect(parseCardio('oops')).toEqual({});
});

test('METs, calories and WHO minutes', () => {
  expect(metOf(walk)).toBe(3.5);
  expect(cardioKcal(walk, 80)).toBe(140); // 3.5 × 80 × 0.5
  expect(whoMinutes(walk)).toBe(30); // moderate
  expect(whoMinutes(run)).toBe(40); // vigorous counts double
  expect(whoMinutes({ ...walk, intensity: 'easy' })).toBe(0); // 2.8 METs: light
});

test('a week of cardio', () => {
  const w = cardioWeek({ '2026-10-31': [walk], '2026-11-03': [run, { ...walk, id: 'c', steps: 4000 }], '2026-11-07': [walk] }, '2026-10-31', 80);
  expect(w).toEqual({ minutes: 80, who: 100, kcal: 140 + Math.round(9.8 * 80 / 3) + 140, sessions: 3, km: 3.2, steps: 4000 });
});
