export type Muscle = 'chest' | 'shoulders' | 'triceps' | 'back' | 'biceps' | 'quads' | 'hams' | 'calves';
export type Tag = 'heavy' | 'fail' | 'drop' | null;

export type Exercise = {
  id: string;
  name: string;
  muscle: Muscle;
  sets: number;
  repLow: number;
  repHigh: number;
  tag: Tag;
  perLeg?: boolean;
  restSec: number;
};

export type Day = { weekday: number; titleAr: string; exercises: Exercise[] };

export const MUSCLE_AR: Record<Muscle, string> = {
  chest: 'صدر',
  shoulders: 'كتف',
  triceps: 'ترايسبس',
  back: 'ظهر',
  biceps: 'بايسبس',
  quads: 'أمامية الفخد',
  hams: 'خلفية ومؤخرة',
  calves: 'سمانة',
};

// weekday: 0 = Sunday … 6 = Saturday (JS Date.getDay())
export const WEEKDAYS_AR = ['الحد', 'الاتنين', 'التلات', 'الأربع', 'الخميس', 'الجمعة', 'السبت'];
// One-letter names for the unselected day chips.
export const WEEKDAY_LETTERS_AR = ['ح', 'ن', 'ت', 'ر', 'خ', 'ج', 'س'];
export const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

const ex = (name: string, muscle: Muscle, sets: number, repLow: number, repHigh: number, tag: Tag = null, perLeg = false): Exercise => ({
  id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  name,
  muscle,
  sets,
  repLow,
  repHigh,
  tag,
  perLeg,
  restSec: tag === 'heavy' ? 150 : 90,
});

export const PROGRAM: Day[] = [
  {
    weekday: 1,
    titleAr: 'ظهر',
    exercises: [
      ex('Deadlift', 'back', 3, 4, 6, 'heavy'),
      ex('Lat Pulldown', 'back', 3, 8, 12, 'fail'),
      ex('Barbell Row', 'back', 3, 6, 10, 'heavy'),
      ex('Chest-Supported Row', 'back', 3, 10, 12, 'fail'),
      ex('Straight-Arm Pulldown', 'back', 2, 12, 15, 'drop'),
      ex('DB Lateral Raise', 'shoulders', 3, 12, 15, 'fail'),
    ],
  },
  {
    weekday: 2,
    titleAr: 'صدر وبايسبس',
    exercises: [
      ex('Barbell Bench Press', 'chest', 4, 5, 8, 'heavy'),
      ex('Incline DB Press', 'chest', 3, 8, 12),
      ex('Low-to-High Cable Fly', 'chest', 3, 12, 15, 'drop'),
      ex('EZ-Bar Curl', 'biceps', 3, 8, 12),
      ex('Preacher Curl', 'biceps', 3, 10, 12, 'fail'),
      ex('Hammer Curl', 'biceps', 2, 10, 12),
    ],
  },
  {
    weekday: 3,
    titleAr: 'خلفية الفخد ومؤخرة',
    exercises: [
      ex('Romanian Deadlift', 'hams', 4, 6, 10, 'heavy'),
      ex('Seated Leg Curl', 'hams', 4, 8, 12, 'fail'),
      ex('Bulgarian Split Squat', 'hams', 3, 8, 12, null, true),
      ex('Barbell Hip Thrust', 'hams', 3, 8, 12),
      ex('Seated Calf Raise', 'calves', 3, 12, 15, 'fail'),
    ],
  },
  {
    weekday: 5,
    titleAr: 'كتف وترايسبس',
    exercises: [
      ex('Seated DB Shoulder Press', 'shoulders', 4, 6, 10, 'heavy'),
      ex('Cable Lateral Raise', 'shoulders', 4, 12, 15, 'drop'),
      ex('Reverse Pec Deck', 'shoulders', 3, 12, 15, 'fail'),
      ex('Weighted Dips', 'triceps', 3, 6, 10, 'heavy'),
      ex('Overhead Triceps Extension', 'triceps', 3, 10, 12),
      ex('Rope Pushdown', 'triceps', 2, 12, 15, 'drop'),
    ],
  },
  {
    weekday: 6,
    titleAr: 'أمامية الفخد وسمانة',
    exercises: [
      ex('Barbell Back Squat', 'quads', 4, 5, 8, 'heavy'),
      ex('Leg Press', 'quads', 3, 10, 15),
      ex('Leg Extension', 'quads', 3, 12, 15, 'drop'),
      ex('Standing Calf Raise', 'calves', 4, 10, 15, 'fail'),
    ],
  },
];

export const dayFor = (weekday: number): Day | undefined => PROGRAM.find((d) => d.weekday === weekday);
/** Training weekdays, in program order. */
export const PLAN_WEEKDAYS = PROGRAM.map((d) => d.weekday);
/** Muscles trained on a weekday, in order, without repeats. */
export const dayMuscles = (weekday: number): Muscle[] => [...new Set((dayFor(weekday)?.exercises ?? []).map((e) => e.muscle))];
export const ALL_EXERCISES: Exercise[] = PROGRAM.flatMap((d) => d.exercises);
export const exerciseById = (id: string) => ALL_EXERCISES.find((e) => e.id === id);
/** Program day an exercise belongs to. */
export const dayOfExercise = (id: string) => PROGRAM.find((d) => d.exercises.some((e) => e.id === id));
