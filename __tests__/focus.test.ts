/// <reference types="jest" />
import { clock, DEFAULT_CFG, finish, focused, IDLE, minAr, minutesBetween, minutesOn, parseCfg, parseSessions, parseState, pause, remaining, reset, start, streak, week, type Cfg, type Session } from '../src/lib/focus';

const M = 60_000;
const c: Cfg = { ...DEFAULT_CFG, every: 2 };
const D = '2026-11-08';

test('a focus block: start, pause, resume, on time logs its full length and goes to a break', () => {
  let s = start({ ...IDLE, kind: 'study', task: 'فصل 3' }, c, 0);
  expect(remaining(s, c, 10 * M)).toBe(15 * M);
  s = pause(s, 10 * M);
  expect(remaining(s, c, 99 * M)).toBe(15 * M);
  expect(focused(s, 99 * M)).toBe(10 * M);
  s = start(s, c, 20 * M);
  expect(s.endAt).toBe(35 * M);
  expect(focused(s, 30 * M)).toBe(20 * M);
  const r = finish(s, c, 36 * M, true, 'a', D);
  expect(r.session).toEqual({ id: 'a', kind: 'study', start: 0, end: 35 * M, min: 25, date: D, task: 'فصل 3' });
  expect(r.state).toMatchObject({ phase: 'short', round: 1, endAt: null, left: null, kind: 'study', task: 'فصل 3' });
});

test('long break every N blocks, then focus again; skipping early logs whole minutes only', () => {
  let s = { ...IDLE, round: 1 };
  s = start(s, c, 0);
  let r = finish(s, c, 25 * M, true, 'a', D);
  expect(r.state).toMatchObject({ phase: 'long', round: 0 });
  r = finish(start(r.state, c, 30 * M), c, 31 * M, false, 'b', D);
  expect(r.session).toBeNull();
  expect(r.state.phase).toBe('focus');
  // Skipped after 7.5 minutes: 7 minutes logged, and it counts toward the round.
  r = finish(start(r.state, c, 0), c, 7.5 * M, false, 'c', D);
  expect(r.session).toMatchObject({ min: 7 });
  expect(r.state).toMatchObject({ phase: 'short', round: 1 });
  // Skipped under a minute: nothing logged, no round.
  r = finish(start({ ...IDLE }, c, 0), c, 30_000, false, 'd', D);
  expect(r.session).toBeNull();
  expect(r.state).toMatchObject({ phase: 'short', round: 0 });
});

test('auto starts the next phase where the last one ended; reset goes back to the full phase', () => {
  const a = { ...c, auto: true };
  const r = finish(start({ ...IDLE }, a, 0), a, 40 * M, true, 'x', D);
  expect(r.state).toMatchObject({ phase: 'short', endAt: 30 * M });
  const z = reset(pause(start({ ...IDLE }, c, 0), 5 * M));
  expect(remaining(z, c, 0)).toBe(25 * M);
  expect(z.spent).toBe(0);
});

test('stats and parsing', () => {
  const ss: Session[] = [
    { id: '1', kind: 'work', start: 0, end: 1, min: 25, date: D },
    { id: '2', kind: 'study', start: 0, end: 1, min: 50, date: D },
    { id: '3', kind: 'work', start: 0, end: 1, min: 25, date: '2026-11-07' },
    { id: '4', kind: 'work', start: 0, end: 1, min: 25, date: '2026-11-05' },
  ];
  expect(minutesOn(ss, D)).toBe(75);
  expect(week(ss, D).map((d) => d.min)).toEqual([0, 0, 0, 25, 0, 25, 75]);
  expect(streak(ss, D)).toBe(2);
  expect(streak(ss, '2026-11-09')).toBe(2);
  expect(streak(ss, '2026-11-10')).toBe(0);
  expect(minutesBetween(ss, '2026-11-02', D)).toEqual({ work: 75, study: 50 });
  expect(minAr(45)).toBe('45 د');
  expect(minAr(125)).toBe('2:05 س');
  expect(clock(24 * M + 59_001)).toBe('25:00');
  expect(clock(61_000)).toBe('01:01');
  expect(parseCfg('{"focus":500,"short":0,"auto":true}')).toEqual({ focus: 120, short: 1, long: 15, every: 4, auto: true });
  expect(parseCfg('x')).toEqual(DEFAULT_CFG);
  expect(parseState('{"phase":"long","kind":"study","endAt":5}')).toMatchObject({ phase: 'long', kind: 'study', endAt: 5, left: null });
  expect(parseSessions(JSON.stringify([...ss, { id: '1' }, { id: '9', min: 0, date: D, start: 0, end: 0 }])).map((x) => x.id)).toEqual(['1', '2', '3', '4']);
});
