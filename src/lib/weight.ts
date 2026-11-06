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

// Body measurements (cm), saved as JSON under meta key `measures`; one entry per date. Measure every 2–4 weeks,
// same time of day, relaxed, tape snug but not pressing. Waist going up fast while bulking means much of the gain is fat.
export const MEASURES_KEY = 'measures';
export type Part = 'waist' | 'chest' | 'arm' | 'thigh' | 'neck' | 'hips';
export const PARTS: { k: Part; label: string; hint: string }[] = [
  { k: 'waist', label: 'الوسط', hint: 'عند السرة، بعد ما تطلّع النفس' },
  { k: 'chest', label: 'الصدر', hint: 'أعرض حتة، تحت الباط' },
  { k: 'arm', label: 'الدراع', hint: 'أعرض حتة، مشدود' },
  { k: 'thigh', label: 'الفخد', hint: 'نص المسافة بين الورك والركبة' },
  { k: 'neck', label: 'الرقبة', hint: 'تحت تفاحة آدم' },
  { k: 'hips', label: 'الأرداف', hint: 'أعرض حتة. مطلوبة لنسبة الدهون للستات بس' },
];

/**
 * Body fat % from tape measurements: the US Navy circumference method (Hodgdon & Beckett 1984), metric form.
 * Men: waist and neck; women: waist, hips and neck; both need height. About ±3–4% against lab methods, so it's a
 * trend to watch, not an exact number. Null when something's missing or the numbers can't be right.
 */
export function navyBodyFat(sex: 'male' | 'female', heightCm: number, m: Partial<Record<Part, number>>): number | null {
  const { waist, neck, hips } = m;
  if (!waist || !neck || !(heightCm > 0)) return null;
  let bf: number;
  if (sex === 'male') {
    if (waist <= neck) return null;
    bf = 495 / (1.0324 - 0.19077 * Math.log10(waist - neck) + 0.15456 * Math.log10(heightCm)) - 450;
  } else {
    if (!hips || waist + hips <= neck) return null;
    bf = 495 / (1.29579 - 0.35004 * Math.log10(waist + hips - neck) + 0.221 * Math.log10(heightCm)) - 450;
  }
  return bf >= LIMITS.bodyFat[0] && bf <= LIMITS.bodyFat[1] ? Math.round(bf * 10) / 10 : null;
}

/** The newest measurement of each part (they may come from different days). */
export function latestParts(list: readonly Measure[]): Partial<Record<Part, number>> {
  const out: Partial<Record<Part, number>> = {};
  for (const m of list) for (const p of PARTS) if (m[p.k] != null) out[p.k] = m[p.k];
  return out;
}
export type Measure = { date: string } & Partial<Record<Part, number>>;
const validCm = (v: unknown): v is number => typeof v === 'number' && v >= 10 && v <= 250;

export function parseMeasures(raw: string | null): Measure[] {
  let v: unknown;
  try {
    v = raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
  if (!Array.isArray(v)) return [];
  const by = new Map<string, Measure>();
  for (const x of v) {
    if (!x || typeof x !== 'object' || typeof x.date !== 'string' || !DATE.test(x.date)) continue;
    const m: Measure = { date: x.date };
    for (const p of PARTS) if (validCm(x[p.k])) m[p.k] = x[p.k];
    if (Object.keys(m).length > 1) by.set(m.date, m);
  }
  return [...by.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Adds the measurements for a date (replacing that date's), rounded to 0.5 cm; an entry with nothing in it is dropped. */
export function addMeasure(list: readonly Measure[], m: Measure): Measure[] {
  const clean: Measure = { date: m.date };
  for (const p of PARTS) if (validCm(m[p.k])) clean[p.k] = Math.round((m[p.k] as number) * 2) / 2;
  const rest = list.filter((x) => x.date !== m.date);
  return (Object.keys(clean).length > 1 ? [...rest, clean] : rest).sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Change per part from the first measurement of that part to the latest (null when measured once or never). */
export function measureChange(list: readonly Measure[], k: Part): { last: number; change: number | null; since: string } | null {
  const has = list.filter((m) => m[k] != null);
  if (!has.length) return null;
  const a = has[0], b = has[has.length - 1];
  return { last: b[k] as number, change: has.length > 1 ? Math.round(((b[k] as number) - (a[k] as number)) * 10) / 10 : null, since: a.date };
}

/**
 * One line on what the waist says about a bulk or cut, comparing the first and last measurements at least 2 weeks apart.
 * Rough rule: about 1 cm of waist per month while bulking is fine; more is mostly fat.
 */
export function waistNote(list: readonly Measure[], goal: Goal): string | null {
  const has = list.filter((m) => m.waist != null);
  if (has.length < 2) return null;
  const a = has[0], b = has[has.length - 1];
  const days = daysBetween(a.date, b.date);
  if (days < 14) return null;
  const perMonth = (((b.waist as number) - (a.waist as number)) / days) * 30;
  if (goal === 'bulk') return perMonth > 1 ? 'الوسط بيزيد أسرع من سم في الشهر: جزء كبير من الزيادة دهون، قلّل السعرات شوية' : 'الوسط ثابت تقريبًا: الزيادة أغلبها عضل ✓';
  if (goal === 'cut') return perMonth < -0.3 ? 'الوسط بينزل: التنشيف ماشي ✓' : 'الوسط مش بينزل: راجع السعرات';
  return Math.abs(perMonth) <= 1 ? 'الوسط ثابت ✓' : perMonth > 0 ? 'الوسط بيزيد' : 'الوسط بينزل';
}

/** The entry on `date` or the last one before it, within `maxDays` (e.g. the weight on the day a photo was taken). */
export function nearestBefore<T extends { date: string }>(list: readonly T[], date: string, maxDays = 14): T | undefined {
  let best: T | undefined;
  for (const x of list) if (x.date <= date && (!best || x.date > best.date)) best = x;
  return best && daysBetween(best.date, date) <= maxDays ? best : undefined;
}

/** Body on a date (for a progress photo): weight, waist and body fat from the nearest entries before it. */
export function bodyOn(date: string, weights: readonly WeighIn[], measures: readonly Measure[], sex: 'male' | 'female' | null, heightCm: number | null) {
  const kg = nearestBefore(weights, date)?.kg ?? null;
  const parts = latestParts(measures.filter((m) => m.date <= date && daysBetween(m.date, date) <= 30));
  const bf = sex && heightCm ? navyBodyFat(sex, heightCm, parts) : null;
  return { kg, waist: parts.waist ?? null, bf };
}
