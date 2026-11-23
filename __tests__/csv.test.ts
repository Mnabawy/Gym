/// <reference types="jest" />
import { bodyCsv, cell, setsCsv, toCsv } from '../src/lib/csv';

const lines = (s: string) => s.replace(/^﻿/, '').trim().split('\r\n');

test('cells are quoted only when needed, file starts with a BOM', () => {
  expect(cell('a')).toBe('a');
  expect(cell('a,b')).toBe('"a,b"');
  expect(cell('say "hi"')).toBe('"say ""hi"""');
  expect(cell(null)).toBe('');
  expect(toCsv(['x'], [[1]]).startsWith('﻿x\r\n1')).toBe(true);
});

test('sets: names, 1-based set number, volume only for done sets', () => {
  const csv = setsCsv(
    [
      { date: '2026-11-02', weekday: 1, exId: 'deadlift', idx: 0, kg: 100, reps: 5, done: 1, rir: 2 },
      { date: '2026-11-02', weekday: 1, exId: 'deadlift', idx: 1, kg: 100, reps: 4, done: 0 },
      { date: '2026-11-02', weekday: 1, exId: 'deadlift', idx: 2, kg: null, reps: null, done: 0 },
    ],
    () => 'Deadlift',
    () => 'ظهر',
  );
  const l = lines(csv);
  expect(l).toHaveLength(3); // header + 2 (the empty set is left out)
  expect(l[1]).toBe('2026-11-02,ظهر,Deadlift,1,100,5,أيوه,2,,500');
  expect(l[2]).toBe('2026-11-02,ظهر,Deadlift,2,100,4,لا,,,');
});

test('body: weights and measurements merged by date', () => {
  const l = lines(bodyCsv([{ date: '2026-11-01', kg: 80 }, { date: '2026-11-03', kg: 80.5 }], [{ date: '2026-11-03', waist: 84 }]));
  expect(l[1]).toBe('2026-11-01,80,,,,,,');
  expect(l[2]).toBe('2026-11-03,80.5,84,,,,,');
});
