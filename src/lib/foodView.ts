// Pure view model for the food tab (src/app/(tabs)/(gym)/food.tsx): no React, no storage reads.
// Unit tested in __tests__/foodView.test.ts.
import { MEAL_ORDER, MEALS, type MealKey, type MenuDay } from '../data/nutrition';
import { CUP_ML, dayKey, type DayFood } from './journal';
import { mealMacros } from './logic';

export type Macros = { kcal: number; p: number; c: number; f: number };
export type KcalP = { kcal: number; p: number };

/** Millilitres as litres with one decimal ("2.5"). */
export const l1 = (ml: number) => String(Math.round(ml / 100) / 10);

/** The day chips' order: Saturday → Friday. */
export const WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5];

/** A meal's options, in the plan's order. */
export const optionsOf = (meal: MealKey) => MEALS.find((x) => x.meal === meal)!.options;

/** The option picked for this meal on this date (meta mealPicks), or the day's default when none or out of range. */
export function pickOf(picks: Record<string, number>, selDate: string, meal: MealKey, day: MenuDay): number {
  const i = picks[dayKey(selDate, meal)];
  return i != null && optionsOf(meal)[i] ? i : day.picks[meal];
}

export type MealView = { meal: MealKey; name: string; items: string[]; mac: Macros; swapped: boolean };

/** The day's meals in order, with the picked option, its macros and whether it differs from the day's default. */
export function mealsFor(day: MenuDay, picks: Record<string, number>, selDate: string): MealView[] {
  return MEAL_ORDER.map((m) => {
    const pick = pickOf(picks, selDate, m, day);
    const opt = optionsOf(m)[pick];
    return { meal: m, ...opt, mac: mealMacros(opt.items), swapped: pick !== day.picks[m] };
  });
}

/** Calories and protein of the whole day's plan. */
export const planTotal = (meals: readonly MealView[]): KcalP =>
  meals.reduce((a, m) => ({ kcal: a.kcal + m.mac.kcal, p: a.p + m.mac.p }), { kcal: 0, p: 0 });

/** What you ate: ticked meals (only on a day that can be logged) plus food outside the plan. */
export const eatenTotal = (meals: readonly MealView[], checks: ReadonlySet<string>, canLog: boolean, extras: KcalP): KcalP =>
  meals
    .filter((m) => canLog && checks.has(m.meal))
    .reduce((a, m) => ({ kcal: a.kcal + m.mac.kcal, p: a.p + m.mac.p }), { kcal: extras.kcal, p: extras.p });

export type SwapOption = { i: number; name: string; items: string[]; mac: Macros; dk: number; on: boolean; original: boolean };

/** The swap sheet's list: every option of the meal, closest in calories to the day's original first. */
export function swapOptions(meal: MealKey, day: MenuDay, cur: number): SwapOption[] {
  const opts = optionsOf(meal);
  const base = mealMacros(opts[day.picks[meal]].items);
  return opts
    .map((o, i) => ({ o, i, mac: mealMacros(o.items) }))
    .sort((a, b) => Math.abs(a.mac.kcal - base.kcal) - Math.abs(b.mac.kcal - base.kcal))
    .map(({ o, i, mac }) => ({
      i,
      name: o.name,
      items: o.items,
      mac,
      dk: Math.round(mac.kcal - base.kcal),
      on: i === cur,
      original: i === day.picks[meal],
    }));
}

/** Days in the history the supplement was ticked (0 without a name). */
export const creatineDays = (history: readonly DayFood[], supps: Record<string, number>, name: string | undefined): number =>
  name ? history.filter((d) => supps[dayKey(d.date, name)]).length : 0;

/** Cups of water left to the goal. */
export const waterLeftCups = (ml: number, goal: number) => Math.ceil((goal - ml) / CUP_ML);
