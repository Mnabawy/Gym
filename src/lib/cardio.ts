// Cardio and walking (a card on the workout tab, a line in the weekly report). Saved as JSON in meta `cardio`:
// date → sessions. Pure — unit tested in __tests__/cardio.test.ts.
//
// - Calories: MET × body weight (kg) × hours, METs rounded from the Compendium of Physical Activities (Ainsworth et al.).
//   Gross burn and a rough guide only: real burn varies a lot from person to person.
// - Weekly target: WHO 2020 guidelines, 150–300 min of moderate activity a week, where a vigorous minute (6+ METs)
//   counts double. Easy activity under 3 METs counts toward minutes but not toward the target.
import { addDays } from './gaps';

export const CARDIO_KEY = 'cardio';
export const WHO_MIN = 150;
export const WHO_MAX = 300;

export type CardioType = 'walk' | 'run' | 'bike' | 'swim' | 'rope' | 'elliptical' | 'other';
export type Intensity = 'easy' | 'moderate' | 'hard';
export type Cardio = { id: string; type: CardioType; minutes: number; intensity: Intensity; km?: number; steps?: number };

export const CARDIO: Record<CardioType, { label: string; icon: string; met: [number, number, number] }> = {
  walk: { label: 'مشي', icon: 'walk', met: [2.8, 3.5, 5] },
  run: { label: 'جري', icon: 'speedometer', met: [7, 9.8, 11.5] },
  bike: { label: 'عجلة', icon: 'bicycle', met: [5.8, 7.5, 10] },
  swim: { label: 'سباحة', icon: 'water', met: [5.8, 8, 10] },
  rope: { label: 'نط حبل', icon: 'pulse', met: [8.8, 11.8, 12.3] },
  elliptical: { label: 'إليبتيكال', icon: 'fitness', met: [4.6, 5, 7] },
  other: { label: 'تاني', icon: 'heart', met: [4, 6, 8] },
};
export const INTENSITY: Record<Intensity, { label: string; i: 0 | 1 | 2 }> = {
  easy: { label: 'هادي', i: 0 },
  moderate: { label: 'متوسط', i: 1 },
  hard: { label: 'سريع', i: 2 },
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const num = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

export function parseCardio(raw: string | null): Record<string, Cardio[]> {
  const out: Record<string, Cardio[]> = {};
  let v: unknown;
  try {
    v = raw ? JSON.parse(raw) : null;
  } catch {
    return out;
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [date, list] of Object.entries(v as Record<string, unknown>)) {
    if (!DATE.test(date) || !Array.isArray(list)) continue;
    const ok: Cardio[] = [];
    for (const x of list) {
      const o = (x ?? {}) as Record<string, unknown>;
      if (typeof o.id !== 'string' || typeof o.type !== 'string' || !(o.type in CARDIO) || !num(o.minutes, 1, 600)) continue;
      if (typeof o.intensity !== 'string' || !(o.intensity in INTENSITY)) continue;
      ok.push({
        id: o.id,
        type: o.type as CardioType,
        minutes: Math.round(o.minutes),
        intensity: o.intensity as Intensity,
        ...(num(o.km, 0.1, 300) ? { km: Math.round(o.km * 100) / 100 } : null),
        ...(num(o.steps, 1, 200000) ? { steps: Math.round(o.steps) } : null),
      });
    }
    if (ok.length) out[date] = ok;
  }
  return out;
}

export const metOf = (c: Pick<Cardio, 'type' | 'intensity'>) => CARDIO[c.type].met[INTENSITY[c.intensity].i];

/** Rough calories burned (gross). */
export const cardioKcal = (c: Cardio, weightKg: number) => Math.round(metOf(c) * weightKg * (c.minutes / 60));

/** Minutes toward the WHO target: moderate (3–6 METs) count once, vigorous (6+) twice, easy (under 3) not at all. */
export const whoMinutes = (c: Cardio) => {
  const met = metOf(c);
  return met >= 6 ? c.minutes * 2 : met >= 3 ? c.minutes : 0;
};

export type CardioWeek = { minutes: number; who: number; kcal: number; sessions: number; km: number; steps: number };

/** Totals for the 7 days from `from`. */
export function cardioWeek(all: Record<string, Cardio[]>, from: string, weightKg: number): CardioWeek {
  const out: CardioWeek = { minutes: 0, who: 0, kcal: 0, sessions: 0, km: 0, steps: 0 };
  for (let i = 0; i < 7; i++) {
    for (const c of all[addDays(from, i)] ?? []) {
      out.sessions++;
      out.minutes += c.minutes;
      out.who += whoMinutes(c);
      out.kcal += cardioKcal(c, weightKg);
      out.km += c.km ?? 0;
      out.steps += c.steps ?? 0;
    }
  }
  out.km = Math.round(out.km * 10) / 10;
  return out;
}

export const cardioId = (now: number = Date.now()) => `c${now.toString(36)}`;

// Steps per day from the phone (src/lib/steps.ts), meta `steps`: date → count.
// Goal: 8,000 a day — in the pooled data of Paluch et al. 2022 (Lancet Public Health) the drop in risk of death levelled
// off around 6,000–8,000 steps for adults 60+ and 8,000–10,000 for younger adults.
export const STEPS_KEY = 'steps';
export const STEPS_GOAL = 8000;

export function parseSteps(raw: string | null): Record<string, number> {
  const out: Record<string, number> = {};
  let v: unknown;
  try {
    v = raw ? JSON.parse(raw) : null;
  } catch {
    return out;
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [d, n] of Object.entries(v as Record<string, unknown>)) if (DATE.test(d) && num(n, 1, 200000)) out[d] = Math.round(n);
  return out;
}

/** Steps over the 7 days from `from` up to `today`: total, average per day (over days that have passed) and days at the goal. */
export function stepsWeek(map: Record<string, number>, from: string, today: string) {
  let total = 0, days = 0, atGoal = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDays(from, i);
    if (d > today) break;
    days++;
    total += map[d] ?? 0;
    if ((map[d] ?? 0) >= STEPS_GOAL) atGoal++;
  }
  return { total, avg: days ? Math.round(total / days) : 0, days, atGoal, any: total > 0 };
}
