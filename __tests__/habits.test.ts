/// <reference types="jest" />
import { dayState, groupHabits, habitStats, isDue, logKey, nextMark, parseHabits, parseLog, parsePartsLog, partRates, partsDone, pausedNow, phaseFill, phaseOf, prayerTime, refAr, togglePart, togglePause, type Habit, type Log, type PartsLog } from '../src/lib/habits';
import { MY_HABITS } from '../src/data/habitTemplates';

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

test('three stretches on the way to 66', () => {
  expect(phaseOf(0)).toBe(0);
  expect(phaseOf(22)).toBe(1); // first stretch full: on to the second
  expect(phaseOf(21)).toBe(0);
  expect(phaseOf(44)).toBe(2);
  expect(phaseOf(66)).toBe(3);
  expect(phaseFill(0)).toEqual([0, 0, 0]);
  expect(phaseFill(33)).toEqual([1, 0.5, 0]);
  expect(phaseFill(70)).toEqual([1, 1, 1]);
});

test('pausing: paused days are neither done nor missed, and resuming closes the stretch', () => {
  let h: Habit = daily;
  h = togglePause(h, '2026-11-03'); // pause from the 3rd
  expect(pausedNow(h)).toBe(true);
  expect(isDue(h, '2026-11-04')).toBe(false);
  h = togglePause(h, '2026-11-07'); // resume on the 7th: paused 3–6
  expect(h.pauses).toEqual([{ from: '2026-11-03', to: '2026-11-06' }]);
  expect(pausedNow(h)).toBe(false);
  expect(dayState(h, {}, '2026-11-05', '2026-11-08')).toBe('paused');
  expect(dayState(h, {}, '2026-11-07', '2026-11-08')).toBe('missed');
  // 1,2 done · 3–6 paused · 7 missed · 8 today: one miss, streak goes on
  const s = habitStats(h, log('h1', { '2026-11-01': 'done', '2026-11-02': 'done' }), '2026-11-08');
  expect(s.streak).toBe(2);
  expect(s.rateAll).toBeCloseTo(2 / 3);
  // pausing and resuming the same day leaves nothing behind
  expect(togglePause(togglePause(daily, '2026-11-05'), '2026-11-05').pauses).toEqual([]);
  expect(parseHabits(JSON.stringify([{ ...daily, pauses: [{ from: '2026-11-03', to: null }, { from: 'x', to: null }] }]))[0].pauses).toEqual([{ from: '2026-11-03', to: null }]);
});

test('tap cycles done → skip → nothing', () => {
  expect(nextMark(undefined)).toBe('done');
  expect(nextMark('done')).toBe('skip');
  expect(nextMark('skip')).toBeUndefined();
});

describe('parts, groups and prayer-linked reminders', () => {
  const salah: Habit = { ...daily, id: 's', name: 'الصلوات الخمس', group: 'الصلاة', parts: [{ name: 'الفجر' }, { name: 'الضهر' }, { name: 'العصر' }, { name: 'المغرب' }, { name: 'العشا' }] };

  test('parse keeps group, parts and the prayer reminder', () => {
    const [h] = parseHabits(JSON.stringify([{ ...salah, at: { prayer: 'sunrise', offset: 20 }, parts: [{ name: 'الفجر', at: { prayer: 'fajr', offset: 10 } }, { name: '' }, { name: 'x', at: { prayer: 'noon', offset: 1 } }] }]));
    expect(h.group).toBe('الصلاة');
    expect(h.at).toEqual({ prayer: 'sunrise', offset: 20 });
    expect(h.parts).toEqual([{ name: 'الفجر', at: { prayer: 'fajr', offset: 10 } }, { name: 'x' }]);
    expect(parsePartsLog(JSON.stringify({ 's|2026-11-01': [0, 2, 2, 99], 's|bad': [1] }))).toEqual({ 's|2026-11-01': [0, 2] });
  });

  test('the day is done when every part is, and undone when one is taken back', () => {
    let log: Log = {};
    let parts: PartsLog = {};
    const D = '2026-11-02';
    for (let i = 0; i < 4; i++) {
      const r = togglePart(salah, log, parts, D, i);
      expect(r.mark).toBeUndefined();
      parts = { ...parts, [logKey('s', D)]: r.done };
    }
    const last = togglePart(salah, log, parts, D, 4);
    expect(last.mark).toBe('done');
    log = { [logKey('s', D)]: 'done' };
    // a done day counts as all parts; taking one back undoes the day
    expect(partsDone(salah, log, {}, D)).toEqual([0, 1, 2, 3, 4]);
    const back = togglePart(salah, log, {}, D, 0);
    expect(back).toEqual({ mark: undefined, done: [1, 2, 3, 4] });
  });

  test('which part you miss most', () => {
    const log: Log = { [logKey('s', '2026-11-01')]: 'done' };
    const parts: PartsLog = { [logKey('s', '2026-11-02')]: [1, 2, 3, 4], [logKey('s', '2026-11-03')]: [1, 2, 3] };
    // 1–3 Nov counted (today the 4th isn't): Fajr only on the 1st
    const r = partRates(salah, log, parts, '2026-11-04', 30);
    expect(r[0]).toBeCloseTo(1 / 3);
    expect(r[1]).toBe(1);
    expect(r[4]).toBeCloseTo(2 / 3);
  });

  test('groups keep list order, ungrouped last', () => {
    const g = groupHabits([{ group: 'العلم' }, { group: undefined }, { group: 'الصلاة' }, { group: 'العلم' }]);
    expect(g.map((x) => [x.group, x.items.length])).toEqual([['العلم', 2], ['الصلاة', 1], [null, 1]]);
  });

  test('prayer time with an offset, and its label', () => {
    const cairo = { lat: 30.04, lng: 31.24 };
    const t = prayerTime({ prayer: 'sunrise', offset: 20 }, '2026-11-05', cairo, 'egyptian')!;
    expect(t.getDate()).toBe(5);
    expect(refAr({ prayer: 'isha', offset: 90 }, { fajr: 'الفجر', sunrise: 'الشروق', dhuhr: 'الضهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشا' })).toBe('بعد العشا بـ 90 دقيقة');
  });
});

test('ready-made habits are all valid', () => {
  const list = MY_HABITS.map((t, i) => ({ ...t, id: `t${i}`, start: '2026-11-01' }));
  expect(parseHabits(JSON.stringify(list))).toHaveLength(MY_HABITS.length);
  expect(MY_HABITS.find((h) => h.name.startsWith('السنن'))!.parts).toHaveLength(5); // 2+4+2+2+2 = 12 rak'ahs
});
