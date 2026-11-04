import { MUSCLE_AR, PROGRAM } from '../data/program';
import { useTheme } from '../theme';
import { DayChips } from './ui';

/** The five workouts in sequence order ("تمرين 1" … "تمرين 5"), as on the workout tab. `current` gets the "due now" dot. */
export function WorkoutChips({ value, current, onChange }: { value: number; current: number; onChange: (id: number) => void }) {
  const t = useTheme();
  const chips = PROGRAM.map((d, i) => {
    const muscles = [...new Set(d.exercises.map((e) => e.muscle))];
    return {
      key: d.weekday,
      label: `تمرين ${i + 1}`,
      short: String(i + 1),
      colors: muscles.map((m) => t.muscle[m]),
      details: muscles.map((m) => ({ color: t.muscle[m], label: MUSCLE_AR[m] })),
    };
  });
  return <DayChips days={chips} value={value} today={current} onChange={onChange} />;
}
