// Morning brief (settings → ملخص الصبح): one notification every morning with the day's plan — the workout (or rest),
// the meals with their times, the water goal and what to get ready. Built ahead for the next days by src/lib/reminder.ts
// and rebuilt whenever the app opens or something changes. Pure — unit tested in __tests__/brief.test.ts.
import { dayFor, WEEKDAYS_AR } from '../data/program';
import { MEAL_ORDER, MEAL_TIME, MEALS, SUPPLEMENTS, WEEK_MENU, type MealKey } from '../data/nutrition';
import { daysBetween } from './gaps';
import { dayKey, waterGoalMl } from './journal';
import { weekdayOf } from './logic';
import { projected, type Current } from './schedule';
import { movesFor, splitShopping, tripDays } from './shop';
import type { WeighIn } from './weight';

export type BriefInput = {
  /** Today (the day the app schedules from). */
  today: string;
  cur: Current;
  /** Training weekdays (the reminder days in settings). */
  days: readonly number[];
  /** Workout reminder time (minutes after midnight), when the reminder is on. */
  workoutAt: number | null;
  /** Meal swaps (meta mealPicks). */
  picks: Record<string, number>;
  /** Liters a rest day, from the calculator (null = default). */
  waterL: number | null;
  weights: readonly WeighIn[];
  shopTrips: number;
  shopMoves: Record<string, number>;
};

/** Food items that need taking out of the freezer the morning before. */
const FROZEN: [string, string][] = [['فراخ', 'الفراخ'], ['لحم', 'اللحمة'], ['سمك', 'السمك'], ['كبدة', 'الكبدة']];
/** Days without a weigh-in before the brief says to weigh. */
export const WEIGH_EVERY = 7;

const clock = (m: number) => `${m % 720 === 0 ? 12 : Math.floor((m % 720) / 60)}${m % 60 ? `:${String(m % 60).padStart(2, '0')}` : ''} ${m < 720 ? 'الصبح' : m < 1020 ? 'العصر' : 'بالليل'}`;

export function morningBrief(date: string, x: BriefInput): { title: string; body: string } {
  const wd = weekdayOf(date);
  const training = x.days.includes(wd);
  const day = training ? dayFor(projected(date, x.today, x.cur, x.days)) : undefined;

  const menu = WEEK_MENU.find((d) => d.weekday === wd)!;
  const meals = MEAL_ORDER.map((m: MealKey) => {
    const opts = MEALS.find((o) => o.meal === m)!.options;
    const i = x.picks[dayKey(date, m)];
    const opt = opts[i != null && opts[i] ? i : menu.picks[m]];
    return { meal: m, name: opt.name, items: opt.items, time: training ? MEAL_TIME[m].training : MEAL_TIME[m].rest };
  });

  const lines: string[] = [];
  if (day) {
    const sets = day.exercises.reduce((a, e) => a + e.sets, 0);
    const minutes = Math.round(day.exercises.reduce((a, e) => a + e.sets * (e.restSec + 45), 0) / 60);
    lines.push(`🏋️ ${day.titleAr} · ${day.exercises.length} تمارين · ${sets} مجموعة · حوالي ${minutes} د${x.workoutAt != null ? ` · ${clock(x.workoutAt)}` : ''}`);
  } else lines.push('😴 يوم راحة: العضل بيكبر النهارده');
  for (const m of meals) lines.push(`🍽 ${m.meal} (${m.time}): ${m.name}`);
  lines.push(`💧 ${Math.round(waterGoalMl(x.waterL, training) / 100) / 10} لتر مية`);

  const prep: string[] = [];
  if (day) prep.push('شنطة الجيم والزمزمية');
  const frozen = FROZEN.filter(([k]) => meals.some((m) => m.items.some((it) => it.includes(k)))).map(([, label]) => label);
  if (frozen.length) prep.push(`طلّع ${frozen.join(' و')} من الفريزر`);
  if (SUPPLEMENTS[0]) prep.push(SUPPLEMENTS[0].name.split(' ')[0]);
  lines.push(`🎒 جهّز: ${prep.join('، ')}`);

  const last = x.weights[x.weights.length - 1];
  if (!last || daysBetween(last.date, date) >= WEIGH_EVERY) lines.push('⚖️ اتوزن قبل الفطار');

  const runs = tripDays(x.shopTrips);
  const t = runs.findIndex((r) => r[0] === wd);
  if (t >= 0) {
    const trip = splitShopping(x.shopTrips, undefined, movesFor(runs.length, x.shopMoves))[t];
    const n = trip?.groups.reduce((a, g) => a + g.items.length, 0) ?? 0;
    if (n) lines.push(`🛒 النهارده يوم شرا${runs.length > 1 ? ` (المرة ${t + 1})` : ''}: ${n} صنف`);
  }

  return { title: `صباح الخير · ${WEEKDAYS_AR[wd]}: ${day ? `تمرين ${day.titleAr}` : 'يوم راحة'}`, body: lines.join('\n') };
}
