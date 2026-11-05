// End-of-workout summary on the workout tab: sets, reps, volume (kg × reps), new records, and the change from the last
// time you did the same program day. Pure — unit tested in __tests__/summary.test.ts.
import { epley } from './logic';
import type { SetRow } from './storage.types';
import { dayKey } from './journal';

export type Summary = {
  sets: number;
  reps: number;
  /** kg × reps over done sets. */
  volume: number;
  /** Exercises with a better estimated 1RM than ever before (same variant: swapped days don't count). */
  prs: string[];
  prev: { date: string; volume: number } | null;
  /** Volume change from `prev`, as a fraction (0.05 = +5%). */
  change: number | null;
};

const vol = (rows: readonly SetRow[]) => rows.reduce((a, r) => a + (r.kg ?? 0) * (r.reps ?? 0), 0);

export function sessionSummary(all: readonly SetRow[], date: string, weekday: number, swapped: ReadonlySet<string> = new Set()): Summary {
  const done = all.filter((r) => r.done && r.weekday === weekday);
  const today = done.filter((r) => r.date === date);
  const before = done.filter((r) => r.date < date);
  const prevDate = before.reduce<string | null>((m, r) => (!m || r.date > m ? r.date : m), null);

  const best = new Map<string, number>();
  for (const r of all) {
    if (!r.done || r.date >= date || swapped.has(dayKey(r.date, r.exId)) || !r.kg || !r.reps) continue;
    best.set(r.exId, Math.max(best.get(r.exId) ?? 0, epley(r.kg, r.reps)));
  }
  const prs = new Set<string>();
  for (const r of today) {
    if (swapped.has(dayKey(date, r.exId)) || !r.kg || !r.reps) continue;
    const b = best.get(r.exId);
    if (b && epley(r.kg, r.reps) > b) prs.add(r.exId);
  }

  const volume = vol(today);
  const prev = prevDate ? { date: prevDate, volume: vol(before.filter((r) => r.date === prevDate)) } : null;
  return {
    sets: today.length,
    reps: today.reduce((a, r) => a + (r.reps ?? 0), 0),
    volume: Math.round(volume),
    prs: [...prs],
    prev: prev ? { ...prev, volume: Math.round(prev.volume) } : null,
    change: prev && prev.volume > 0 ? (volume - prev.volume) / prev.volume : null,
  };
}
