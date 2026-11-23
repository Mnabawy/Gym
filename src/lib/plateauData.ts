// Reads what the plateau detector (plateau.ts) needs from the phone: sets, meals, water, weigh-ins, the light week.
import { ALL_EXERCISES } from '../data/program';
import { MEAL_ORDER } from '../data/nutrition';
import { addDays, dateKey } from './dates';
import { attendance, ctxOf, exerciseTrends, toSessions, weeksSinceLight, WINDOW_DAYS } from './gaps';
import { adherence, foodHistory, swappedSet, SWAPS_KEY, WATER_KEY } from './journal';
import { readNumbers, readStrings } from './meta';
import type { PlateauInput } from './plateau';
import { storage } from './storage';
import { parseWeights, weeklyRate, WEIGHTS_KEY } from './weight';

export function plateauInput(lightOn: boolean, today: string = dateKey()): PlateauInput {
  const sess = toSessions(storage.allSets(), swappedSet(readStrings(SWAPS_KEY)));
  const c = ctxOf(sess, today);
  const from = addDays(today, -(WINDOW_DAYS - 1));
  const recent = new Set(sess.filter((s) => s.date >= from).map((s) => s.exId));
  const trends = exerciseTrends(sess);
  const stuck = ALL_EXERCISES.filter((e) => recent.has(e.id) && (trends[e.id].trend === 'stalled' || trends[e.id].trend === 'down')).map((e) => ({
    exId: e.id,
    name: e.name,
    sessions: trends[e.id].sinceBest,
    down: trends[e.id].trend === 'down',
  }));
  const checks = storage.allMealChecks();
  const weights = parseWeights(storage.getMeta(WEIGHTS_KEY));
  return {
    stuck,
    attendance: attendance(sess, from, today, c),
    // Only once you use the food tab: no ticks at all means food isn't tracked, not that you don't eat.
    meals: checks.length ? adherence(foodHistory(checks, readNumbers(WATER_KEY), today, 14), MEAL_ORDER.length, today) : null,
    rate: weeklyRate(weights, today),
    kg: weights.length ? weights[weights.length - 1].kg : null,
    hardWeeks: weeksSinceLight(sess, c),
    lightOn,
  };
}
