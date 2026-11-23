// Pure helpers for the day rolling over while the app stays open.

/** Milliseconds until the next local midnight (at least 1 s, so a timer never spins). DST-safe: builds the next midnight from the calendar date, not +24h. */
export function msUntilMidnight(now: Date = new Date()): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return Math.max(1000, next.getTime() - now.getTime());
}

/** Weekday (0 = Sunday) of a YYYY-MM-DD key. */
export function weekdayOfKey(key: string): number {
  return new Date(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10)).getDay();
}
