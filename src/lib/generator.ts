// Program generator for the setup (/setup): a plan from your goal, level and training days.
// Pure — unit tested in __tests__/generator.test.ts.
//
// Split by days a week (the usual choices for these frequencies; Schoenfeld et al. 2016: training each muscle twice a
// week beats once): 3 → full body A/B/C, 4 → upper/lower twice, 5 → push/pull/legs + upper/lower.
// Beginners get machines and dumbbells first, fewer sets and no failure or drop sets; intermediates get the barbell
// lifts first and more sets. Reps follow the goal: strength lower on the main lifts, fat loss a bit higher (training
// to keep muscle while eating less). Every exercise comes from the app's library (src/data/program.ts, with a form video
// and swap alternatives for each), and no exercise repeats across days (logged sets are kept per exercise id).
import { PDF_PROGRAM, RETIRED_EXERCISES, type ExerciseDef, type Muscle, type Tag, type Template } from '../data/program';

export type Goal = 'muscle' | 'strength' | 'fat';
export type Level = 'beginner' | 'intermediate';
export type Setup = { goal: Goal; level: Level; weekdays: number[] };

export const GOAL_AR: Record<Goal, string> = { muscle: 'عضل', strength: 'قوة', fat: 'تنشيف' };
export const LEVEL_AR: Record<Level, string> = { beginner: 'مبتدئ', intermediate: 'متوسط' };
export const DAYS_MIN = 3;
export const DAYS_MAX = 5;
/** Suggested training days for each count (0 = Sunday), with a rest day between where it fits. */
export const DEFAULT_WEEKDAYS: Record<number, number[]> = { 3: [0, 2, 4], 4: [6, 0, 2, 4], 5: [6, 0, 1, 3, 4] };

/** Exercises the generator can pick: the PDF's and the retired ones (each has a video and alternatives). */
const LIB: Record<string, { name: string; muscle: Muscle }> = Object.fromEntries(
  [...Object.values(PDF_PROGRAM).flat(), ...RETIRED_EXERCISES].map((e) => [e.id, { name: e.name, muscle: e.muscle }]),
);

type Role =
  | 'quadMain' | 'quadAcc' | 'hinge' | 'hamAcc' | 'glute' | 'chestMain' | 'chestAcc' | 'pullV' | 'row' | 'backAcc'
  | 'press' | 'lateral' | 'rearDelt' | 'bi' | 'bi2' | 'tri' | 'tri2' | 'calf';

/** Candidates per role, best first; [beginner, intermediate] when they differ. The first one not used yet is taken. */
const POOL: Record<Role, string[] | [string[], string[]]> = {
  quadMain: [['leg-press', 'barbell-back-squat', 'leg-extension'], ['barbell-back-squat', 'leg-press', 'bulgarian-split-squat']],
  quadAcc: [['leg-extension', 'leg-press', 'bulgarian-split-squat'], ['leg-extension', 'bulgarian-split-squat', 'leg-press']],
  hinge: [['romanian-deadlift', 'barbell-hip-thrust', 'seated-leg-curl'], ['deadlift', 'romanian-deadlift', 'barbell-hip-thrust']],
  hamAcc: ['seated-leg-curl', 'barbell-hip-thrust', 'romanian-deadlift'],
  glute: ['barbell-hip-thrust', 'seated-leg-curl', 'romanian-deadlift'],
  chestMain: [['incline-db-press', 'barbell-bench-press', 'low-to-high-cable-fly'], ['barbell-bench-press', 'incline-db-press', 'low-to-high-cable-fly']],
  chestAcc: ['low-to-high-cable-fly', 'incline-db-press', 'barbell-bench-press'],
  pullV: ['lat-pulldown', 'straight-arm-pulldown', 'chest-supported-row'],
  row: [['chest-supported-row', 'barbell-row', 'lat-pulldown'], ['barbell-row', 'chest-supported-row', 'lat-pulldown']],
  backAcc: ['straight-arm-pulldown', 'chest-supported-row', 'lat-pulldown'],
  press: ['seated-db-shoulder-press'],
  lateral: ['db-lateral-raise', 'cable-lateral-raise'],
  rearDelt: ['reverse-pec-deck', 'cable-lateral-raise', 'db-lateral-raise'],
  bi: ['ez-bar-curl', 'hammer-curl', 'preacher-curl'],
  bi2: ['hammer-curl', 'preacher-curl', 'ez-bar-curl'],
  tri: ['rope-pushdown', 'overhead-triceps-extension', 'weighted-dips'],
  tri2: [['overhead-triceps-extension', 'rope-pushdown'], ['weighted-dips', 'overhead-triceps-extension', 'rope-pushdown']],
  calf: ['standing-calf-raise', 'seated-calf-raise'],
};
/** The big lifts of a day: more sets, lower reps. */
const MAIN = new Set<Role>(['quadMain', 'hinge', 'chestMain', 'row', 'press']);
/** One-muscle moves: failure sets for intermediates training for muscle. */
const ISOLATION = new Set<Role>(['quadAcc', 'hamAcc', 'chestAcc', 'backAcc', 'lateral', 'rearDelt', 'bi', 'bi2', 'tri', 'tri2', 'calf']);

const SPLITS: Record<number, { titleAr: string; roles: Role[] }[]> = {
  3: [
    { titleAr: 'جسم كامل أ', roles: ['quadMain', 'chestMain', 'pullV', 'hamAcc', 'lateral', 'tri'] },
    { titleAr: 'جسم كامل ب', roles: ['hinge', 'press', 'row', 'quadAcc', 'bi', 'calf'] },
    { titleAr: 'جسم كامل ج', roles: ['glute', 'chestMain', 'backAcc', 'rearDelt', 'bi2', 'tri2'] },
  ],
  4: [
    { titleAr: 'علوي 1', roles: ['chestMain', 'row', 'press', 'pullV', 'bi', 'tri'] },
    { titleAr: 'سفلي 1', roles: ['quadMain', 'hamAcc', 'quadAcc', 'calf'] },
    { titleAr: 'علوي 2', roles: ['chestMain', 'row', 'lateral', 'rearDelt', 'bi2', 'tri2'] },
    { titleAr: 'سفلي 2', roles: ['hinge', 'glute', 'quadMain', 'calf'] },
  ],
  5: [
    { titleAr: 'دفع', roles: ['chestMain', 'press', 'chestAcc', 'lateral', 'tri', 'tri2'] },
    { titleAr: 'سحب', roles: ['pullV', 'row', 'backAcc', 'rearDelt', 'bi', 'bi2'] },
    { titleAr: 'رجل', roles: ['quadMain', 'hinge', 'quadAcc', 'hamAcc', 'calf'] },
    { titleAr: 'علوي', roles: ['chestMain', 'row', 'lateral', 'bi', 'tri'] },
    { titleAr: 'سفلي', roles: ['quadMain', 'glute', 'quadAcc', 'calf'] },
  ],
};

/** Sets and reps for a role. */
function dose(role: Role, s: Setup): { sets: number; repLow: number; repHigh: number; tag: Tag } {
  const main = MAIN.has(role);
  const beg = s.level === 'beginner';
  const sets = beg ? (main ? 3 : 2) : main ? (s.goal === 'strength' ? 4 : 3) : 3;
  const [repLow, repHigh] = main
    ? s.goal === 'strength' ? (beg ? [6, 10] : [4, 6]) : s.goal === 'fat' ? [8, 12] : beg ? [8, 12] : [6, 10]
    : s.goal === 'fat' ? [12, 15] : s.goal === 'strength' ? [8, 12] : [10, 15];
  const tag: Tag = beg ? null : main && repLow <= 6 ? 'heavy' : s.goal === 'muscle' && ISOLATION.has(role) ? 'fail' : null;
  return { sets, repLow, repHigh, tag };
}

/** Training days, valid and sorted, 3–5 of them. */
export const cleanDays = (days: readonly number[]) => [...new Set(days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);

/**
 * The plan for `s`, with day ids from `startId` up (nextDayId in template.ts). Days a week = the number of training
 * days picked (clamped to 3–5).
 */
export function generate(s: Setup, startId: number): Template {
  const weekdays = cleanDays(s.weekdays);
  const n = Math.min(DAYS_MAX, Math.max(DAYS_MIN, weekdays.length));
  const used = new Set<string>();
  const days = SPLITS[n].map((d, i) => {
    const exercises: ExerciseDef[] = [];
    for (const role of d.roles) {
      const pool = POOL[role];
      const list = Array.isArray(pool[0]) ? (pool as [string[], string[]])[s.level === 'beginner' ? 0 : 1] : (pool as string[]);
      const id = list.find((x) => !used.has(x) && LIB[x]);
      if (!id) continue;
      used.add(id);
      exercises.push({ id, name: LIB[id].name, muscle: LIB[id].muscle, ...dose(role, s), perLeg: id === 'bulgarian-split-squat' });
    }
    return { id: startId + i, titleAr: d.titleAr, exercises };
  });
  return { days, weekdays: weekdays.length === n ? weekdays : DEFAULT_WEEKDAYS[n], goal: s.goal, level: s.level };
}

/** One line about the plan: «3 أيام · جسم كامل · 16 تمرين». */
export function planLine(t: Template): string {
  const split = t.days.length === 3 ? 'جسم كامل' : t.days.length === 4 ? 'علوي وسفلي' : 'دفع وسحب ورجل';
  return `${t.days.length} أيام · ${split} · ${t.days.reduce((a, d) => a + d.exercises.length, 0)} تمرين`;
}
