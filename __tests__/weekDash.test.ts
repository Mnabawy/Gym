/// <reference types="jest" />
import { boost, scoreLabel, weekDash, type DashInput } from '../src/lib/weekDash';
import type { SetRow } from '../src/lib/storage.types';
import type { Task } from '../src/lib/tasks';

const r = (date: string, exId: string, idx: number, kg: number, reps: number): SetRow => ({ date, weekday: 1, exId, idx, kg, reps, done: 1 });
// Week Sat 31 Oct – Fri 6 Nov 2026; today Thu 5 Nov
const FROM = '2026-10-31', TODAY = '2026-11-05';

const base: DashInput = {
  rows: [
    r('2026-10-26', 'deadlift', 0, 100, 5), // week before
    r('2026-11-02', 'deadlift', 0, 100, 5),
    r('2026-11-02', 'deadlift', 1, 100, 5),
    r('2026-11-04', 'barbell-bench-press', 0, 80, 5),
  ],
  checks: [
    { date: '2026-11-01', meal: 'الفطار' },
    { date: '2026-11-02', meal: 'الفطار' },
    { date: '2026-11-02', meal: 'الغدا' },
  ],
  water: { '2026-11-02': 3000 },
  waterGoal: () => 3000,
  mealsPerDay: 5,
  target: 4,
};

test('score: training pro rata; food is not scored (only compared, not even listed)', () => {
  const w = weekDash(FROM, TODAY, base);
  expect(w.end).toBe(TODAY);
  // 6 days in → the plan expects ceil(4 × 6 / 7) = 4 sessions; 2 done = 0.5. Meals and water are left out.
  expect(w.pillars).toEqual([{ key: 'workouts', share: 0.5 }]);
  expect(w.score).toBe(50);
  // Same days of the week before: one session of the 4 expected.
  expect(w.prevScore).toBe(25);
});

test('metrics compare with the same days of the week before (no meals or water)', () => {
  const w = weekDash(FROM, TODAY, base);
  const m = Object.fromEntries(w.metrics.map((x) => [x.key, x]));
  expect(Object.keys(m)).toEqual(['workouts', 'volume']);
  expect(m.workouts).toMatchObject({ value: 2, prev: 1, delta: 100, trend: 'up' });
  expect(m.workouts.days).toEqual([0, 0, 2, 0, 1, 0, null]);
  expect(m.volume).toMatchObject({ value: 1400, prev: 500, delta: 180 });
  expect(m.workouts.prevAvg).toBeCloseTo(1 / 6);
});

test('a ring per day; the days still to come are empty', () => {
  const w = weekDash(FROM, TODAY, base);
  expect(w.rings.map((x) => x.date)).toEqual(['2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']);
  expect(w.rings[6]).toEqual({ date: '2026-11-06', share: null, trained: false });
  // Mon 2 Nov: a workout and nothing else tracked = full.
  expect(w.rings[2]).toMatchObject({ trained: true, share: 1 });
  expect(w.rings[3].share).toBe(0);
});

test('tasks, focus and steps', () => {
  const task = (id: string, done: string): Task => ({ id, title: id, due: null, time: null, priority: 4, subs: [], repeat: null, remind: false, done, created: done }) as unknown as Task;
  const w = weekDash(FROM, TODAY, {
    ...base,
    tasks: [task('a', '2026-11-01'), task('b', '2026-11-03'), task('c', '2026-10-25')],
    focus: [{ id: 'f1', kind: 'work', start: 0, end: 0, min: 25, date: '2026-11-03' }],
    steps: { '2026-11-01': 9000, '2026-11-02': 5000, '2026-10-26': 7000 },
  });
  const m = Object.fromEntries(w.metrics.map((x) => [x.key, x]));
  expect(m.tasks).toMatchObject({ value: 2, prev: 1, delta: 100 });
  expect(m.focus).toMatchObject({ value: 25, prev: 0, delta: null, trend: null });
  expect(m.steps).toMatchObject({ value: 7000, prev: 7000, delta: 0, trend: 'flat' });
  // Steps: 1 of 2 synced days at 8,000.
  expect(w.pillars.find((p) => p.key === 'steps')).toEqual({ key: 'steps', share: 0.5 });
});

test('a whole week with nothing logged has no score and no metrics', () => {
  const w = weekDash('2026-12-05', '2026-12-20', { ...base, rows: [], checks: [], water: {} });
  expect(w.end).toBe('2026-12-11');
  expect(w.score).toBeNull();
  expect(w.metrics).toEqual([]);
});

test('score labels', () => {
  expect(scoreLabel(90)).toBe('أسبوع ممتاز');
  expect(scoreLabel(70)).toBe('أسبوع كويس');
  expect(scoreLabel(55)).toBe('أسبوع نص نص');
  expect(scoreLabel(10)).toBe('محتاج تشد حيلك');
});

describe('«أهم ٣» in the score', () => {
  const task = (id: string, extra: Partial<Task>): Task => ({ id, title: id, due: null, time: null, priority: 3, subs: [], repeat: null, remind: false, done: null, created: FROM, ...extra });
  const tasks = [
    task('a', { top: '2026-11-03', done: '2026-11-03' }),
    task('b', { top: '2026-11-03', done: '2026-11-03' }),
    task('c', { top: '2026-11-03' }),
    task('d', { top: '2026-11-04', done: '2026-11-05' }), // done the next day: doesn't count for its day
    task('e', { top: TODAY }), // today, nothing done yet: today not counted
  ];
  it('is the share of picks done on their day, over the days you picked', () => {
    const w = weekDash(FROM, TODAY, { ...base, tasks });
    expect(w.pillars.find((p) => p.key === 'top')?.share).toBeCloseTo(2 / 4);
    expect(w.rings.find((d) => d.date === '2026-11-03')).toBeTruthy();
  });
  it('no picks all week = not tracked', () => {
    expect(weekDash(FROM, TODAY, base).pillars.some((p) => p.key === 'top')).toBe(false);
  });
});

describe('بطّل and goals in the score', () => {
  const at = (d: string) => new Date(`${d}T10:00:00`).getTime();
  const quit = (start: string, slips: string[]) => ({ id: start, name: 'x', icon: 'ban', color: '#000', start: at(start), why: '', replace: '', costPerDay: 0, currency: '', minutesPerDay: 0, slips: slips.map((d) => ({ at: at(d) })), urges: [], type: 'daily', targetDays: 30 }) as unknown as import('../src/lib/quit').Quit;
  it('quit: clean days over running days', () => {
    // started Mon 2 Nov: 4 days to Thu, a slip on Tue → 3 of 4
    const w = weekDash(FROM, TODAY, { ...base, quits: [quit('2026-11-02', ['2026-11-03'])] });
    expect(w.pillars.find((p) => p.key === 'quit')?.share).toBeCloseTo(3 / 4);
    expect(w.rings[3].share).toBeLessThan(1); // the slip day
  });
  const goal = (id: string, extra: object) => ({ id, name: id, start: 0, target: 100, entries: [], stages: [], wins: [], reviews: [], ...extra }) as unknown as import('../src/lib/goals').Goal;
  it('goals: the share of running goals moved this week', () => {
    const goals = [
      goal('a', { entries: [{ id: 'e', date: '2026-11-02', amount: 10 }] }),
      goal('b', { stages: [{ id: 's', title: 's', tasks: [{ id: 't', title: 't', done: '2026-11-04' }] }] }),
      goal('c', { entries: [{ id: 'e', date: '2026-10-20', amount: 10 }] }),
      goal('d', { later: '2026-10-01' }), // put off: not counted
      goal('e', { entries: [{ id: 'e', date: '2026-11-01', amount: 100 }] }), // reached: not counted
    ];
    expect(weekDash(FROM, TODAY, { ...base, goals }).pillars.find((p) => p.key === 'goals')?.share).toBeCloseTo(2 / 3);
  });
  it('«وقتك لنفسك» counts plans for yourself done', () => {
    const t = (id: string, kind: string, done: string) => ({ id, title: id, due: done, time: null, priority: 3, subs: [], repeat: null, remind: false, done, created: done, kind }) as unknown as Task;
    const w = weekDash(FROM, TODAY, { ...base, tasks: [t('a', 'outing', '2026-11-01'), t('b', 'errand', '2026-11-02'), t('c', 'visit', '2026-11-03')] });
    expect(w.metrics.find((m) => m.key === 'me')?.value).toBe(2);
  });
});

describe('boost', () => {
  it('picks the change today that raises the score most', () => {
    const b = boost(FROM, TODAY, base, { trainToday: true });
    expect(b?.key).toBe('workouts');
    const w = weekDash(FROM, TODAY, base).score!;
    const trained = weekDash(FROM, TODAY, { ...base, rows: [...base.rows, r(TODAY, 'x', 0, 0, 0)] }).score!;
    expect(b!.gain).toBe(trained - w);
  });
  it('«أهم ٣» or an idle goal when there is no workout to do', () => {
    const task = { id: 'a', title: 'a', due: TODAY, time: null, priority: 3, subs: [], repeat: null, remind: false, done: null, created: TODAY, top: TODAY } as Task;
    // Tue: 1 of 2 picks done (0.5); finishing today's lifts it to 2 of 3
    expect(boost(FROM, TODAY, { ...base, tasks: [task, { ...task, id: 'b', top: '2026-11-03', done: '2026-11-03' }, { ...task, id: 'c', top: '2026-11-03' }] }, { trainToday: false })?.key).toBe('top');
    const idle = { id: 'g', name: 'g', start: 0, target: 100, entries: [], stages: [] } as unknown as import('../src/lib/goals').Goal;
    const moved = { ...idle, id: 'h', entries: [{ id: 'e', date: '2026-11-02', amount: 5 }] };
    expect(boost(FROM, TODAY, { ...base, goals: [idle, moved] }, { trainToday: false })?.key).toBe('goals');
  });
  it('null for a past week or when nothing is left', () => {
    expect(boost('2026-10-24', TODAY, base, { trainToday: true })).toBeNull();
    expect(boost(FROM, TODAY, base, { trainToday: false })).toBeNull();
  });
});
