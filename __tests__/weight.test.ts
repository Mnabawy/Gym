/// <reference types="jest" />
import { addWeighIn, parseWeights, rateBand, rateVerdict, removeWeighIn, weeklyRate } from '../src/lib/weight';

test('parse keeps valid weigh-ins in date order, one per day', () => {
  const raw = JSON.stringify([{ date: '2026-11-03', kg: 82 }, { date: '2026-11-01', kg: 81.5 }, { date: 'x', kg: 80 }, { date: '2026-11-02', kg: 900 }, { date: '2026-11-03', kg: 82.4 }]);
  expect(parseWeights(raw)).toEqual([{ date: '2026-11-01', kg: 81.5 }, { date: '2026-11-03', kg: 82.4 }]);
  expect(parseWeights('nope')).toEqual([]);
  expect(parseWeights(null)).toEqual([]);
});

test('add replaces the same day and rounds to 0.1', () => {
  let l = addWeighIn([], '2026-11-02', 82.04);
  l = addWeighIn(l, '2026-11-01', 81);
  l = addWeighIn(l, '2026-11-02', 82.36);
  expect(l).toEqual([{ date: '2026-11-01', kg: 81 }, { date: '2026-11-02', kg: 82.4 }]);
  expect(removeWeighIn(l, '2026-11-01')).toEqual([{ date: '2026-11-02', kg: 82.4 }]);
});

test('weekly rate: least squares over the last 4 weeks', () => {
  // +0.1 kg every 2 days = +0.35 kg a week
  const l = Array.from({ length: 11 }, (_, i) => ({ date: `2026-10-${String(10 + i * 2).padStart(2, '0')}`, kg: 80 + i * 0.1 }));
  expect(weeklyRate(l, '2026-10-30')).toBeCloseTo(0.35, 2);
  // too close together
  expect(weeklyRate([{ date: '2026-10-29', kg: 80 }, { date: '2026-10-30', kg: 81 }], '2026-10-30')).toBeNull();
  // old entries are ignored
  expect(weeklyRate([{ date: '2026-01-01', kg: 70 }, { date: '2026-10-30', kg: 81 }], '2026-10-30')).toBeNull();
});

test('verdict against the goal band', () => {
  expect(rateBand('bulk', 80)).toEqual([0.25, 0.5]);
  expect(rateBand('cut', 80)).toEqual([-0.8, -0.4]);
  expect(rateVerdict(0.3, 'bulk', 80).level).toBe('ok');
  expect(rateVerdict(0.1, 'bulk', 80).level).toBe('slow');
  expect(rateVerdict(0.9, 'bulk', 80).level).toBe('fast');
  expect(rateVerdict(-0.2, 'cut', 80).level).toBe('slow');
  expect(rateVerdict(-1.2, 'cut', 80).level).toBe('fast');
  expect(rateVerdict(0, 'maintain', 80).level).toBe('ok');
});
