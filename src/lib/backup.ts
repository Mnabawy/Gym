// Backup file: everything the app saved (sets, meals, shopping ticks, settings and other meta) as one JSON file.
// There's no server, so this file is the only copy outside the phone. Pure — unit tested in __tests__/backup.test.ts.
import type { Dump, MealCheck, SetRow, ShopCheck } from './storage.types';

export const BACKUP_APP = 'gym-backup';
export const BACKUP_VERSION = 1;
/** Meta key: date (YYYY-MM-DD) of the last backup you saved or copied. */
export const LAST_BACKUP_KEY = 'lastBackup';
/** Days after the last backup before the app reminds you to make a new one. */
export const BACKUP_STALE_DAYS = 7;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const numOrNull = (v: unknown): v is number | null => v === null || num(v);

export function toBackup(d: Dump, now: Date = new Date()): string {
  return JSON.stringify({ app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: now.toISOString(), data: d });
}

export const backupFileName = (date: string) => `gym-backup-${date}.json`;

export type BackupInfo = { sets: number; days: number; meals: number; from: string | null; to: string | null };

export function backupInfo(d: Dump): BackupInfo {
  const dates = [...new Set(d.sets.filter((r) => r.done).map((r) => r.date))].sort();
  return { sets: d.sets.filter((r) => r.done).length, days: dates.length, meals: d.meals.length, from: dates[0] ?? null, to: dates[dates.length - 1] ?? null };
}

export type Parsed = { ok: true; data: Dump; exportedAt: string | null; info: BackupInfo } | { ok: false; error: string };

/**
 * Reads a backup file's text. A file that isn't ours fails with a message to show; inside a good file, rows with
 * broken fields are dropped one by one so a small bad spot never blocks the rest.
 */
export function parseBackup(text: string): Parsed {
  let v: unknown;
  try {
    v = JSON.parse(text.trim());
  } catch {
    return { ok: false, error: 'ده مش ملف نسخة احتياطية (مش JSON).' };
  }
  if (!v || typeof v !== 'object') return { ok: false, error: 'ده مش ملف نسخة احتياطية.' };
  const o = v as Record<string, unknown>;
  if (o.app !== BACKUP_APP || !o.data || typeof o.data !== 'object') return { ok: false, error: 'ده مش ملف نسخة احتياطية من التطبيق ده.' };
  if (typeof o.version !== 'number' || o.version > BACKUP_VERSION) return { ok: false, error: 'النسخة دي من إصدار أحدث من التطبيق. حدّث التطبيق الأول.' };
  const d = o.data as Record<string, unknown>;
  const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);

  const sets: SetRow[] = [];
  for (const x of arr(d.sets)) {
    if (!x || typeof x !== 'object') continue;
    const r = x as Record<string, unknown>;
    if (typeof r.date !== 'string' || !DATE.test(r.date) || typeof r.exId !== 'string' || !r.exId) continue;
    if (!num(r.weekday) || !num(r.idx) || r.idx < 0 || !Number.isInteger(r.idx) || !numOrNull(r.kg) || !numOrNull(r.reps)) continue;
    sets.push({ date: r.date, weekday: r.weekday, exId: r.exId, idx: r.idx, kg: r.kg, reps: r.reps, done: r.done ? 1 : 0 });
  }
  const meals: MealCheck[] = [];
  for (const x of arr(d.meals)) {
    const r = (x ?? {}) as Record<string, unknown>;
    if (typeof r.date === 'string' && DATE.test(r.date) && typeof r.meal === 'string') meals.push({ date: r.date, meal: r.meal });
  }
  const shop: ShopCheck[] = [];
  for (const x of arr(d.shop)) {
    const r = (x ?? {}) as Record<string, unknown>;
    if (typeof r.week === 'string' && typeof r.item === 'string') shop.push({ week: r.week, item: r.item });
  }
  const meta: Record<string, string> = {};
  if (d.meta && typeof d.meta === 'object') for (const [k, val] of Object.entries(d.meta as Record<string, unknown>)) if (typeof val === 'string') meta[k] = val;

  const data = { sets, meals, shop, meta };
  return { ok: true, data, exportedAt: typeof o.exportedAt === 'string' ? o.exportedAt : null, info: backupInfo(data) };
}
