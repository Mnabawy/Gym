// Calendar-date helpers used across the app. Pure — unit tested in __tests__/dates.test.ts.
// A date is a local YYYY-MM-DD key (the phone's own day, never UTC). Weeks start on Saturday.

/** Local calendar date as YYYY-MM-DD. */
export function dateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Weekday (0 = Sunday) of a YYYY-MM-DD key, local time. */
export function weekdayOf(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

/** The key `n` days after `key` (negative = before). */
export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return dateKey(new Date(y, m - 1, d + n));
}

/** Days from a to b (b − a). */
export function daysBetween(a: string, b: string): number {
  const p = (k: string) => {
    const [y, m, d] = k.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((p(b) - p(a)) / 86_400_000);
}

/** Saturday that starts the week containing `key`. */
export const weekStart = (key: string) => addDays(key, -((weekdayOf(key) + 1) % 7));

/** Month `delta` months away; month is 0-based. */
export function addMonths(year: number, month: number, delta: number): { y: number; m: number } {
  const d = new Date(year, month + delta, 1);
  return { y: d.getFullYear(), m: d.getMonth() };
}

/** Calendar grid for a month, weeks starting Saturday; null cells pad the first and last week. */
export function monthCells(year: number, month: number): (string | null)[] {
  const pad = (new Date(year, month, 1).getDay() + 1) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = Array(pad).fill(null);
  for (let d = 1; d <= days; d++) cells.push(dateKey(new Date(year, month, d)));
  while (cells.length % 7) cells.push(null);
  return cells;
}
