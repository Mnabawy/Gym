// Backup file: saved sets, meals, shopping ticks, settings and the rest of meta in one JSON file (photos too, in the files from the share sheet or the folder). Sync keeps a copy on your account, but this file is the copy you hold yourself. Pure, unit tested in __tests__/backup.test.ts.
import { isLocalMeta, SPLIT_META } from './cloudSync';
import type { Dump, MealCheck, SetRow, ShopCheck } from './storage.types';
import { BUILD, type BuildInfo } from './buildInfo';

export const BACKUP_APP = 'gym-backup';
export const BACKUP_VERSION = 1;
/** Meta key: date (YYYY-MM-DD) of the last backup you saved or copied. */
export const LAST_BACKUP_KEY = 'lastBackup';
/** Days after the last backup before the app reminds you to make a new one. */
export const BACKUP_STALE_DAYS = 7;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const numOrNull = (v: unknown): v is number | null => v === null || num(v);

/** A progress photo inside a backup file: its file name (date_time.jpg) and the JPEG as base64. */
export type PhotoData = { name: string; data: string };
export const PHOTO_NAME = /^\d{4}-\d{2}-\d{2}_\d+\.jpg$/;

/**
 * Backup file text. Photos are optional: the file backup has them, the clipboard copy doesn't (too big to paste).
 * `build` = which app build wrote it ({ version, sha }; `app` already holds the file's magic name). Only informational:
 * parseBackup reads it when it's there and old files without it parse the same.
 */
export function toBackup(d: Dump, now: Date = new Date(), photos: readonly PhotoData[] = [], build: Pick<BuildInfo, 'version' | 'sha'> = BUILD): string {
  return JSON.stringify({
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    build: { version: build.version, sha: build.sha },
    exportedAt: now.toISOString(),
    data: d,
    ...(photos.length ? { photos } : null),
  });
}

export const backupFileName = (date: string) => `gym-backup-${date}.json`;

export type BackupInfo = {
  sets: number;
  days: number;
  meals: number;
  photos: number;
  from: string | null;
  to: string | null;
  habits: number;
  goals: number;
  quits: number;
  weights: number;
  /** Everything you logged, all kinds together (0 = nothing worth keeping; settings alone don't count). */
  total: number;
};

/**
 * Meta keys that hold things you logged and that sync keeps as one value: not settings (`settings`, `focusCfg`), not
 * the app's own bookkeeping, not small UI state (`restDay`). A new key of that kind goes here.
 */
export const PLAIN_DATA_KEYS = ['weights', 'measures', 'cardio', 'water', 'notes', 'swaps', 'extras', 'supps', 'mealPicks', 'program', 'pastExercises', 'steps', 'adhkar'] as const;

/**
 * Meta keys that hold things you logged: every key sync splits into records (tasks, goals, habits, the brain dump, deleted
 * tasks, focus sessions… `SPLIT_META` in cloudSync.ts, so a new one is counted on its own) plus `PLAIN_DATA_KEYS`, never
 * a phone-only key (`isLocalMeta`).
 */
export const DATA_KEYS: readonly string[] = [...new Set([...Object.keys(SPLIT_META), ...PLAIN_DATA_KEYS])].filter((k) => !isLocalMeta(k));

/** Entries in one meta value: array length or object key count (0 for empty or broken). */
function count(raw: string | undefined): number {
  if (!raw) return 0;
  try {
    const v: unknown = JSON.parse(raw);
    if (Array.isArray(v)) return v.length;
    if (v && typeof v === 'object') return Object.keys(v).length;
  } catch {}
  return 0;
}

export function backupInfo(d: Dump, photos = 0): BackupInfo {
  const done = d.sets.filter((r) => r.done);
  const dates = [...new Set(done.map((r) => r.date))].sort();
  const meta = DATA_KEYS.reduce((a, k) => a + count(d.meta[k]), 0);
  return {
    sets: done.length,
    days: dates.length,
    meals: d.meals.length,
    photos,
    from: dates[0] ?? null,
    to: dates[dates.length - 1] ?? null,
    habits: count(d.meta.habits),
    goals: count(d.meta.goals),
    quits: count(d.meta.quits),
    weights: count(d.meta.weights),
    total: done.length + d.meals.length + d.shop.length + meta + photos,
  };
}

/** Whether a backup (or the phone) has anything you logged. Settings alone don't count. */
export const hasData = (d: Dump, photos = 0) => backupInfo(d, photos).total > 0;

/** "12 مجموعة في 4 أيام · 6 وجبات · 3 عادات · هدف" — what's inside, in a line. */
export function infoText(i: BackupInfo): string {
  const parts: string[] = [];
  if (i.sets) parts.push(`${i.sets} مجموعة في ${i.days} ${i.days === 1 ? 'يوم' : 'أيام'}`);
  if (i.meals) parts.push(`${i.meals} وجبة`);
  if (i.habits) parts.push(`${i.habits} ${i.habits === 1 ? 'عادة' : 'عادات'}`);
  if (i.goals) parts.push(`${i.goals} ${i.goals === 1 ? 'هدف' : 'أهداف'}`);
  if (i.quits) parts.push(`${i.quits} بطّل`);
  if (i.weights) parts.push(`${i.weights} وزن`);
  if (i.photos) parts.push(`${i.photos} صورة`);
  const rest = i.total - i.sets - i.meals - i.habits - i.goals - i.quits - i.weights - i.photos;
  if (!parts.length) return rest > 0 ? 'بيانات تانية (مية، ملاحظات…)' : 'فاضية';
  return parts.join(' · ');
}

/** Which build wrote a backup file (null for files from before it was saved). */
export type BackupBuild = { version: string; sha: string } | null;

export type Parsed = { ok: true; data: Dump; photos: PhotoData[]; exportedAt: string | null; build?: BackupBuild; info: BackupInfo } | { ok: false; error: string };

/** The file's `build` field, or null when missing or malformed (never fails the parse). */
export function backupBuild(v: unknown): BackupBuild {
  if (!v || typeof v !== 'object') return null;
  const b = v as Record<string, unknown>;
  return typeof b.version === 'string' && typeof b.sha === 'string' && b.version && b.sha ? { version: b.version.slice(0, 40), sha: b.sha.slice(0, 40) } : null;
}

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
    const row: SetRow = { date: r.date, weekday: r.weekday, exId: r.exId, idx: r.idx, kg: r.kg, reps: r.reps, done: r.done ? 1 : 0 };
    if (num(r.rir)) row.rir = r.rir;
    if (num(r.at)) row.at = r.at;
    sets.push(row);
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

  const photos: PhotoData[] = [];
  for (const x of arr(o.photos)) {
    const r = (x ?? {}) as Record<string, unknown>;
    if (typeof r.name === 'string' && PHOTO_NAME.test(r.name) && typeof r.data === 'string' && r.data.length > 0 && /^[A-Za-z0-9+/=\r\n]+$/.test(r.data)) photos.push({ name: r.name, data: r.data });
  }

  const data = { sets, meals, shop, meta };
  return { ok: true, data, photos, exportedAt: typeof o.exportedAt === 'string' ? o.exportedAt : null, build: backupBuild(o.build), info: backupInfo(data, photos.length) };
}
