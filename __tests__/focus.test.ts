/// <reference types="jest" />
import { CATCH_UP_MS, clock, DEFAULT_CFG, finish, focused, IDLE, minAr, minutesBetween, minutesOn, parseCfg, parseSessions, parseState, pause, remaining, reset, start, streak, week, type Cfg, type Session } from '../src/lib/focus';

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
  const r = finish(start({ ...IDLE }, a, 0), a, 25 * M + 900, true, 'x', D);
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

describe('auto-start after the app was closed (catch-up)', () => {
  const a: Cfg = { ...DEFAULT_CFG, auto: true };
  // Replays what the page does on open: tick until nothing is due any more.
  const catchUp = (s0: ReturnType<typeof start>, now: number) => {
    let s = s0;
    const logged: Session[] = [];
    for (let i = 0; i < 50 && s.endAt != null && now >= s.endAt; i++) {
      const r = finish(s, a, now, true, `s${i}`, D);
      if (r.session) logged.push(r.session);
      s = r.state;
    }
    return { s, logged };
  };

  test('hours later: only the block that ran is logged, nothing chained, focus waits idle', () => {
    const { s, logged } = catchUp(start({ ...IDLE }, a, 0), 5 * 60 * M);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ min: 25, end: 25 * M });
    expect(s).toMatchObject({ phase: 'focus', endAt: null, left: null, round: 1 });
  });

  test('back while the break still runs: the break goes on, then stops before the next focus block', () => {
    const r = finish(start({ ...IDLE }, a, 0), a, 27 * M, true, 'x', D);
    expect(r.session).toMatchObject({ min: 25 });
    expect(r.state).toMatchObject({ phase: 'short', endAt: 30 * M });
    // That break ending on time (page open) starts focus as usual.
    expect(finish(r.state, a, 30 * M + 1000, true, 'y', D).state).toMatchObject({ phase: 'focus', endAt: 55 * M });
  });

  test('a break that ended long ago does not start a focus block', () => {
    const brk = { ...start({ ...IDLE, phase: 'short' as const }, a, 0) };
    const r = finish(brk, a, 2 * 60 * M, true, 'z', D);
    expect(r.session).toBeNull();
    expect(r.state).toMatchObject({ phase: 'focus', endAt: null });
  });

  test('just inside the grace window still chains', () => {
    const r = finish(start({ ...IDLE }, a, 0), a, 25 * M + CATCH_UP_MS, true, 'x', D);
    expect(r.state.endAt).toBe(30 * M);
  });
});

test('a block that ends after midnight counts on the day it ended', () => {
  // Local-time day of a ms timestamp, like the store's dateKey(new Date(ms)).
  const dayOf = (ms: number) => {
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const t0 = new Date(2026, 10, 8, 23, 50).getTime();
  const s = start({ ...IDLE }, DEFAULT_CFG, t0);
  const r = finish(s, DEFAULT_CFG, t0 + 26 * M, true, 'm', dayOf);
  expect(r.session).toMatchObject({ date: '2026-11-09', end: t0 + 25 * M });
  // Skipped before midnight stays on the first day.
  expect(finish(s, DEFAULT_CFG, t0 + 5 * M, false, 'n', dayOf).session).toMatchObject({ date: '2026-11-08', min: 5 });
});
