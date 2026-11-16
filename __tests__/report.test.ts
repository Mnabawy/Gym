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
    waterGoal: () => 3000,
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
  expect(w.meals).toBeCloseTo(3 / 20);
  expect(w.habits).toEqual([]); // 1 Nov (first log; 31 Oct is left out) … 4 Nov; today has no tick yet
});

test('habits in the week: done out of the days that counted', () => {
  const h = { id: 'h1', name: 'ورد', icon: 'book', color: '#1BA6A8', days: [0, 1, 2, 3, 4, 5, 6], remind: null, start: '2026-10-01' };
  const w = weekReport(FROM, TODAY, {
    rows: [], swapped: new Set(), weights: [], checks: [], water: {}, waterGoal: () => 3000, mealsPerDay: 5,
    habits: [h, { ...h, id: 'h2', name: 'جديدة', start: '2026-12-01' }],
    habitLog: { 'h1|2026-10-31': 'done', 'h1|2026-11-01': 'done', 'h1|2026-11-02': 'skip', 'h1|2026-11-04': 'done' },
  });
  // 31 Oct–4 Nov counted (today 5 Nov isn't over): 3 done, 2 Nov excused, 3 Nov missed
  expect(w.habits).toEqual([{ id: 'h1', name: 'ورد', color: '#1BA6A8', done: 3, due: 4 }]);
});

test('volume is compared with the same days of the week before', () => {
  const base = { swapped: new Set<string>(), weights: [], checks: [], water: {}, waterGoal: () => 3000, mealsPerDay: 5 };
  const prevRows = [
    r('2026-10-26', 'deadlift', 0, 100, 5), // Mon of the week before: inside Sat–Thu
    r('2026-10-30', 'deadlift', 0, 100, 10), // Fri of the week before: past Thursday
  ];
  // Today is Thursday 5 Nov: Sat 24 Oct – Thu 29 Oct only
  expect(weekReport(FROM, TODAY, { ...base, rows: prevRows }).prevVolume).toBe(500);
  // A finished week compares with the whole week before
  expect(weekReport(FROM, '2026-11-10', { ...base, rows: prevRows }).prevVolume).toBe(1500);
});

test('water days: a training day needs its own (higher) goal', () => {
  const w = weekReport(FROM, TODAY, {
    rows, swapped: new Set(), weights: [], checks: [], mealsPerDay: 5,
    water: { '2026-11-01': 3000, '2026-11-02': 3000, '2026-11-04': 3500 },
    waterGoal: (d) => (['2026-11-02', '2026-11-04'].includes(d) ? 3500 : 3000), // trained 2 and 4 Nov
  });
  expect(w.waterDays).toBe(2); // 1 Nov (rest) and 4 Nov; 2 Nov fell short of 3.5 L
});
