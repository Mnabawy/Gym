/// <reference types="jest" />
import { dayState, habitStats, isDue, logKey, nextMark, parseHabits, parseLog, type Habit, type Log } from '../src/lib/habits';

// Sun 1 Nov 2026 … ; daily habit and a Sun/Tue/Thu one
const daily: Habit = { id: 'h1', name: 'ورد', icon: 'book', color: '#1BA6A8', days: [0, 1, 2, 3, 4, 5, 6], remind: null, start: '2026-11-01' };
const log = (id: string, marks: Record<string, 'done' | 'skip'>): Log => Object.fromEntries(Object.entries(marks).map(([d, m]) => [logKey(id, d), m]));

test('parse drops broken habits and marks', () => {
  const raw = JSON.stringify([daily, { ...daily }, { ...daily, id: 'x', days: [] }, { ...daily, id: 'y', name: ' ' }, { ...daily, id: 'z', color: 'red', remind: 9999 }]);
  const hs = parseHabits(raw);
  expect(hs.map((h) => h.id)).toEqual(['h1', 'z']);
  expect(hs[1].color).toBe('#1BA6A8');
  expect(hs[1].remind).toBeNull();
  expect(parseLog(JSON.stringify({ 'h1|2026-11-01': 'done', 'h1|2026-11-02': 'nope', 'h1|bad': 'done' }))).toEqual({ 'h1|2026-11-01': 'done' });
});

test('day states', () => {
  const h = { ...daily, days: [0, 2, 4] };
  const l = log('h1', { '2026-11-01': 'done', '2026-11-02': 'done', '2026-11-03': 'skip' });
  const T = '2026-11-05';
  expect(dayState(h, l, '2026-10-31', T)).toBe('before');
  expect(dayState(h, l, '2026-11-01', T)).toBe('done');
  expect(dayState(h, l, '2026-11-02', T)).toBe('done'); // done on a day it wasn't due still counts
  expect(dayState(h, l, '2026-11-03', T)).toBe('skip');
  expect(dayState(h, l, '2026-11-04', T)).toBe('off');
  expect(dayState(h, l, '2026-11-05', T)).toBe('today');
  expect(dayState(h, l, '2026-11-06', T)).toBe('future');
  expect(isDue(h, '2026-11-05')).toBe(true);
  expect(isDue(h, '2026-11-04')).toBe(false);
});

test('one miss keeps the streak, two in a row end it; skips are neutral', () => {
  const T = '2026-11-08';
  // 1,2 done · 3 missed · 4,5 done · 6 skip · 7 done · 8 today (not yet)
  const s = habitStats(daily, log('h1', { '2026-11-01': 'done', '2026-11-02': 'done', '2026-11-04': 'done', '2026-11-05': 'done', '2026-11-06': 'skip', '2026-11-07': 'done' }), T);
  expect(s.streak).toBe(5);
  expect(s.best).toBe(5);
  expect(s.done).toBe(5);
  expect(s.rateAll).toBeCloseTo(5 / 6); // 6 due (skip and today left out)
  expect(s.atRisk).toBe(false);

  // 1,2 done · 3,4 missed → streak ends · 5 done
  const t = habitStats(daily, log('h1', { '2026-11-01': 'done', '2026-11-02': 'done', '2026-11-05': 'done' }), '2026-11-05');
  expect(t.streak).toBe(1);
  expect(t.best).toBe(2);
});

test('at risk after a miss, until today is done', () => {
  const l = log('h1', { '2026-11-01': 'done' });
  expect(habitStats(daily, l, '2026-11-03').atRisk).toBe(true); // 2nd missed, 3rd not done yet
  expect(habitStats(daily, { ...l, [logKey('h1', '2026-11-03')]: 'done' }, '2026-11-03').atRisk).toBe(false);
  expect(habitStats(daily, l, '2026-11-02').atRisk).toBe(false); // nothing missed yet
});

test('per weekday share and formation progress', () => {
  const h = { ...daily, days: [0, 1] }; // Sun, Mon
  const s = habitStats(h, log('h1', { '2026-11-01': 'done', '2026-11-08': 'done', '2026-11-09': 'done' }), '2026-11-10');
  expect(s.byWeekday[0]).toBe(1); // both Sundays
  expect(s.byWeekday[1]).toBe(0.5); // one of two Mondays
  expect(s.byWeekday[3]).toBeNull();
  expect(s.formed).toBe(3);
  expect(s.rate30).toBeCloseTo(3 / 4);
});

test('strength rises with repetitions, a miss lowers it a little', () => {
  const T = '2026-11-28';
  const all: Record<string, 'done'> = {};
  for (let d = 1; d <= 27; d++) all[`2026-11-${String(d).padStart(2, '0')}`] = 'done';
  const full = habitStats(daily, log('h1', all), T).strength;
  expect(full).toBeGreaterThan(0.7); // 27 days with a 13-day half-life ≈ 0.76
  expect(full).toBeLessThan(0.8);
  const oneMiss = { ...all };
  delete oneMiss['2026-11-26'];
  const s = habitStats(daily, log('h1', oneMiss), T).strength;
  expect(s).toBeLessThan(full);
  expect(s).toBeGreaterThan(full * 0.9); // dips, not wiped out
  expect(habitStats(daily, {}, '2026-11-01').strength).toBe(0); // today not done yet doesn't count against it
});

test('cue is kept, trimmed and capped', () => {
  const [h] = parseHabits(JSON.stringify([{ ...daily, cue: '  بعد الفجر في أوضتي  ' }]));
  expect(h.cue).toBe('بعد الفجر في أوضتي');
  expect(parseHabits(JSON.stringify([{ ...daily, cue: '  ' }]))[0].cue).toBeUndefined();
});

test('tap cycles done → skip → nothing', () => {
  expect(nextMark(undefined)).toBe('done');
  expect(nextMark('done')).toBe('skip');
  expect(nextMark('skip')).toBeUndefined();
});
