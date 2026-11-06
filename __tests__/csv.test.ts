/// <reference types="jest" />
import { bodyCsv, cardioCsv, cell, habitsCsv, setsCsv, toCsv, goalsCsv } from '../src/lib/csv';

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

test('cardio and habits', () => {
  const c = lines(cardioCsv({ '2026-11-02': [{ id: 'a', type: 'walk', minutes: 30, intensity: 'moderate', km: 2.5 }] }, 80));
  expect(c[1]).toBe('2026-11-02,مشي,30,متوسط,2.5,,140');
  const h = { id: 'h', name: 'ورد', icon: 'book', color: '#1BA6A8', days: [0, 1, 2, 3, 4, 5, 6], remind: null, start: '2026-11-01' };
  const l = lines(habitsCsv([h], { 'h|2026-11-01': 'done' }, '2026-11-02'));
  expect(l.slice(1)).toEqual(['2026-11-01,ورد,عملتها', '2026-11-02,ورد,النهارده']);
});

test('goals: progress and finished tasks in date order with a running total', () => {
  const g = {
    id: 'g', name: 'فلوس', icon: 'cash', color: '#000000', unit: '$', start: 100, target: 1000, startDate: '2026-01-01', due: null, why: '',
    stages: [{ id: 's', title: 'أ', tasks: [{ id: 't', title: 'خطوة, أولى', done: '2026-01-02' }, { id: 'u', title: 'لسه', done: null }] }],
    entries: [{ id: 'e', date: '2026-01-03', amount: 50, note: 'شغل' }, { id: 'f', date: '2026-01-01', amount: 10 }],
    wins: [], reviews: [],
  };
  const lines = goalsCsv([g]).replace('﻿', '').trim().split('\r\n');
  expect(lines).toHaveLength(4);
  expect(lines[1]).toBe('فلوس,2026-01-01,تقدّم,,10,110,1000,$');
  expect(lines[2]).toBe('فلوس,2026-01-02,خطوة,"أ: خطوة, أولى",,110,1000,$');
  expect(lines[3]).toBe('فلوس,2026-01-03,تقدّم,شغل,50,160,1000,$');
});
