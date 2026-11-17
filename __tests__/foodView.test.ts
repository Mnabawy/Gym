/// <reference types="jest" />
import { MEAL_ORDER, MEALS, SUPPLEMENTS, WEEK_MENU, type MealKey } from '../src/data/nutrition';
import { dayKey, type DayFood } from '../src/lib/journal';
import { mealMacros } from '../src/lib/logic';
import { creatineDays, eatenTotal, l1, mealsFor, optionsOf, pickOf, planTotal, swapOptions, waterLeftCups, WEEK_ORDER } from '../src/lib/foodView';

const sat = WEEK_MENU.find((d) => d.weekday === 6)!;
const DATE = '2026-11-14';
const BREAKFAST: MealKey = 'الفطار';
// An option of breakfast that isn't Saturday's default.
const other = sat.picks[BREAKFAST] === 0 ? 1 : 0;

test('l1: millilitres as litres with one decimal', () => {
  expect(l1(0)).toBe('0');
  expect(l1(2500)).toBe('2.5');
  expect(l1(3000)).toBe('3');
  expect(l1(1749)).toBe('1.7');
});

test('week order: Saturday to Friday, every day of the menu', () => {
  expect(WEEK_ORDER).toEqual([6, 0, 1, 2, 3, 4, 5]);
  for (const wd of WEEK_ORDER) expect(WEEK_MENU.some((d) => d.weekday === wd)).toBe(true);
});

test('pickOf: the stored pick for that date, else the day default', () => {
  expect(pickOf({}, DATE, BREAKFAST, sat)).toBe(sat.picks[BREAKFAST]);
  expect(pickOf({ [dayKey(DATE, BREAKFAST)]: other }, DATE, BREAKFAST, sat)).toBe(other);
  // Another date's pick doesn't leak in.
  expect(pickOf({ [dayKey('2026-11-15', BREAKFAST)]: other }, DATE, BREAKFAST, sat)).toBe(sat.picks[BREAKFAST]);
});

test('pickOf: an option out of range falls back to the day default', () => {
  const n = optionsOf(BREAKFAST).length;
  expect(pickOf({ [dayKey(DATE, BREAKFAST)]: n }, DATE, BREAKFAST, sat)).toBe(sat.picks[BREAKFAST]);
  expect(pickOf({ [dayKey(DATE, BREAKFAST)]: -1 }, DATE, BREAKFAST, sat)).toBe(sat.picks[BREAKFAST]);
});

test('mealsFor: every meal in order with its option, macros and swapped flag', () => {
  const plain = mealsFor(sat, {}, DATE);
  expect(plain.map((m) => m.meal)).toEqual(MEAL_ORDER);
  for (const m of plain) {
    const opt = MEALS.find((x) => x.meal === m.meal)!.options[sat.picks[m.meal]];
    expect(m.name).toBe(opt.name);
    expect(m.items).toEqual(opt.items);
    expect(m.mac).toEqual(mealMacros(opt.items));
    expect(m.swapped).toBe(false);
  }
  const swapped = mealsFor(sat, { [dayKey(DATE, BREAKFAST)]: other }, DATE);
  expect(swapped[0].swapped).toBe(true);
  expect(swapped[0].name).toBe(optionsOf(BREAKFAST)[other].name);
  expect(swapped.slice(1).every((m) => !m.swapped)).toBe(true);
  // Picking the default itself isn't a swap.
  expect(mealsFor(sat, { [dayKey(DATE, BREAKFAST)]: sat.picks[BREAKFAST] }, DATE)[0].swapped).toBe(false);
});

test('planTotal: calories and protein of all meals', () => {
  const meals = mealsFor(sat, {}, DATE);
  const kcal = meals.reduce((a, m) => a + m.mac.kcal, 0);
  const p = meals.reduce((a, m) => a + m.mac.p, 0);
  expect(planTotal(meals)).toEqual({ kcal, p });
  expect(planTotal([])).toEqual({ kcal: 0, p: 0 });
});

test('eatenTotal: only ticked meals plus extras; nothing from meals on a day that cannot be logged', () => {
  const meals = mealsFor(sat, {}, DATE);
  const none = { kcal: 0, p: 0 };
  expect(eatenTotal(meals, new Set(), true, none)).toEqual(none);
  const first = meals[0].mac;
  expect(eatenTotal(meals, new Set([BREAKFAST]), true, none)).toEqual({ kcal: first.kcal, p: first.p });
  expect(eatenTotal(meals, new Set([BREAKFAST]), true, { kcal: 300, p: 20 })).toEqual({ kcal: first.kcal + 300, p: first.p + 20 });
  expect(eatenTotal(meals, new Set(MEAL_ORDER), true, none)).toEqual(planTotal(meals));
  // A future day: ticks don't count (extras still would, as before; the UI hides it there).
  expect(eatenTotal(meals, new Set(MEAL_ORDER), false, none)).toEqual(none);
  expect(eatenTotal(meals, new Set(MEAL_ORDER), false, { kcal: 100, p: 5 })).toEqual({ kcal: 100, p: 5 });
});

test('swapOptions: every option, sorted by calorie distance from the day original, with flags', () => {
  for (const meal of MEAL_ORDER) {
    const opts = swapOptions(meal, sat, sat.picks[meal]);
    expect(opts.map((o) => o.i).sort((a, b) => a - b)).toEqual(optionsOf(meal).map((_, i) => i));
    const base = mealMacros(optionsOf(meal)[sat.picks[meal]].items).kcal;
    const dist = opts.map((o) => Math.abs(o.mac.kcal - base));
    expect(dist).toEqual([...dist].sort((a, b) => a - b));
    expect(opts.filter((o) => o.original).map((o) => o.i)).toEqual([sat.picks[meal]]);
    expect(opts.filter((o) => o.on).map((o) => o.i)).toEqual([sat.picks[meal]]);
    for (const o of opts) {
      expect(o.name).toBe(optionsOf(meal)[o.i].name);
      expect(o.dk).toBe(Math.round(o.mac.kcal - base));
    }
    // The original is 0 away, so it's first (or tied for first).
    expect(dist[0]).toBe(0);
    expect(opts.find((o) => o.original)!.dk).toBe(0);
  }
});

test('swapOptions: the current pick is on, the original still marked', () => {
  const opts = swapOptions(BREAKFAST, sat, other);
  expect(opts.find((o) => o.on)!.i).toBe(other);
  expect(opts.find((o) => o.original)!.i).toBe(sat.picks[BREAKFAST]);
});

test('creatineDays: days in the history with the supplement ticked', () => {
  const name = SUPPLEMENTS[0].name;
  const history: DayFood[] = [
    { date: '2026-11-12', meals: 5, water: 0 },
    { date: '2026-11-13', meals: 3, water: 0 },
    { date: '2026-11-14', meals: 0, water: 0 },
  ];
  const supps = { [dayKey('2026-11-12', name)]: 1, [dayKey('2026-11-14', name)]: 1, [dayKey('2026-11-01', name)]: 1, [dayKey('2026-11-13', 'other')]: 1 };
  expect(creatineDays(history, supps, name)).toBe(2);
  expect(creatineDays(history, supps, undefined)).toBe(0);
  expect(creatineDays([], supps, name)).toBe(0);
});

test('waterLeftCups: cups of 250 ml left, rounded up', () => {
  expect(waterLeftCups(0, 3000)).toBe(12);
  expect(waterLeftCups(2900, 3000)).toBe(1);
  expect(waterLeftCups(2750, 3500)).toBe(3);
});
