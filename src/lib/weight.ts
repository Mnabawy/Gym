// Body weight log (/weight): one weigh-in per day, saved as JSON under meta key `weights`.
// Pure — unit tested in __tests__/weight.test.ts.
//
// Rate targets per week, from the same sources as src/lib/energy.ts:
// - Lean bulk: +0.25 to +0.5 kg a week (≈ 0.25–0.5% of body weight; Iraki et al. 2019) — faster is mostly fat.
// - Cut: −0.5% to −1% of body weight a week keeps muscle (Helms et al. 2014; Garthe et al. 2011).
// - Maintain: within ±0.2 kg a week.
// The rate is a least-squares line through the last 4 weeks of weigh-ins, so one salty dinner doesn't move it.
import { addDays, daysBetween } from './gaps';
import { LIMITS, type Goal } from './energy';

export type WeighIn = { date: string; kg: number };
export const WEIGHTS_KEY = 'weights';
export const RATE_DAYS = 28;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const validWeight = (kg: number | null): kg is number => kg != null && kg >= LIMITS.weight[0] && kg <= LIMITS.weight[1];

export function parseWeights(raw: string | null): WeighIn[] {
  if (!raw) return [];
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(v)) return [];
  const by = new Map<string, number>();
  for (const x of v) {
    if (x && typeof x === 'object' && typeof x.date === 'string' && DATE.test(x.date) && typeof x.kg === 'number' && validWeight(x.kg)) by.set(x.date, x.kg);
  }
  return [...by].map(([date, kg]) => ({ date, kg })).sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Adds or replaces the weigh-in for `date`, kept in date order. */
export function addWeighIn(list: readonly WeighIn[], date: string, kg: number): WeighIn[] {
  return [...list.filter((w) => w.date !== date), { date, kg: Math.round(kg * 10) / 10 }].sort((a, b) => (a.date < b.date ? -1 : 1));
}

export const removeWeighIn = (list: readonly WeighIn[], date: string): WeighIn[] => list.filter((w) => w.date !== date);

/** kg per week over the last RATE_DAYS (least squares), or null until there are 2+ weigh-ins at least a week apart. */
export function weeklyRate(list: readonly WeighIn[], today: string): number | null {
  const from = addDays(today, -RATE_DAYS);
  const pts = list.filter((w) => w.date >= from && w.date <= today);
  if (pts.length < 2 || daysBetween(pts[0].date, pts[pts.length - 1].date) < 7) return null;
  const xs = pts.map((w) => daysBetween(pts[0].date, w.date));
  const mx = xs.reduce((a, x) => a + x, 0) / xs.length;
  const my = pts.reduce((a, w) => a + w.kg, 0) / pts.length;
  let num = 0, den = 0;
  for (let i = 0; i < pts.length; i++) {
    num += (xs[i] - mx) * (pts[i].kg - my);
    den += (xs[i] - mx) ** 2;
  }
  return den ? Math.round((num / den) * 7 * 100) / 100 : null;
}

/** Target band (kg per week) for a goal at a body weight. */
export function rateBand(goal: Goal, kg: number): [number, number] {
  if (goal === 'bulk') return [0.25, 0.5];
  if (goal === 'cut') return [Math.round(-0.01 * kg * 100) / 100, Math.round(-0.005 * kg * 100) / 100];
  return [-0.2, 0.2];
}

export type Verdict = { level: 'ok' | 'slow' | 'fast'; text: string };

/** Is the rate on track for the goal? `slow` = under the band, `fast` = over it (in the goal's direction). */
export function rateVerdict(rate: number, goal: Goal, kg: number): Verdict {
  const [lo, hi] = rateBand(goal, kg);
  if (rate >= lo && rate <= hi) return { level: 'ok', text: 'ماشي مظبوط على هدفك' };
  if (goal === 'bulk') return rate < lo ? { level: 'slow', text: 'الزيادة أبطأ من المطلوب، زوّد حوالي 150–200 سعر في اليوم' } : { level: 'fast', text: 'بتزيد أسرع من المطلوب، أغلبها هيبقى دهون. قلّل حوالي 150–200 سعر' };
  if (goal === 'cut') return rate > hi ? { level: 'slow', text: 'النزول أبطأ من المطلوب، قلّل حوالي 150–200 سعر في اليوم' } : { level: 'fast', text: 'بتنزل أسرع من المطلوب، ممكن تخسر عضل. زوّد حوالي 150–200 سعر' };
  return rate < lo ? { level: 'slow', text: 'وزنك بينزل، زوّد شوية أكل' } : { level: 'fast', text: 'وزنك بيزيد، قلّل شوية أكل' };
}
