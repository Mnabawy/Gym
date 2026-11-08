/// <reference types="jest" />
import { ADHKAR, EVENING, MORNING } from '../src/data/adhkar';
import { adhkarKey, adhkarNow, adhkarOf, adhkarPart, adhkarProgress, countDhikr, parseAdhkarLog, pruneAdhkar } from '../src/lib/adhkar';
import type { Habit } from '../src/lib/habits';

const habit = (h: Partial<Habit>): Habit => ({ id: 'h', name: 'أذكار الصباح والمساء', icon: 'sparkles', color: '#000', days: [0, 1, 2, 3, 4, 5, 6], remind: null, start: '2026-11-01', ...h }) as Habit;

describe('adhkar data', () => {
  it('has both lists, unique ids, real text and counts', () => {
    expect(MORNING.length).toBe(31);
    expect(EVENING.length).toBe(30);
    for (const list of Object.values(ADHKAR)) {
      expect(new Set(list.map((d) => d.id)).size).toBe(list.length);
      for (const d of list) {
        expect(d.text.trim().length).toBeGreaterThan(5);
        expect(d.text).not.toContain('ـ');
        expect(Number.isInteger(d.count) && d.count >= 1).toBe(true);
      }
    }
    expect(MORNING[0].ref).toContain('البقرة 255');
  });
});

describe('adhkar progress', () => {
  const key = adhkarKey('2026-11-08', 'morning');
  it('counts up to each dhikr\'s count, moves on, and finishes', () => {
    let log = {};
    expect(adhkarProgress(MORNING, undefined)).toMatchObject({ done: 0, next: 0, finished: false });
    log = countDhikr(log, key, MORNING[0], 1);
    log = countDhikr(log, key, MORNING[0], 1); // count is 1: capped
    expect(adhkarProgress(MORNING, (log as Record<string, Record<string, number>>)[key])).toMatchObject({ done: 1, taps: 1, next: 1 });
    for (const d of MORNING) for (let i = 0; i < d.count; i++) log = countDhikr(log, key, d, 1);
    const p = adhkarProgress(MORNING, (log as Record<string, Record<string, number>>)[key]);
    expect(p.finished).toBe(true);
    expect(p.next).toBe(-1);
    expect(p.taps).toBe(p.totalTaps);
    log = countDhikr(log, key, MORNING[0], -1);
    expect(adhkarProgress(MORNING, (log as Record<string, Record<string, number>>)[key]).next).toBe(0);
  });
  it('parses safely and keeps a week', () => {
    expect(parseAdhkarLog('x')).toEqual({});
    const log = parseAdhkarLog(JSON.stringify({ '2026-11-08|morning': { m1: 1, m2: -1 }, bad: { m1: 1 }, '2026-10-01|evening': { e1: 1 } }));
    expect(log).toEqual({ '2026-11-08|morning': { m1: 1 }, '2026-10-01|evening': { e1: 1 } });
    expect(Object.keys(pruneAdhkar(log, '2026-11-08'))).toEqual(['2026-11-08|morning']);
  });
});

describe('adhkar habit link', () => {
  it('finds the part by field or by name', () => {
    const byName = habit({ parts: [{ name: 'الصباح' }, { name: 'المساء' }] });
    expect(adhkarOf(byName, 0)).toBe('morning');
    expect(adhkarOf(byName, 1)).toBe('evening');
    const byField = habit({ name: 'وردي', parts: [{ name: 'أول', adhkar: 'evening' }] });
    expect(adhkarOf(byField, 0)).toBe('evening');
    expect(adhkarOf(habit({ name: 'الصلاة', parts: [{ name: 'الصباح' }] }), 0)).toBeNull();
    expect(adhkarPart([byField, byName], 'morning')).toEqual({ h: byName, i: 0 });
  });
  it('opens on morning before the afternoon', () => {
    expect(adhkarNow(6)).toBe('morning');
    expect(adhkarNow(16)).toBe('evening');
    expect(adhkarNow(2)).toBe('evening');
  });
});
