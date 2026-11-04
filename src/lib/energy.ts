// Daily energy and macro needs from body data (the calculator page, /calories).
// Pure — unit tested in __tests__/energy.test.ts.
//
// Sources behind the numbers:
// - Resting burn (BMR): Mifflin–St Jeor (1990), the most accurate general equation. With a body-fat %,
//   Katch–McArdle (370 + 21.6 × lean mass) instead — better for lean, muscular people.
// - Whole-day burn (TDEE) = BMR × the standard activity multipliers 1.2–1.9.
// - Goal: cut −20%, lean bulk +10% (≈ 0.25–0.5 kg a week, mostly muscle with hard training).
// - Protein 1.6–2.2 g/kg covers muscle gain (Morton et al. 2018); more in a deficit to keep muscle (Helms et al. 2014).
// - Fat ≥ 25% of calories (and ≥ 0.6 g/kg) for hormones; carbs get the rest, they fuel training.
// - Fiber 14 g per 1000 kcal; water ≈ 35 ml/kg plus ~0.5 L on training days. 1 kg of body weight ≈ 7700 kcal.

export type Sex = 'male' | 'female';
export type Activity = 'sedentary' | 'light' | 'moderate' | 'high' | 'athlete';
export type Goal = 'cut' | 'maintain' | 'bulk';

export type Body = {
  sex: Sex | null;
  age: number | null;
  /** cm */
  height: number | null;
  /** kg */
  weight: number | null;
  /** %, optional */
  bodyFat: number | null;
  activity: Activity;
  goal: Goal;
};

export const DEFAULT_BODY: Body = { sex: null, age: null, height: null, weight: null, bodyFat: null, activity: 'moderate', goal: 'bulk' };

export const ACTIVITY: Record<Activity, { factor: number; label: string; sub: string }> = {
  sedentary: { factor: 1.2, label: 'قاعد أغلب اليوم', sub: 'شغل مكتب ومفيش رياضة' },
  light: { factor: 1.375, label: 'حركة خفيفة', sub: 'تمرين 1–3 أيام في الأسبوع' },
  moderate: { factor: 1.55, label: 'نشاط متوسط', sub: 'تمرين 3–5 أيام في الأسبوع' },
  high: { factor: 1.725, label: 'نشاط عالي', sub: 'تمرين 6–7 أيام في الأسبوع' },
  athlete: { factor: 1.9, label: 'نشاط عالي جدًا', sub: 'تمرين مرتين في اليوم أو شغل بدني تقيل' },
};

export const GOAL: Record<Goal, { factor: number; protein: number; label: string }> = {
  cut: { factor: 0.8, protein: 2.2, label: 'تنشيف' },
  maintain: { factor: 1, protein: 1.8, label: 'تثبيت' },
  bulk: { factor: 1.1, protein: 2, label: 'زيادة عضل' },
};

/** Accepted input ranges; outside them the calculator asks you to check the number. */
export const LIMITS = { age: [14, 80], height: [120, 230], weight: [35, 250], bodyFat: [3, 60] } as const;
const MIN_KCAL: Record<Sex, number> = { male: 1500, female: 1200 };

export const inRange = (k: keyof typeof LIMITS, v: number | null): v is number => v != null && v >= LIMITS[k][0] && v <= LIMITS[k][1];

export type Energy = {
  bmr: number;
  formula: 'mifflin' | 'katch';
  tdee: number;
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber: number;
  /** liters on a rest day; add `waterTraining` on a training day */
  water: number;
  waterTraining: number;
  bmi: number;
  bmiLabel: string;
  /** kg per week (negative = losing) */
  weekly: number;
  /** lean mass, when body fat is known */
  lean: number | null;
  /** true when the goal's calories were raised to the safe minimum */
  floored: boolean;
};

const r1 = (x: number) => Math.round(x * 10) / 10;

export function bmiLabel(bmi: number): string {
  if (bmi < 18.5) return 'نحافة';
  if (bmi < 25) return 'طبيعي';
  if (bmi < 30) return 'وزن زيادة';
  return 'سمنة';
}

/** Needs for a body, or null until sex, age, height and weight are filled in and in range. */
export function energyFor(b: Body): Energy | null {
  if (!b.sex || !inRange('age', b.age) || !inRange('height', b.height) || !inRange('weight', b.weight)) return null;
  const w = b.weight;
  const bf = inRange('bodyFat', b.bodyFat) ? b.bodyFat : null;
  const lean = bf != null ? w * (1 - bf / 100) : null;
  const bmr = lean != null ? 370 + 21.6 * lean : 10 * w + 6.25 * b.height - 5 * b.age + (b.sex === 'male' ? 5 : -161);
  const tdee = bmr * ACTIVITY[b.activity].factor;
  const g = GOAL[b.goal];
  const raw = tdee * g.factor;
  const kcal = Math.round(Math.max(raw, MIN_KCAL[b.sex]) / 10) * 10;
  const protein = Math.round(w * g.protein);
  const fat = Math.round(Math.max(0.6 * w, (kcal * 0.25) / 9));
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  const bmi = w / (b.height / 100) ** 2;
  return {
    bmr: Math.round(bmr),
    formula: lean != null ? 'katch' : 'mifflin',
    tdee: Math.round(tdee),
    kcal,
    protein,
    fat,
    carbs,
    fiber: Math.round((kcal / 1000) * 14),
    water: r1(0.035 * w),
    waterTraining: 0.5,
    bmi: r1(bmi),
    bmiLabel: bmiLabel(bmi),
    weekly: r1(((kcal - tdee) * 7) / 7700),
    lean: lean != null ? r1(lean) : null,
    floored: raw < MIN_KCAL[b.sex],
  };
}

/** Saved body data → a valid Body (unknown or wrong-typed fields fall back to defaults). */
export function parseBody(v: unknown): Body {
  const out = { ...DEFAULT_BODY };
  if (!v || typeof v !== 'object') return out;
  const o = v as Record<string, unknown>;
  if (o.sex === 'male' || o.sex === 'female') out.sex = o.sex;
  for (const k of ['age', 'height', 'weight', 'bodyFat'] as const) {
    if (typeof o[k] === 'number' && Number.isFinite(o[k])) out[k] = o[k] as number;
  }
  if (typeof o.activity === 'string' && o.activity in ACTIVITY) out.activity = o.activity as Activity;
  if (typeof o.goal === 'string' && o.goal in GOAL) out.goal = o.goal as Goal;
  return out;
}
