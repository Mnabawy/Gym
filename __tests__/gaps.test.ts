/// <reference types="jest" />
import { dayFor } from '../src/data/program';
import { weekdayOf } from '../src/lib/logic';
import type { SetRow } from '../src/lib/storage.types';
import { addDays, analyze, ctxOf, dayInfo, daysBetween, prSet, dueDates, exerciseAdherence, planSets, toSessions, trendOf, weekStart, weeksSinceLight } from '../src/lib/gaps';

const TODAY = '2026-11-04'; // Wednesday

/** All sets of a program day ticked, unless told otherwise. */
function day(date: string, o: { weekday?: number; skip?: string[]; sets?: Record<string, number>; kg?: Record<string, number> } = {}): SetRow[] {
  const weekday = o.weekday ?? weekdayOf(date);
  return dayFor(weekday)!.exercises.flatMap((e) =>
    o.skip?.includes(e.id)
      ? []
      : Array.from({ length: o.sets?.[e.id] ?? e.sets }, (_, idx) => ({ date, weekday, exId: e.id, idx, kg: o.kg?.[e.id] ?? 50, reps: 8, done: 1 })),
  );
}

/** Every program day from `from` to `to`, fully done. */
function block(from: string, to: string): SetRow[] {
  const out: SetRow[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) if (dayFor(weekdayOf(d))) out.push(...day(d));
  return out;
}

describe('dates', () => {
  test('addDays, weekStart, daysBetween', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(weekStart(TODAY)).toBe('2026-10-31'); // Saturday
    expect(weekStart('2026-10-31')).toBe('2026-10-31');
    expect(weekStart('2026-10-30')).toBe('2026-10-24'); // Friday → previous Saturday
    expect(daysBetween('2026-10-31', TODAY)).toBe(4);
  });
  test('planned sets per day and muscle', () => {
    expect(planSets(1)).toBe(17);
    expect(planSets(5, 'shoulders')).toBe(11);
    expect(planSets(4)).toBe(0); // Thursday rest
    expect(planSets(6)).toBe(0); // Saturday: the old quads day, a rest day since the leg days became one
  });
});

describe('sessions and due dates', () => {
  test('sessions group sets per date and exercise', () => {
    const s = toSessions([
      { date: '2026-11-02', weekday: 1, exId: 'deadlift', idx: 0, kg: 100, reps: 5, done: 1 },
      { date: '2026-11-02', weekday: 1, exId: 'deadlift', idx: 1, kg: 110, reps: 3, done: 0 },
    ]);
    expect(s).toHaveLength(1);
    expect(s[0].done).toBe(1);
    expect(s[0].e1rm).toBe(121); // 110 × (1 + 3/30), untick sets still count for strength
  });
  test('due dates start at the first session and skip today until you train', () => {
    const rows = day('2026-10-26');
    const c = ctxOf(toSessions(rows), TODAY);
    expect(dueDates('2026-10-20', TODAY, c)).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-30', '2026-11-02', '2026-11-03']);
    const c2 = ctxOf(toSessions([...rows, ...day(TODAY)]), TODAY);
    expect(dueDates('2026-10-20', TODAY, c2)).toContain(TODAY);
    expect(dueDates('2026-10-20', TODAY, ctxOf([], TODAY))).toEqual([]);
  });
});

describe('lift trends', () => {
  test('cases', () => {
    expect(trendOf([]).trend).toBe('none');
    expect(trendOf([100, 105]).trend).toBe('new');
    expect(trendOf([100, 102, 104]).trend).toBe('up');
    expect(trendOf([100, 104, 103]).trend).toBe('steady');
    expect(trendOf([100, 104, 103, 104, 102])).toMatchObject({ trend: 'stalled', sinceBest: 3 }); // matching the best isn't a new best
    expect(trendOf([100, 110, 104, 103])).toMatchObject({ trend: 'down', sinceBest: 2 });
    expect(trendOf([100, 110, 108, 103]).trend).toBe('steady'); // one bad session is noise
  });
});

describe('gaps report', () => {
  // Started Mon 26 Oct. Missed Fri 30 Oct and Tue 3 Nov. Today (Wed) not trained yet.
  const rows = [...day('2026-10-26'), ...day('2026-10-27'), ...day('2026-10-28'), ...day('2026-11-02')];
  const r = analyze(rows, TODAY);

  test('missed sessions: 6 plan days owed (26 Oct → yesterday), 4 trained', () => {
    expect(r.attendance).toEqual({ due: 6, done: 4 });
  });
  test('muscle volume against the plan', () => {
    expect(r.volume.shoulders).toEqual({ done: 6, planned: 17 });
    expect(r.volume.triceps).toEqual({ done: 0, planned: 8 });
    expect(r.volume.back).toEqual({ done: 28, planned: 28 });
  });
  test('gaps are ranked: big ones first', () => {
    expect(r.gaps.map((g) => [g.kind, g.level, 'muscle' in g ? g.muscle : ''])).toEqual([
      ['day', 2, ''], // 2 of 6 missed ≥ a quarter
      ['volume', 2, 'triceps'],
      ['volume', 2, 'shoulders'],
      ['volume', 1, 'chest'],
      ['volume', 1, 'biceps'],
    ]);
    expect(r.gaps[0]).toEqual({ kind: 'day', level: 2, missed: 2, due: 6 });
  });
  test('score = share of planned sets done', () => {
    expect(r.score).toBeCloseTo(71 / 108); // back 17 + chest 18 + legs 19 + back 17 of 17 + 18 + 19 + 19 + 17 + 18
    expect(r.tracked).toBe(10);
    expect(r.grid).toHaveLength(6);
    expect(r.grid[5].start).toBe('2026-10-31');
    expect(r.grid[5].vol.back).toEqual({ done: 14, planned: 14 });
    expect(r.grid[0].vol.back).toEqual({ done: 0, planned: 0 }); // before tracking
  });
  test('no data → no score, no gaps', () => {
    const e = analyze([], TODAY);
    expect(e.score).toBeNull();
    expect(e.gaps).toEqual([]);
  });
});

describe('exercise gaps', () => {
  test('skipped and short exercises', () => {
    const rows = [
      ...day('2026-10-26', { skip: ['straight-arm-pulldown'], sets: { deadlift: 1 } }),
      ...day('2026-11-02', { skip: ['straight-arm-pulldown'], sets: { deadlift: 1 } }),
    ];
    expect(exerciseAdherence(toSessions(rows))['straight-arm-pulldown']).toEqual({ times: 2, skipped: 2, avg: 0 });
    const g = analyze(rows, TODAY).gaps;
    expect(g).toContainEqual({ kind: 'skipped', level: 2, exId: 'straight-arm-pulldown', times: 2 });
    expect(g).toContainEqual({ kind: 'short', level: 1, exId: 'deadlift', avg: 1, sets: 3 });
  });
  test('one skip is noise, two is a habit', () => {
    const rows = [
      ...day('2026-10-19'),
      ...day('2026-10-26', { skip: ['straight-arm-pulldown'] }),
      ...day('2026-11-02'),
    ];
    expect(analyze(rows, TODAY).gaps.some((g) => g.kind === 'skipped' || g.kind === 'short')).toBe(false);
    const twice = [...day('2026-10-19', { skip: ['straight-arm-pulldown'] }), ...day('2026-10-26', { skip: ['straight-arm-pulldown'] }), ...day('2026-11-02')];
    expect(analyze(twice, TODAY).gaps).toContainEqual({ kind: 'skipped', level: 1, exId: 'straight-arm-pulldown', times: 2 });
  });
  test('training on a rest day counts as a session', () => {
    // Mon 26 trained, Thu 29 (a rest day) trained; owed Mon, Tue, Wed, Fri up to yesterday.
    const r = analyze([...day('2026-10-26'), ...day('2026-10-29', { weekday: 2 })], '2026-10-31');
    expect(r.attendance).toEqual({ due: 4, done: 2 });
    expect(r.gaps).toContainEqual({ kind: 'day', level: 2, missed: 2, due: 4 });
  });
  test('one missed day in four weeks is a small gap', () => {
    // Every plan day (Mon, Tue, Wed, Fri) from Fri 9 Oct (first session) to yesterday — 15 of them — except Tue 20 Oct.
    const rows = block('2026-10-08', '2026-11-03').filter((x) => x.date !== '2026-10-20');
    expect(analyze(rows, TODAY).gaps.find((g) => g.kind === 'day')).toEqual({ kind: 'day', level: 1, missed: 1, due: 15 });
  });
  test('stalled and dropping lifts, only when trained recently', () => {
    const mondays = ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02'];
    const kgs = [100, 110, 104, 103, 103];
    const rows = mondays.flatMap((d, i) => day(d, { kg: { deadlift: kgs[i] } }));
    const r = analyze(rows, TODAY);
    expect(r.trends.deadlift.trend).toBe('down'); // 103 is 6% under 110
    expect(r.gaps.find((g) => g.kind === 'down')).toMatchObject({ exId: 'deadlift', level: 2 });
    expect(r.trends['lat-pulldown'].trend).toBe('stalled'); // 50 kg every time
    const stalled = r.gaps.filter((g) => g.kind === 'stalled');
    expect(stalled).toHaveLength(1); // grouped into one item
    expect(stalled[0]).toMatchObject({ exIds: expect.arrayContaining(['lat-pulldown', 'barbell-row']) });
    expect(analyze(rows, '2026-12-31').gaps.some((g) => g.kind === 'down' || g.kind === 'stalled')).toBe(false);
  });
});

describe('light week reminder', () => {
  test('counts full weeks since the last light or missed week', () => {
    const rows = block('2026-09-12', '2026-10-30'); // 7 full weeks
    expect(weeksSinceLight(toSessions(rows), ctxOf(toSessions(rows), TODAY))).toBe(7);
    expect(analyze(rows, TODAY).gaps).toContainEqual({ kind: 'deload', level: 1, weeks: 7 });
    const holiday = rows.filter((x) => x.date < '2026-10-17' || x.date > '2026-10-23');
    expect(weeksSinceLight(toSessions(holiday), ctxOf(toSessions(holiday), TODAY))).toBe(1);
  });
});

describe('calendar days', () => {
  const rows = [...day('2026-10-26', { sets: { deadlift: 1, 'lat-pulldown': 1, 'barbell-row': 1 } }), ...day('2026-10-27')];
  const sess = toSessions(rows);
  const c = ctxOf(sess, TODAY);
  const on = (d: string) => sess.filter((s) => s.date === d);
  test('overall: done, partial, missed, upcoming, rest', () => {
    expect(dayInfo('2026-10-27', on('2026-10-27'), c)).toEqual({ status: 'done', done: 18, planned: 18, partial: false });
    expect(dayInfo('2026-10-26', on('2026-10-26'), c)).toMatchObject({ status: 'done', done: 11, planned: 17, partial: true });
    expect(dayInfo('2026-10-28', [], c)).toMatchObject({ status: 'missed', planned: 19 }); // legs
    expect(dayInfo(TODAY, [], c).status).toBe('upcoming');
    expect(dayInfo('2026-10-29', [], c).status).toBe('off'); // Thursday rest
    expect(dayInfo('2026-10-19', [], c).status).toBe('off'); // before the first session
  });
  test('one muscle', () => {
    expect(dayInfo('2026-10-26', on('2026-10-26'), c, 'back')).toMatchObject({ status: 'done', done: 8, planned: 14, partial: true });
    expect(dayInfo('2026-10-26', on('2026-10-26'), c, 'shoulders')).toMatchObject({ status: 'done', partial: false });
    expect(dayInfo('2026-10-27', on('2026-10-27'), c, 'back').status).toBe('off'); // trained, but not back, and back isn't planned Tuesday
    expect(dayInfo('2026-10-30', [], c, 'shoulders').status).toBe('missed');
    expect(dayInfo('2026-11-06', [], c, 'shoulders').status).toBe('upcoming');
  });
  test('personal records', () => {
    const more = toSessions([...rows, ...day('2026-11-02', { kg: { deadlift: 60 } }), ...day('2026-11-03', { kg: { 'barbell-bench-press': 40 } })]);
    const pr = prSet(more);
    expect(pr.has('2026-11-02|deadlift')).toBe(true);
    expect(pr.has('2026-11-02|lat-pulldown')).toBe(false); // same weight isn't a record
    expect(pr.has('2026-11-03|barbell-bench-press')).toBe(false); // went down
    expect(pr.has('2026-10-26|deadlift')).toBe(false); // first session
  });
});
