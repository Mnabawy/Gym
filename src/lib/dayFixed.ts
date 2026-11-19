// The fixed things on a day for يومي and خطّط بكرة: prayer times (when they're on and the place is known), work hours
// (settings `workOn`, on `workDays`), the workout
// at the reminder time on a training day, and the meals at their plan times. Reads storage and settings; the timeline
// itself is pure (src/lib/dayPlan.ts).
import { dayFor } from '../data/program';
import { PRAYER_AR, timesFor, type PrayerKey } from './prayer';
import { useSettings } from './settings';
import { storage } from './storage';
import { weekdayOf } from './dates';
import { readNumbers } from './meta';
import { MEAL_PICKS_KEY } from './journal';
import { currentWorkout, projected } from './schedule';
import { hm, mealNames, mealsOn, type Fixed } from './dayPlan';

const FIVE: PrayerKey[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
const mins = (d: Date) => d.getHours() * 60 + d.getMinutes();

/** A day's prayers, workout and meals, for the timeline. `today` decides what counts as already done. */
export function dayFixed(date: string, today: string): { fixed: Fixed[]; gymTitle: string | null } {
  const st = useSettings.getState();
  const out: Fixed[] = [];
  if (st.prayer && st.place) {
    const times = timesFor(st.place, new Date(`${date}T12:00:00`), st.prayerMethod);
    for (const k of FIVE) out.push({ kind: 'prayer', id: `prayer:${k}`, at: mins(times[k]), mins: 0, title: PRAYER_AR[k] });
  }
  if (st.workOn && st.workDays.includes(weekdayOf(date)) && st.workTo > st.workFrom) {
    out.push({ kind: 'work', id: 'work', at: st.workFrom, mins: st.workTo - st.workFrom, title: 'الشغل', sub: `${hm(st.workFrom)} – ${hm(st.workTo)}` });
  }
  const trained = storage.trainedDays();
  const trainedThatDay = trained.some((d) => d.date === date);
  const restDay = storage.getMeta('restDay');
  const training = trainedThatDay || (st.reminderDays.includes(weekdayOf(date)) && restDay !== date);
  let gym: { at: number; end: number } | null = null;
  let gymTitle: string | null = null;
  if (training) {
    const cur = currentWorkout(trained, today);
    const day = dayFor(date === today ? cur.id : projected(date, today, cur, st.reminderDays));
    if (day) {
      const length = Math.round(day.exercises.reduce((a, e) => a + e.sets * (e.restSec + 45), 0) / 60);
      gym = { at: st.reminderTime, end: st.reminderTime + length };
      gymTitle = day.titleAr;
      out.push({ kind: 'gym', id: 'gym', at: gym.at, mins: length, title: `الجيم · ${day.titleAr}`, sub: `${hm(gym.at)} – ${hm(gym.end)} · ${day.exercises.length} تمارين`, done: trainedThatDay });
    }
  }
  const ticked = new Set(storage.mealChecks(date));
  out.push(...mealsOn(training, gym, mealNames(date, readNumbers(MEAL_PICKS_KEY)), ticked));
  return { fixed: out, gymTitle };
}
