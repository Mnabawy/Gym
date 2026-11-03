/// <reference types="jest" />
import { PROGRAM, dayFor } from '../src/data/program';
import { MEALS, MEAL_ORDER, TARGETS, WEEK_MENU, FOODS } from '../src/data/nutrition';
import { SHOPPING } from '../src/data/shopping';
import { bestE1rm, dateKey, epley, formatClock, mealMacros, parseNum, shopWeekKey, shouldIncrease } from '../src/lib/logic';

describe('program data matches the PDF', () => {
  test('training days are Mon, Tue, Wed, Fri, Sat', () => {
    expect(PROGRAM.map((d) => d.weekday)).toEqual([1, 2, 3, 5, 6]);
    expect(dayFor(0)).toBeUndefined();
    expect(dayFor(4)).toBeUndefined();
  });
  test('sets per day', () => {
    const sets = PROGRAM.map((d) => d.exercises.reduce((a, e) => a + e.sets, 0));
    expect(sets).toEqual([17, 18, 17, 19, 14]);
  });
  test('rest time follows the tag', () => {
    for (const e of PROGRAM.flatMap((d) => d.exercises)) expect(e.restSec).toBe(e.tag === 'heavy' ? 150 : 90);
  });
  test('exercise ids are unique', () => {
    const ids = PROGRAM.flatMap((d) => d.exercises.map((e) => e.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('progression', () => {
  const bench = PROGRAM[1].exercises[0]; // 4 × 5–8
  test('increase when all sets hit the top of the range', () => {
    expect(shouldIncrease(bench, Array(4).fill({ kg: 80, reps: 8, done: true }))).toBe(true);
  });
  test('no increase if one set falls short', () => {
    const s = Array(4).fill({ kg: 80, reps: 8, done: true });
    s[3] = { kg: 80, reps: 6, done: true };
    expect(shouldIncrease(bench, s)).toBe(false);
  });
  test('no increase without history or weight', () => {
    expect(shouldIncrease(bench, undefined)).toBe(false);
    expect(shouldIncrease(bench, Array(4).fill({ kg: 0, reps: 8, done: true }))).toBe(false);
  });
});

describe('numbers and dates', () => {
  test('epley', () => {
    expect(epley(100, 1)).toBe(100);
    expect(epley(100, 10)).toBeCloseTo(133.3, 1);
    expect(epley(0, 5)).toBe(0);
    expect(bestE1rm([{ kg: 80, reps: 8, done: true }, { kg: 90, reps: 3, done: true }])).toBeCloseTo(101.3, 1);
  });
  test('parseNum', () => {
    expect(parseNum('82,5')).toBe(82.5);
    expect(parseNum('')).toBeNull();
    expect(parseNum('abc')).toBeNull();
  });
  test('dateKey is local calendar date', () => {
    expect(dateKey(new Date(2026, 10, 3, 23, 59))).toBe('2026-11-03');
  });
  test('shopping week starts on Friday', () => {
    expect(shopWeekKey(new Date(2026, 10, 6))).toBe('2026-11-06'); // Fri
    expect(shopWeekKey(new Date(2026, 10, 5))).toBe('2026-10-30'); // Thu → previous Fri
    expect(shopWeekKey(new Date(2026, 10, 7))).toBe('2026-11-06'); // Sat
  });
  test('clock', () => {
    expect(formatClock(90_000)).toBe('1:30');
    expect(formatClock(-5_000)).toBe('+0:05');
  });
});

describe('nutrition data', () => {
  test('every menu item exists in FOODS', () => {
    for (const m of MEALS) for (const o of m.options) for (const it of o.items) expect(FOODS[it]).toBeDefined();
  });
  test('each menu day lands within 5% of the calorie target', () => {
    for (const d of WEEK_MENU) {
      const kcal = MEAL_ORDER.reduce((a, m) => a + mealMacros(MEALS.find((x) => x.meal === m)!.options[d.picks[m]].items).kcal, 0);
      expect(Math.abs(kcal - TARGETS.kcal) / TARGETS.kcal).toBeLessThan(0.05);
    }
  });
  test('week has 7 days and shopping has items', () => {
    expect(WEEK_MENU).toHaveLength(7);
    expect(SHOPPING.flatMap((g) => g.items).length).toBeGreaterThan(20);
  });
});
