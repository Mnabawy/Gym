import { FACTS, HADITHS, type Quote } from '../data/workoutQuotes';

/**
 * The exercise to open after `from` was finished: the next unfinished one after it in the program's order,
 * else the first unfinished one before it (one you skipped), else null (the whole workout is done).
 */
export function nextToOpen(exercises: { id: string; sets: number }[], doneBy: Record<string, number>, from: string): string | null {
  const open = (e: { id: string; sets: number }) => (doneBy[e.id] ?? 0) < e.sets;
  const at = exercises.findIndex((e) => e.id === from);
  const after = exercises.slice(at + 1).find(open);
  return (after ?? exercises.slice(0, Math.max(at, 0)).find(open))?.id ?? null;
}

/** The n-th popup's quote: a hadith and a fact by turns, each list going round in order. */
export function quoteFor(n: number): Quote {
  const i = Math.max(0, Math.floor(n));
  const half = Math.floor(i / 2);
  return i % 2 === 0 ? HADITHS[half % HADITHS.length] : FACTS[half % FACTS.length];
}
