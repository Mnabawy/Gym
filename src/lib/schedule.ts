// Workout order: one continuous sequence through PROGRAM (ظهر → صدر وبايسبس → خلفية → كتف وترايسبس → أمامية → ظهر …).
// The next workout is the one after your last session, whatever the date: missed days and rest days don't move the order.
// A program day's id is still the weekday it was written for (`Day.weekday`), so logged data keeps its meaning.
// Pure — unit tested in __tests__/schedule.test.ts.
import { PLAN_WEEKDAYS, PROGRAM } from '../data/program';
import { addDays } from './gaps';
import { weekdayOf } from './logic';
import type { TrainedDay } from './storage.types';

/** Position of a program day in the sequence, -1 if unknown. */
export const seqIndex = (id: number) => PROGRAM.findIndex((d) => d.weekday === id);
/** Program day at sequence position i (wraps both ways). */
export const seqAt = (i: number) => PROGRAM[((i % PROGRAM.length) + PROGRAM.length) % PROGRAM.length].weekday;
/** The workout that follows `id`. */
export const after = (id: number) => seqAt(seqIndex(id) + 1);

/** Of the program days logged on one date, the one the session ended on (two in a row → the second). */
export function lastOf(ids: readonly number[]): number {
  const known = ids.filter((id) => seqIndex(id) >= 0);
  return known.find((id) => !known.includes(after(id))) ?? known[known.length - 1];
}

export type Current = {
  /** Program day to show. */
  id: number;
  /** You already logged it on this date (so it stays until the day ends). */
  started: boolean;
  /** Last session before this date. */
  last?: { date: string; id: number };
};

/**
 * The workout for `date`: the one you logged that date if any, else the one after your last earlier session,
 * else the first workout. For today that's "what's next"; for a past date you skipped, it's what was due (and still was the day after).
 */
export function currentWorkout(trained: readonly TrainedDay[], date: string): Current {
  let last: Current['last'];
  let onDate: number | undefined;
  for (const d of trained) {
    if (!d.weekdays.some((w) => seqIndex(w) >= 0)) continue;
    if (d.date === date) onDate = lastOf(d.weekdays);
    else if (d.date < date && (!last || d.date > last.date)) last = { date: d.date, id: lastOf(d.weekdays) };
  }
  if (onDate != null) return { id: onDate, started: true, last };
  return { id: last ? after(last.id) : PROGRAM[0].weekday, started: false, last };
}

/**
 * Workout projected for a future date, if you train every plan day from today on.
 * Today takes the current workout when it's a plan day or you've already trained; each later plan day takes the next one.
 */
export function projected(date: string, today: string, cur: Current): number {
  const plan = (d: string) => PLAN_WEEKDAYS.includes(weekdayOf(d));
  let steps = 0;
  for (let d = addDays(today, 1); d <= date; d = addDays(d, 1)) if (plan(d)) steps++;
  return seqAt(seqIndex(cur.id) + steps - (cur.started || plan(today) ? 0 : 1));
}
