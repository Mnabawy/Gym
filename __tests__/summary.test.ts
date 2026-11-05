/// <reference types="jest" />
import { sessionSummary } from '../src/lib/summary';
import type { SetRow } from '../src/lib/storage.types';

const r = (date: string, exId: string, idx: number, kg: number, reps: number, done = 1, weekday = 1): SetRow => ({ date, weekday, exId, idx, kg, reps, done });

const rows: SetRow[] = [
  r('2026-10-27', 'deadlift', 0, 100, 5),
  r('2026-10-27', 'deadlift', 1, 100, 5),
  r('2026-10-27', 'lat-pulldown', 0, 50, 10),
  r('2026-10-29', 'barbell-bench-press', 0, 70, 8, 1, 2), // other program day
  r('2026-11-03', 'deadlift', 0, 110, 5),
  r('2026-11-03', 'deadlift', 1, 105, 5),
  r('2026-11-03', 'lat-pulldown', 0, 50, 10),
  r('2026-11-03', 'lat-pulldown', 1, 50, 10, 0), // not done
];

test('sets, reps, volume, change and records', () => {
  const s = sessionSummary(rows, '2026-11-03', 1);
  expect(s.sets).toBe(3);
  expect(s.reps).toBe(20);
  expect(s.volume).toBe(110 * 5 + 105 * 5 + 500);
  expect(s.prev).toEqual({ date: '2026-10-27', volume: 1500 });
  expect(s.change).toBeCloseTo((1575 - 1500) / 1500);
  expect(s.prs).toEqual(['deadlift']);
});

test('first time: no previous, no records', () => {
  const s = sessionSummary(rows, '2026-10-27', 1);
  expect(s.prev).toBeNull();
  expect(s.change).toBeNull();
  expect(s.prs).toEqual([]);
});

test('swapped days are not records and do not set the bar', () => {
  expect(sessionSummary(rows, '2026-11-03', 1, new Set(['2026-11-03|deadlift'])).prs).toEqual([]);
  // a heavier swapped day before doesn't hide today's record
  const more = [...rows, r('2026-10-30', 'deadlift', 0, 200, 5)];
  expect(sessionSummary(more, '2026-11-03', 1, new Set(['2026-10-30|deadlift'])).prs).toEqual(['deadlift']);
});

test('session length from tick times', () => {
  const T = 1_800_000_000_000;
  const timed = [r('2026-11-10', 'deadlift', 0, 100, 5), r('2026-11-10', 'deadlift', 1, 100, 5), r('2026-11-10', 'deadlift', 2, 100, 5)].map((x, i) => ({ ...x, at: T + i * 150_000 }));
  const s = sessionSummary(timed, '2026-11-10', 1);
  expect(s.minutes).toBe(6); // 5 min between first and last tick + 1
  expect(s.gapSec).toBe(150);
  expect(sessionSummary(rows, '2026-11-03', 1).minutes).toBeNull();
});
