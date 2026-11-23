// A generated program (src/lib/generator.ts), saved as meta `template`, and the names of program days you used before
// (meta `pastDays`), so old sessions keep a name after you switch plans. Pure parsing — tested in __tests__/template.test.ts.
// Applying it: applyBase (src/data/program.ts) via src/lib/settings.ts.
import { FIRST_TEMPLATE_DAY, type Template, type TemplateDay } from '../data/program';
import { parseDef } from './programEdit';

export const TEMPLATE_KEY = 'template';
export const PAST_DAYS_KEY = 'pastDays';

const json = (raw: string | null): unknown => {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};
const strings = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Saved template, or null (none, or broken: the PDF stays). Broken exercises and repeated ids are dropped; a day left empty, or ids below 100, drop the day. */
export function parseTemplate(raw: string | null): Template | null {
  const v = json(raw);
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (!Array.isArray(o.days)) return null;
  const seenEx = new Set<string>();
  const seenDay = new Set<number>();
  const days: TemplateDay[] = [];
  for (const d of o.days) {
    if (!d || typeof d !== 'object') continue;
    const x = d as Record<string, unknown>;
    if (typeof x.id !== 'number' || !Number.isInteger(x.id) || x.id < FIRST_TEMPLATE_DAY || seenDay.has(x.id)) continue;
    if (typeof x.titleAr !== 'string' || !x.titleAr.trim() || !Array.isArray(x.exercises)) continue;
    const exercises = x.exercises.map(parseDef).filter((e): e is NonNullable<typeof e> => !!e && !seenEx.has(e.id) && !!seenEx.add(e.id));
    if (!exercises.length) continue;
    seenDay.add(x.id);
    days.push({ id: x.id, titleAr: x.titleAr.trim(), exercises });
  }
  if (!days.length) return null;
  const weekdays = Array.isArray(o.weekdays) ? [...new Set(o.weekdays.filter((w): w is number => Number.isInteger(w) && w >= 0 && w <= 6))].sort() : [];
  return { days, weekdays: weekdays.length ? weekdays : [1, 3, 5], goal: strings(o.goal), level: strings(o.level) };
}

/** id → name of program days you used before. */
export function parsePastDays(raw: string | null): Record<number, string> {
  const v = json(raw);
  const out: Record<number, string> = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [k, n] of Object.entries(v as Record<string, unknown>)) if (Number.isInteger(Number(k)) && typeof n === 'string' && n) out[Number(k)] = n;
  return out;
}

/** First free day id for a new generated plan: above every day you've had (ids are never reused, so history stays apart). */
export function nextDayId(past: Record<number, string>, current: readonly number[]): number {
  return Math.max(FIRST_TEMPLATE_DAY, ...Object.keys(past).map(Number).map((n) => n + 1), ...current.map((n) => n + 1));
}

/** Meta `setupDone`: the setup was finished or skipped once, so it doesn't open by itself again. */
export const SETUP_KEY = 'setupDone';

/** The setup opens by itself only the first time, on a phone with nothing logged. */
export const needsSetup = (setupDone: string | null, trainedDays: number) => !setupDone && trainedDays === 0;
