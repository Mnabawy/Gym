// Calendar and clock helpers (extracted from the former tasks.ts).

/** The week starts on Saturday (Egypt). */
export const WEEK_START = 6;
const pad = (n: number) => String(n).padStart(2, '0');

/** `2026-11` + n months. */
export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const i = y * 12 + (m - 1) + n;
  return `${Math.floor(i / 12)}-${pad((i % 12) + 1)}`;
}

/** A month as weeks of 7 days from Saturday; days outside the month are null. */
export function monthGrid(ym: string): (string | null)[][] {
  const [y, m] = ym.split('-').map(Number);
  const days = new Date(y, m, 0).getDate();
  const lead = (new Date(y, m - 1, 1).getDay() - WEEK_START + 7) % 7;
  const cells: (string | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${ym}-${pad(i + 1)}`)];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

/** Minutes after midnight → 12-hour clock. */
export const to12 = (m: number) => ({ h: Math.floor(m / 60) % 12 || 12, min: m % 60, pm: m >= 720 });
/** 12-hour clock → minutes after midnight. */
export const from12 = (h: number, min: number, pm: boolean) => ((h % 12) + (pm ? 12 : 0)) * 60 + min;
