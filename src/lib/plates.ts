// Plate calculator: which plates go on each side of the bar for a total weight. Pure — unit tested in __tests__/plates.test.ts.
// Plates are the usual gym set in kg. EZ bars weigh less than an Olympic bar (≈ 10 kg); the Olympic bar's weight is a setting.

export const PLATES = [25, 20, 15, 10, 5, 2.5, 1.25] as const;
export const EZ_BAR_KG = 10;
export const BAR_CHOICES = [10, 15, 20] as const;

/** Exercises done with a loaded bar: 'olympic' (bar weight from settings) or 'ez'. Names include the swap alternatives. */
const BARS: Record<string, 'olympic' | 'ez'> = {
  Deadlift: 'olympic',
  'Barbell Row': 'olympic',
  'Pendlay Row': 'olympic',
  'Rack Pull': 'olympic',
  'Barbell Bench Press': 'olympic',
  'Close-Grip Bench Press': 'olympic',
  'Incline Barbell Press': 'olympic',
  'Romanian Deadlift': 'olympic',
  'Stiff-Leg Deadlift': 'olympic',
  'Barbell Hip Thrust': 'olympic',
  'Barbell Back Squat': 'olympic',
  'Front Squat': 'olympic',
  'Barbell Overhead Press': 'olympic',
  'Barbell Curl': 'olympic',
  'EZ-Bar Curl': 'ez',
  'EZ-Bar Preacher Curl': 'ez',
  'EZ-Bar Skull Crusher': 'ez',
};

/** Bar weight for an exercise name, or null when it isn't a barbell exercise. */
export function barFor(name: string, olympicKg: number): number | null {
  const b = BARS[name];
  return b === 'olympic' ? olympicKg : b === 'ez' ? EZ_BAR_KG : null;
}

export type Load = { perSide: number[]; /** kg (total, both sides) that can't be made with the plates */ left: number };

/** Plates per side, heaviest first, for a total weight including the bar. Null when the total is less than the bar. */
export function platesFor(total: number, bar: number, plates: readonly number[] = PLATES): Load | null {
  if (!(total >= bar)) return null;
  let side = Math.round(((total - bar) / 2) * 1000) / 1000;
  const perSide: number[] = [];
  for (const p of plates) {
    while (side + 1e-9 >= p) {
      perSide.push(p);
      side = Math.round((side - p) * 1000) / 1000;
    }
  }
  return { perSide, left: Math.round(side * 2 * 100) / 100 };
}
