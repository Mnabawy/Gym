// The workout tab's set rows (src/components/ExerciseRow.tsx): what a set shows, what to start it with, the − / + math
// and what a tick writes. Pure — unit tested in __tests__/setRows.test.ts.
import { bestE1rm, parseNum, type SetEntry } from './logic';
import { dayKey } from './journal';

export type Row = { kg: string; reps: string; done: boolean; rir: number | null; at: number | null };
/** What the selected set's fields show, and for which set (`at`). */
export type Draft = { at: number; kg: string; reps: string };

export const toRow = (s?: SetEntry): Row => ({ kg: s?.kg != null ? String(s.kg) : '', reps: s?.reps != null ? String(s.reps) : '', done: !!s?.done, rir: s?.rir ?? null, at: s?.at ?? null });
/** RIR choices after a set: reps you could still have done (4 = 4 or more). */
export const RIR = [0, 1, 2, 3, 4];
export const rirAr = (n: number) => (n === 0 ? 'فشل' : n >= 4 ? 'فاضل +4' : `فاضل ${n}`);
/** Left-to-right isolate around numbers in Arabic text (U+2066 … U+2069). */
export const iso = (s: string) => `⁦${s}⁩`;
export const fmt = (n: number) => String(Math.round(n * 100) / 100);
/** A set can only be ticked with a weight (0 is fine for bodyweight) and at least one rep. */
export const missingOf = (v: { kg: string; reps: string }) => ({ kg: parseNum(v.kg) == null, reps: !((parseNum(v.reps) ?? 0) > 0) });

/** The set you're on: the first one not done; once all are done, the last one. */
export const lineAt = (rows: Row[]) => {
  const i = rows.findIndex((r) => !r.done);
  return i === -1 ? rows.length - 1 : i;
};

/**
 * Values to start set i with: what's saved for it, else weight from the set before it today and reps from the same set
 * last time (falling back to the other), so most sets are just ✓.
 */
export function suggest(i: number, rows: Row[], last: SetEntry[] | undefined): Draft {
  const r = rows[i];
  const prev = rows[i - 1];
  const pv = last?.[i] ?? last?.[last.length - 1];
  const pk = pv?.kg != null ? String(pv.kg) : '';
  const pr = pv?.reps != null ? String(pv.reps) : '';
  return { at: i, kg: r?.kg || prev?.kg || pk, reps: r?.reps || pr || prev?.reps || '' };
}

/** − / + on a field: weight moves by `weightStep`, reps by 1, never below 0. */
export function stepValue(cur: string, field: 'kg' | 'reps', dir: -1 | 1, weightStep: number, repLow: number): string {
  const n = parseNum(cur);
  const by = field === 'kg' ? weightStep : 1;
  // Empty reps start from the bottom of the range; empty weight from one step.
  const v = n == null ? (field === 'reps' ? repLow : dir > 0 ? by : 0) : Math.max(0, n + dir * by);
  return fmt(v);
}

/** ✓ on a set: a done set is taken back (no RIR, no time); else it's ticked with `vals`, at `now` (null for a past day). */
export function tickedRow(cur: Row, vals: { kg: string; reps: string }, now: number | null): Row {
  return cur.done ? { ...cur, done: false, rir: null, at: null } : { kg: vals.kg, reps: vals.reps, done: true, rir: null, at: now };
}

/** Best estimated 1RM before `date` (same variant: `alt` = today's swap or null), for the "new record" badge. */
export function prevBestFor(
  hist: readonly { date: string; sets: SetEntry[] }[],
  date: string,
  exId: string,
  swaps: Record<string, string>,
  alt: string | null,
): number {
  return hist
    .filter((h) => h.date < date && (swaps[dayKey(h.date, exId)] ?? null) === alt)
    .reduce((m, h) => Math.max(m, bestE1rm(h.sets.filter((x) => x.done))), 0);
}

/** The ticked sets as numbers. */
export const doneSets = (rows: Row[]): SetEntry[] => rows.filter((r) => r.done).map((r) => ({ kg: parseNum(r.kg), reps: parseNum(r.reps), done: true }));

/** The finished exercise's summary line: `kg×reps` per set (just reps without weight), joined by " · ". */
export const doneLine = (sets: SetEntry[]) => sets.map((s) => (s.kg ? `${fmt(s.kg)}×${s.reps ?? '–'}` : `${s.reps ?? '–'}`)).join(' · ');

/** Today's sets beat the best before (only once there is one). */
export const isRecord = (prevBest: number, sets: SetEntry[]) => prevBest > 0 && bestE1rm(sets) > prevBest;
