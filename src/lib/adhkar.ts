// أذكار الصباح والمساء: progress through the day's list (pure; the page is src/app/adhkar.tsx, the text src/data/adhkar.ts).
// Progress lives in meta `adhkar`: `date|time` → how many times each dhikr was said so far (by its id). Only the
// last week is kept. Finishing the whole list ticks the matching part of the adhkar habit (habits.tsx / habitStore).
import { ADHKAR, type AdhkarTime, type Dhikr } from '../data/adhkar';
import type { Habit } from './habits';

export type AdhkarLog = Record<string, Record<string, number>>;
export const ADHKAR_KEY = 'adhkar';

export const ADHKAR_AR: Record<AdhkarTime, string> = { morning: 'الصباح', evening: 'المساء' };
export const adhkarKey = (date: string, time: AdhkarTime) => `${date}|${time}`;

export function parseAdhkarLog(raw: string | null): AdhkarLog {
  const out: AdhkarLog = {};
  let v: unknown;
  try {
    v = raw ? JSON.parse(raw) : null;
  } catch {
    return out;
  }
  if (!v || typeof v !== 'object') return out;
  for (const [k, day] of Object.entries(v as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}-\d{2}\|(morning|evening)$/.test(k) || !day || typeof day !== 'object') continue;
    const counts: Record<string, number> = {};
    for (const [id, n] of Object.entries(day as Record<string, unknown>)) if (typeof n === 'number' && Number.isInteger(n) && n > 0) counts[id] = n;
    out[k] = counts;
  }
  return out;
}

/** Drops days older than a week before `today`. */
export function pruneAdhkar(log: AdhkarLog, today: string): AdhkarLog {
  const min = new Date(`${today}T00:00:00Z`);
  min.setUTCDate(min.getUTCDate() - 7);
  const cut = min.toISOString().slice(0, 10);
  return Object.fromEntries(Object.entries(log).filter(([k]) => k.slice(0, 10) >= cut));
}

export const said = (counts: Record<string, number> | undefined, d: Dhikr) => Math.min(counts?.[d.id] ?? 0, d.count);
export const doneDhikr = (counts: Record<string, number> | undefined, d: Dhikr) => said(counts, d) >= d.count;

export type AdhkarProgress = { done: number; total: number; taps: number; totalTaps: number; next: number; finished: boolean };

/** How far along the list is: adhkar finished, taps said, and the first one not finished (-1 when all are). */
export function adhkarProgress(list: readonly Dhikr[], counts: Record<string, number> | undefined): AdhkarProgress {
  let done = 0;
  let taps = 0;
  let totalTaps = 0;
  let next = -1;
  list.forEach((d, i) => {
    taps += said(counts, d);
    totalTaps += d.count;
    if (doneDhikr(counts, d)) done++;
    else if (next < 0) next = i;
  });
  return { done, total: list.length, taps, totalTaps, next, finished: list.length > 0 && done === list.length };
}

/** One more for `id` (never past its count); `by` -1 takes one back. */
export function countDhikr(log: AdhkarLog, key: string, d: Dhikr, by: 1 | -1 = 1): AdhkarLog {
  const day = { ...(log[key] ?? {}) };
  const n = Math.max(0, Math.min(d.count, (day[d.id] ?? 0) + by));
  if (n) day[d.id] = n;
  else delete day[d.id];
  return { ...log, [key]: day };
}

/** Which adhkar list a habit part is: by its `adhkar` field, or (habits added before it existed) by its names. */
export function adhkarOf(h: Habit, i: number): AdhkarTime | null {
  const p = h.parts?.[i];
  if (!p) return null;
  if (p.adhkar) return p.adhkar;
  if (!h.name.includes('أذكار') && !h.name.includes('اذكار')) return null;
  if (p.name.includes('الصباح') || p.name.includes('صباح')) return 'morning';
  if (p.name.includes('المساء') || p.name.includes('مساء')) return 'evening';
  return null;
}

/** The habit part that `time` ticks, if there's an adhkar habit. */
export function adhkarPart(habits: readonly Habit[], time: AdhkarTime): { h: Habit; i: number } | null {
  for (const h of habits) for (let i = 0; i < (h.parts?.length ?? 0); i++) if (adhkarOf(h, i) === time) return { h, i };
  return null;
}

/** Morning until the afternoon (Asr, roughly), evening after: what the page opens on without a choice. */
export const adhkarNow = (hour: number): AdhkarTime => (hour >= 4 && hour < 15 ? 'morning' : 'evening');

export const listFor = (time: AdhkarTime) => ADHKAR[time];
