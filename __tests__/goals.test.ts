/// <reference types="jest" />
import { addNextStep, addReview, goalsWeek, allWins, autoWins, current, currentStage, fmtAmount, idleDays, milestones, moveStage, amountOf, reachDate, reached, setSplit, spreadMilestones, stageEnd, stageFill, unassigned, nextTask, pace, parseGoals, progress, reviewDue, schedule, stageDone, toggleTask, type Goal } from '../src/lib/goals';
import { fromTemplate, GOAL_TEMPLATES } from '../src/data/goalTemplates';

const base: Goal = {
  id: 'g1', name: '100K', icon: 'cash', color: '#009E73', unit: '$', start: 0, target: 100000, startDate: '2026-01-01', due: '2027-01-01', why: '',
  stages: [
    { id: 's1', title: 'أ', tasks: [{ id: 't1', title: 'one', done: '2026-01-05' }, { id: 't2', title: 'two', done: '2026-01-09' }] },
    { id: 's2', title: 'ب', tasks: [{ id: 't3', title: 'three', done: null }, { id: 't4', title: 'four', done: null }] },
    { id: 's3', title: 'ج', tasks: [] },
  ],
  entries: [{ id: 'e1', date: '2026-02-01', amount: 12000 }, { id: 'e2', date: '2026-03-01', amount: 20000 }],
  wins: [{ id: 'w1', date: '2026-02-10', title: 'أول عميل' }],
  reviews: [],
};

test('parse keeps good goals and drops broken parts', () => {
  const raw = JSON.stringify([base, { ...base }, { ...base, id: 'x', target: 0 }, { ...base, id: 'y', stages: [{ id: 's', title: ' ', tasks: [] }], entries: [{ id: 'e', date: 'bad', amount: 1 }, { id: 'f', date: '2026-01-01', amount: 'x' }] }]);
  const gs = parseGoals(raw);
  expect(gs.map((g) => g.id)).toEqual(['g1', 'y']);
  expect(gs[1].stages).toEqual([]);
  expect(gs[1].entries).toEqual([]);
  expect(parseGoals('nope')).toEqual([]);
});

test('where you are, stages and the next task', () => {
  expect(current(base)).toBe(32000);
  expect(progress(base)).toBeCloseTo(0.32);
  expect(stageDone(base.stages[0])).toBe(true);
  expect(stageDone(base.stages[2])).toBe(false); // no tasks: not done
  expect(currentStage(base)).toBe(1);
  expect(nextTask(base)?.task.id).toBe('t3');
  const all = toggleTask(toggleTask(base, 't3', '2026-03-02'), 't4', '2026-03-03');
  expect(currentStage(all)).toBe(2);
  expect(nextTask(all)).toBeNull(); // the stage has no tasks yet
  expect(toggleTask(all, 't3', '2026-03-04').stages[1].tasks[0].done).toBeNull();
});

test('goals that go down', () => {
  const g: Goal = { ...base, start: 90, target: 80, unit: 'كجم', entries: [{ id: 'e', date: '2026-01-10', amount: -5 }] };
  expect(progress(g)).toBeCloseTo(0.5);
  expect(pace(g, '2026-01-20').eta).not.toBeNull();
});

test('pace: per month, when you get there, what the due date needs', () => {
  const p = pace(base, '2026-04-10'); // 100 days in
  expect(p.gained).toBe(32000);
  expect(p.perMonth).toBeCloseTo(9600);
  expect(p.eta).toBe('2026-11-09'); // 68000 left at 320 a day = 213 days
  expect(p.daysLeft).toBe(266);
  expect(p.needPerMonth).toBeCloseTo((68000 / 266) * 30);
  expect(pace({ ...base, entries: [] }, '2026-04-10').eta).toBeNull();
  expect(pace({ ...base, entries: [{ id: 'e', date: '2026-02-01', amount: 100000 }] }, '2026-04-10')).toMatchObject({ remaining: 0, eta: null, needPerMonth: null });
});

test('the wins the app sees: milestones on the day they were crossed, and stages done', () => {
  const w = autoWins(base, (n) => fmtAmount(n, '$'));
  expect(w.map((x) => [x.id, x.date])).toEqual([['m0.1', '2026-02-01'], ['m0.25', '2026-03-01'], ['ss1', '2026-01-09']]);
  expect(w[0].title).toContain('$10,000');
  expect(allWins(base).map((x) => x.id)).toEqual(['m0.25', 'w1', 'm0.1', 'ss1']);
});

test('idle days and the weekly review', () => {
  expect(idleDays(base, '2026-03-10')).toBe(9);
  expect(reviewDue(base, '2026-01-05')).toBe(false);
  expect(reviewDue(base, '2026-01-08')).toBe(true);
  const r = addReview(base, { date: '2026-03-10', did: 'x', blocked: '', next: 'y' });
  expect(reviewDue(r, '2026-03-16')).toBe(false);
  expect(reviewDue(r, '2026-03-17')).toBe(true);
  expect(idleDays(r, '2026-03-10')).toBe(0);
  expect(addReview(r, { date: '2026-03-10', did: 'z', blocked: '', next: '' }).reviews).toHaveLength(1);
});

test('reorder stages and format numbers', () => {
  expect(moveStage(base, 's2', -1).stages.map((s) => s.id)).toEqual(['s2', 's1', 's3']);
  expect(moveStage(base, 's1', -1)).toBe(base);
  expect(fmtAmount(100000, '$')).toBe('$100,000');
  expect(fmtAmount(-250, '$')).toBe('-$250');
  expect(fmtAmount(12.5, 'ساعة')).toBe('12.5 ساعة');
  expect(fmtAmount(3, '')).toBe('3');
});

test('templates make valid goals with unique ids', () => {
  for (const tp of GOAL_TEMPLATES) {
    const g = fromTemplate(tp, '2026-11-06', 1);
    const ids = [g.id, ...g.stages.flatMap((s) => [s.id, ...s.tasks.map((t) => t.id)])];
    expect(new Set(ids).size).toBe(ids.length);
    if (g.name) expect(parseGoals(JSON.stringify([g]))).toEqual([g]);
  }
});

test('the first month counts as a whole month', () => {
  const g: Goal = { ...base, startDate: '2026-11-06', entries: [{ id: 'e', date: '2026-11-06', amount: 12000 }] };
  expect(pace(g, '2026-11-06').perMonth).toBe(12000);
});

test("a goal's week", () => {
  const [w] = goalsWeek([base], '2026-02-01', '2026-02-07');
  expect(w).toMatchObject({ gained: 12000, tasks: 0 });
  expect(w.share).toBeCloseTo(0.12);
  expect(goalsWeek([base], '2026-01-03', '2026-01-09')[0]).toMatchObject({ gained: 0, tasks: 2, share: 0 });
  expect(goalsWeek([base], '2025-12-01', '2025-12-07')).toEqual([]); // not started yet
});

test('the review step goes first on the stage you are on, or a new stage', () => {
  const g = addNextStep(base, 'جديد', 'x');
  expect(g.stages[1].tasks.map((t) => t.id)).toEqual(['x', 't3', 't4']);
  expect(nextTask(g)?.task.id).toBe('x');
  const allDone: Goal = { ...base, stages: [base.stages[0]] };
  const h = addNextStep(allDone, 'جديد', 'y');
  expect(h.stages).toHaveLength(2);
  expect(nextTask(h)?.task.id).toBe('y');
});

describe('schedule (steps spread over the time frame)', () => {
  const base = (stages: Goal['stages'], due: string | null = '2026-04-10') =>
    ({ id: 'g', name: 'x', icon: 'flag', color: '#000000', unit: '$', start: 0, target: 100, startDate: '2026-01-01', due, why: '', stages, entries: [], wins: [], reviews: [] }) as Goal;
  const task = (id: string, due?: string) => ({ id, title: id, done: null, ...(due ? { due } : {}) });
  it('is null without a due date', () => {
    expect(schedule(base([{ id: 's', title: 's', tasks: [task('a')] }], null))).toBeNull();
  });
  it('spreads steps evenly and ends each stage on its last step', () => {
    // 2026-01-01 → 2026-04-10 is 99 days; 3 steps → every 33 days.
    const p = schedule(base([{ id: 's1', title: '1', tasks: [task('a'), task('b')] }, { id: 's2', title: '2', tasks: [task('c')] }]))!;
    expect(p.task).toEqual({ a: '2026-02-03', b: '2026-03-08', c: '2026-04-10' });
    expect(p.stage.s1).toEqual({ from: '2026-01-01', to: '2026-03-08', fixed: false });
    expect(p.stage.s2).toEqual({ from: '2026-03-08', to: '2026-04-10', fixed: false });
  });
  it('keeps your own dates and spreads the rest around them', () => {
    const p = schedule(base([{ id: 's1', title: '1', until: '2026-01-21', tasks: [task('a'), task('b')] }, { id: 's2', title: '2', tasks: [task('c', '2026-03-01'), task('d')] }]))!;
    expect(p.task.a).toBe('2026-01-11');
    expect(p.task.b).toBe('2026-01-21');
    expect(p.stage.s1.fixed).toBe(true);
    expect(p.task.c).toBe('2026-03-01');
    expect(p.task.d).toBe('2026-04-10');
  });
  it('gives an empty stage its share and parses the dates back', () => {
    const p = schedule(base([{ id: 's1', title: '1', tasks: [] }, { id: 's2', title: '2', tasks: [task('a')] }]))!;
    expect(p.stage.s1.to < p.task.a).toBe(true);
    const g = parseGoals(JSON.stringify([base([{ id: 's', title: 's', until: '2026-02-01', tasks: [task('a', '2026-01-15'), { id: 'b', title: 'b', done: null, due: 'nope' }] }])]))[0];
    expect(g.stages[0].until).toBe('2026-02-01');
    expect(g.stages[0].tasks[0].due).toBe('2026-01-15');
    expect(g.stages[0].tasks[1].due).toBeUndefined();
  });
});

test('each stage has its own amount, filled in road order', () => {
  // 32K logged: s1 (20K) is full, s2 (30K) has the other 12K, s3 (50K) nothing yet.
  const g: Goal = { ...base, stages: base.stages.map((s, i) => ({ ...s, amount: [20000, 30000, 50000][i] })) };
  expect(stageEnd(g, 0)).toBe(20000);
  expect(stageEnd(g, 1)).toBe(50000);
  expect(stageFill(g, 0)).toEqual({ got: 20000, of: 20000, left: 0 });
  expect(stageFill(g, 1)).toEqual({ got: 12000, of: 30000, left: 18000 });
  expect(stageFill(g, 2)).toEqual({ got: 0, of: 50000, left: 50000 });
  expect(unassigned(g)).toBe(0);
  expect(reachDate(g, 20000)).toBe('2026-03-01');
  expect(stageDone(g.stages[0], g)).toBe(true);
  expect(autoWins(g).find((w) => w.id === 'ss1')?.date).toBe('2026-03-01');
  // Steps done but the amount isn't filled: the stage stays open.
  const ticked = toggleTask(toggleTask(g, 't3', '2026-03-02'), 't4', '2026-03-03');
  expect(stageDone(ticked.stages[1], ticked)).toBe(false);
  expect(currentStage(ticked)).toBe(1);
  // A first stage bigger than what you have keeps it open even with its steps done.
  const big: Goal = { ...g, stages: g.stages.map((s, i) => (i === 0 ? { ...s, amount: 40000 } : s)) };
  expect(currentStage(big)).toBe(0);
  expect(unassigned(big)).toBe(-20000);
  // A stage with only an amount (no steps) is done by the number.
  expect(currentStage({ ...g, stages: [{ id: 'x', title: 'x', amount: 30000, tasks: [] }] })).toBe(-1);
  expect(milestones(g).map((m) => [m.at, m.done])).toEqual([[20000, true], [50000, false], [100000, false]]);
  expect(reached(g, 32000)).toBe(true);
  expect(parseGoals(JSON.stringify([g]))[0].stages[0].amount).toBe(20000);
  expect(parseGoals(JSON.stringify([{ ...g, stages: [{ id: 'z', title: 'z', amount: -5, tasks: [] }] }]))[0].stages[0].amount).toBeUndefined();
});

test('setting one stage amount takes it off the goal, the rest share what is left', () => {
  expect(amountOf(base, 0)).toBeNull(); // not split
  expect(stageDone(base.stages[0], base)).toBe(true); // steps alone, as before
  const sp = spreadMilestones(base);
  expect([0, 1, 2].map((i) => amountOf(sp, i))).toEqual([100000 / 3, 100000 / 3, 100000 / 3]);
  const one: Goal = { ...sp, stages: sp.stages.map((s, i) => (i === 0 ? { ...s, amount: 20000 } : s)) };
  expect([0, 1, 2].map((i) => amountOf(one, i))).toEqual([20000, 40000, 40000]);
  expect(unassigned(one)).toBe(0);
  expect(stageFill(one, 1)).toEqual({ got: 12000, of: 40000, left: 28000 });
  expect(parseGoals(JSON.stringify([sp]))[0].split).toBe(true);
  const off = setSplit(one, false);
  expect(off.split).toBeUndefined();
  expect(off.stages.some((s) => s.amount !== undefined)).toBe(false);
  // Goals that go down.
  const down = spreadMilestones({ ...base, start: 90, target: 80, entries: [{ id: 'e', date: '2026-01-10', amount: -7 }], stages: base.stages.slice(0, 2) });
  expect(stageFill(down, 0)).toEqual({ got: 5, of: 5, left: 0 });
  expect(stageFill(down, 1)).toEqual({ got: 2, of: 5, left: 3 });
});
