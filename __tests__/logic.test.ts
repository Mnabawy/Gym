/// <reference types="jest" />
import { PLAN_WEEKDAYS, PROGRAM, dayFor, dayMuscles } from '../src/data/program';
import { MEALS, MEAL_ORDER, TARGETS, WEEK_MENU, FOODS } from '../src/data/nutrition';
import { SHOPPING } from '../src/data/shopping';
import { addMonths, bestE1rm, countAr, TIMES, SETS, dateKey, dayStatus, epley, formatClock, mealMacros, monthCells, monthStats, parseNum, shopWeekKey, shouldIncrease, weekdayOf } from '../src/lib/logic';

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
    expect(parseNum('٨٢٫٥')).toBe(82.5); // Arabic keyboard digits
    expect(parseNum('۱۰')).toBe(10);
  });
  test('dateKey is local calendar date', () => {
    expect(dateKey(new Date(2026, 10, 3, 23, 59))).toBe('2026-11-03');
  });
  test('shopping week starts on Friday', () => {
    expect(shopWeekKey(new Date(2026, 10, 6))).toBe('2026-11-06'); // Fri
    expect(shopWeekKey(new Date(2026, 10, 5))).toBe('2026-10-30'); // Thu → previous Fri
    expect(shopWeekKey(new Date(2026, 10, 7))).toBe('2026-11-06'); // Sat
  });
  test('arabic counts', () => {
    expect(countAr(1, TIMES)).toBe('مرة');
    expect(countAr(2, SETS)).toBe('مجموعتين');
    expect(countAr(3, TIMES)).toBe('3 مرات');
    expect(countAr(14, SETS)).toBe('14 مجموعة');
    expect(countAr(0, SETS)).toBe('0 مجموعة');
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

describe('attendance calendar', () => {
  test('weekdayOf and addMonths', () => {
    expect(weekdayOf('2026-11-04')).toBe(3); // Wednesday
    expect(addMonths(2026, 0, -1)).toEqual({ y: 2025, m: 11 });
    expect(addMonths(2026, 11, 1)).toEqual({ y: 2027, m: 0 });
  });
  test('month grid starts on Saturday and pads to whole weeks', () => {
    const nov = monthCells(2026, 10); // Nov 1 2026 is a Sunday → one pad cell
    expect(nov[0]).toBeNull();
    expect(nov[1]).toBe('2026-11-01');
    expect(nov.length).toBe(35);
    expect(nov.filter(Boolean).length).toBe(30);
    const aug = monthCells(2026, 7); // Aug 1 2026 is a Saturday → no padding
    expect(aug[0]).toBe('2026-08-01');
    expect(aug.length % 7).toBe(0);
  });
  test('day status', () => {
    const trained = new Set(['2026-11-02', '2026-11-01']);
    const st = (k: string) => dayStatus(k, trained, PLAN_WEEKDAYS, '2026-11-04', '2026-11-01');
    expect(st('2026-11-02')).toBe('done');
    expect(st('2026-11-01')).toBe('done'); // trained on a rest day still counts
    expect(st('2026-11-03')).toBe('missed');
    expect(st('2026-10-31')).toBe('off'); // before the first session
    expect(st('2026-11-04')).toBe('upcoming'); // today isn't missed yet
    expect(st('2026-11-05')).toBe('off'); // Thursday rest
    expect(st('2026-11-06')).toBe('upcoming');
  });
  test('month stats', () => {
    const r = monthStats(monthCells(2026, 10), new Set(['2026-11-02']), PLAN_WEEKDAYS, '2026-11-04', '2026-11-02');
    expect(r).toEqual({ done: 1, missed: 1, left: 19, rate: 0.5 });
    expect(monthStats(monthCells(2026, 10), new Set(), PLAN_WEEKDAYS, '2026-11-04', undefined).rate).toBeNull();
  });
  test('day muscles', () => {
    expect(dayMuscles(1)).toEqual(['back', 'shoulders']);
    expect(dayMuscles(0)).toEqual([]);
  });
});
