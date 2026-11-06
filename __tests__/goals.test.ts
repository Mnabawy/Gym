/// <reference types="jest" />
import { addNextStep, addReview, goalsWeek, allWins, autoWins, current, currentStage, fmtAmount, idleDays, moveStage, nextTask, pace, parseGoals, progress, reviewDue, stageDone, toggleTask, type Goal } from '../src/lib/goals';
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
