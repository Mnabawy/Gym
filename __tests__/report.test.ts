/// <reference types="jest" />
import { weekReport } from '../src/lib/report';
import type { SetRow } from '../src/lib/storage.types';

const r = (date: string, exId: string, idx: number, kg: number, reps: number, at?: number): SetRow => ({ date, weekday: 1, exId, idx, kg, reps, done: 1, at });
// Week Sat 31 Oct – Fri 6 Nov 2026; today Thu 5 Nov
const FROM = '2026-10-31', TODAY = '2026-11-05';
const T0 = 1_800_000_000_000;
const rows: SetRow[] = [
  r('2026-10-26', 'deadlift', 0, 100, 5), // week before
  r('2026-11-02', 'deadlift', 0, 110, 5, T0),
  r('2026-11-02', 'deadlift', 1, 110, 5, T0 + 30 * 60000),
  r('2026-11-02', 'lat-pulldown', 0, 50, 10),
  r('2026-11-04', 'barbell-bench-press', 0, 80, 5),
];

test('week report', () => {
  const w = weekReport(FROM, TODAY, {
    rows,
    swapped: new Set(),
    weights: [{ date: '2026-10-28', kg: 80 }, { date: '2026-11-03', kg: 80.4 }],
    checks: [{ date: '2026-11-01', meal: 'الفطار' }, { date: '2026-11-02', meal: 'الفطار' }, { date: '2026-11-02', meal: 'الغدا' }],
    water: { '2026-11-02': 3000 },
    waterGoal: 3000,
    mealsPerDay: 5,
  });
  expect(w.to).toBe('2026-11-06');
  expect(w.days).toBe(6);
  expect(w.sessions).toBe(2);
  expect(w.sets).toBe(4);
  expect(w.volume).toBe(110 * 5 * 2 + 500 + 400);
  expect(w.prevVolume).toBe(500);
  expect(w.perMuscle.back).toBe(3);
  expect(w.perMuscle.chest).toBe(1);
  expect(w.prs).toEqual([{ date: '2026-11-02', exId: 'deadlift' }]);
  expect(w.weight).toEqual({ end: 80.4, change: 0.4 });
  expect(w.waterDays).toBe(1);
  expect(w.minutes).toBe(31);
  expect(w.meals).toBeCloseTo(3 / 20); // 1 Nov (first log; 31 Oct is left out) … 4 Nov; today has no tick yet
});
