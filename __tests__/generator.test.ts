/// <reference types="jest" />
import { FORM_VIDEOS } from '../src/data/videos';
import { ALTERNATIVES } from '../src/data/alternatives';
import { cleanDays, DEFAULT_WEEKDAYS, generate, planLine, type Goal, type Level } from '../src/lib/generator';
import { parseTemplate } from '../src/lib/template';

const goals: Goal[] = ['muscle', 'strength', 'fat'];
const levels: Level[] = ['beginner', 'intermediate'];

describe.each([3, 4, 5])('%i days a week', (n) => {
  test.each(levels.flatMap((l) => goals.map((g) => [l, g] as const)))('%s, %s: a full, valid plan', (level, goal) => {
    const t = generate({ goal, level, weekdays: DEFAULT_WEEKDAYS[n] }, 100);
    expect(t.days.map((d) => d.id)).toEqual(Array.from({ length: n }, (_, i) => 100 + i));
    expect(t.weekdays).toEqual([...DEFAULT_WEEKDAYS[n]].sort((a, b) => a - b));
    const ids = t.days.flatMap((d) => d.exercises.map((e) => e.id));
    expect(new Set(ids).size).toBe(ids.length); // no exercise twice
    for (const d of t.days) expect(d.exercises.length).toBeGreaterThanOrEqual(4);
    for (const id of ids) {
      expect(FORM_VIDEOS[id]).toBeDefined();
      expect(ALTERNATIVES[id]).toBeDefined();
    }
    // it survives saving and reading back unchanged
    expect(parseTemplate(JSON.stringify(t))).toEqual(t);
  });
});

test('beginners: machines first, fewer sets, no failure or drop sets', () => {
  const t = generate({ goal: 'muscle', level: 'beginner', weekdays: [0, 2, 4] }, 100);
  const all = t.days.flatMap((d) => d.exercises);
  expect(all[0].id).toBe('leg-press');
  expect(all.map((e) => e.id)).not.toContain('deadlift');
  expect(all.every((e) => e.tag === null && e.sets <= 3)).toBe(true);
});

test('intermediate strength: barbell lifts, heavy and low reps on the main lifts', () => {
  const t = generate({ goal: 'strength', level: 'intermediate', weekdays: [6, 0, 2, 4] }, 100);
  const squat = t.days[1].exercises[0];
  expect(squat.id).toBe('barbell-back-squat');
  expect([squat.sets, squat.repLow, squat.repHigh, squat.tag]).toEqual([4, 4, 6, 'heavy']);
});

test('fat loss keeps reps a bit higher', () => {
  const t = generate({ goal: 'fat', level: 'intermediate', weekdays: [0, 2, 4] }, 100);
  expect(t.days[0].exercises[0].repLow).toBe(8);
  expect(t.days[0].exercises.at(-1)!.repLow).toBe(12);
});

test('day count follows the days picked; out-of-range counts are clamped', () => {
  expect(generate({ goal: 'muscle', level: 'beginner', weekdays: [1, 2] }, 100).days.length).toBe(3);
  expect(generate({ goal: 'muscle', level: 'beginner', weekdays: [1, 2] }, 100).weekdays).toEqual(DEFAULT_WEEKDAYS[3]);
  expect(generate({ goal: 'muscle', level: 'beginner', weekdays: [0, 1, 2, 3, 4, 5, 6] }, 100).days.length).toBe(5);
  expect(cleanDays([3, 1, 1, 9, -1])).toEqual([1, 3]);
});

test('plan line', () => {
  expect(planLine(generate({ goal: 'muscle', level: 'beginner', weekdays: [0, 2, 4] }, 100))).toBe('3 أيام · جسم كامل · 18 تمرين');
});
