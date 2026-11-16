// Which build this is: app version (app.json), git short SHA and build date (app.config.js puts them in `extra.build`).
// Safe everywhere: web, jest or a config without `extra.build` fall back to 'dev' / null.
import Constants from 'expo-constants';

export type BuildInfo = { version: string; sha: string; date: string | null };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Pure: build info out of an Expo config-like object (Constants.expoConfig). */
export function buildInfoFrom(cfg: unknown): BuildInfo {
  const c = (cfg && typeof cfg === 'object' ? cfg : {}) as { version?: unknown; extra?: { build?: { sha?: unknown; date?: unknown } } };
  const b = c.extra && typeof c.extra === 'object' ? c.extra.build : undefined;
  const version = typeof c.version === 'string' && c.version ? c.version : '0.0.0';
  const sha = b && typeof b.sha === 'string' && b.sha ? b.sha : 'dev';
  const date = b && typeof b.date === 'string' && DATE.test(b.date) ? b.date : null;
  return { version, sha, date };
}

function read(): BuildInfo {
  try {
    return buildInfoFrom(Constants?.expoConfig);
  } catch {
    return buildInfoFrom(null);
  }
}

export const BUILD: BuildInfo = read();

const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

/** «16 نوفمبر 2026», or null without a date. */
export function buildDateText(date: string | null): string | null {
  if (!date || !DATE.test(date)) return null;
  const [y, m, d] = date.split('-').map(Number);
  const month = MONTHS[m - 1];
  return month ? `${d} ${month} ${y}` : null;
}
