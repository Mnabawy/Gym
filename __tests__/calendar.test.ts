/// <reference types="jest" />
import { daysIn, goalMarks, goalSpans, gymMarks, habitMarks, monthSummary, quitMarks, weekPieces } from '../src/lib/calendar';
import type { Habit } from '../src/lib/habits';
import type { Goal } from '../src/lib/goals';
import type { Quit } from '../src/lib/quit';

const T = '2026-11-08';
const habit = (id: string, h: Partial<Habit> = {}): Habit => ({ id, name: id, icon: 'book', color: '#000000', days: [0, 1, 2, 3, 4, 5, 6], remind: null, start: '2026-11-01', ...h }) as Habit;

describe('calendar', () => {
  it('lists days', () => {
    expect(daysIn('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  });
  it('gym: workout days are done', () => {
    const m = gymMarks([{ date: '2026-11-03', weekdays: [1], sets: 17 }], () => 'ظهر');
    expect(m['2026-11-03']).toEqual({ tone: 'done', v: 1, lines: ['ظهر · 17 مجموعة'] });
  });
  it('habits: share done per day, parts count, missed is bad, today is planned', () => {
    const hs = [habit('a'), habit('b', { parts: [{ name: '1' }, { name: '2' }] })];
    const log = { 'a|2026-11-05': 'done' as const, 'a|2026-11-06': 'done' as const, 'b|2026-11-06': 'done' as const };
    const parts = { 'b|2026-11-05': [0] };
    const m = habitMarks(hs, log, parts, daysIn('2026-11-04', '2026-11-09'), T);
    expect(m['2026-11-04'].tone).toBe('bad');
    expect(m['2026-11-05']).toMatchObject({ tone: 'part', v: 0.75 });
    expect(m['2026-11-06'].tone).toBe('done');
    expect(m[T].tone).toBe('plan');
    expect(m['2026-11-09']).toBeUndefined();
    expect(habitMarks(hs, log, parts, ['2026-11-05'], T, 'a')['2026-11-05'].tone).toBe('done');
    expect(monthSummary('habits', m, daysIn('2026-11-01', '2026-11-30'), T)).toContain('يوم كامل');
  });
  it('goals: done steps and entries, planned and late steps', () => {
    const g = { id: 'g', name: 'G', icon: 'flag', color: '#000000', unit: '$', start: 0, target: 10, startDate: '2026-11-01', due: '2026-11-21', why: '', entries: [{ id: 'e', date: '2026-11-02', amount: 5 }], wins: [], reviews: [],
      stages: [{ id: 's', title: 's', tasks: [{ id: 'a', title: 'A', done: '2026-11-03' }, { id: 'b', title: 'B', done: null, due: '2026-11-05' }, { id: 'c', title: 'C', done: null }] }] } as Goal;
    const m = goalMarks([g], T);
    expect(m['2026-11-02'].tone).toBe('done');
    expect(m['2026-11-03'].lines[0]).toContain('✓ A');
    expect(m['2026-11-05'].tone).toBe('bad');
    expect(m['2026-11-21'].tone).toBe('plan');
  });
  it('quitting: clean days from the start, slips are bad', () => {
    const q = { id: 'q', name: 'Q', start: new Date(2026, 10, 5, 9).getTime(), slips: [{ at: new Date(2026, 10, 7, 22).getTime() }], urges: [{ at: new Date(2026, 10, 6, 12).getTime(), resisted: true }] } as unknown as Quit;
    const m = quitMarks([q], daysIn('2026-11-04', '2026-11-09'), T);
    expect(m['2026-11-04']).toBeUndefined();
    expect(m['2026-11-06']).toMatchObject({ tone: 'clean', lines: ['بطّل 1: نضيف · غلبت 1 رغبة'] });
    expect(JSON.stringify(m)).not.toContain('Q:');
    expect(m['2026-11-07'].tone).toBe('bad');
    expect(m['2026-11-09']).toBeUndefined();
  });
});

describe('goal spans', () => {
  const g = { id: 'g', name: 'G', icon: 'flag', color: '#000000', unit: '$', start: 0, target: 10, startDate: '2026-01-01', due: '2026-04-10', why: '', entries: [], wins: [], reviews: [],
    stages: [{ id: 's1', title: '1', tasks: [{ id: 'a', title: 'A', done: '2026-01-20' }, { id: 'b', title: 'B', done: null }] }, { id: 's2', title: '2', tasks: [{ id: 'c', title: 'C', done: null }] }] } as Goal;
  it('lays a goal\'s steps end to end, one color each', () => {
    const sp = goalSpans([g]);
    expect(sp.map((x) => [x.n, x.from, x.to, x.lane, x.done])).toEqual([
      [1, '2026-01-01', '2026-02-03', 0, true],
      [2, '2026-02-04', '2026-03-08', 0, false],
      [3, '2026-03-09', '2026-04-10', 0, false],
    ]);
    expect(new Set(sp.map((x) => x.color)).size).toBe(3);
    expect(goalSpans([{ ...g, due: null }])).toEqual([]);
    expect(goalSpans([g, { ...g, id: 'h' }]).map((x) => x.lane)).toEqual([0, 0, 0, 1, 1, 1]);
  });
  it('cuts spans to a week', () => {
    const week = daysIn('2026-02-01', '2026-02-07');
    expect(weekPieces(goalSpans([g]), week).map((p) => [p.span.n, p.c0, p.c1])).toEqual([[1, 0, 2], [2, 3, 6]]);
  });
});
