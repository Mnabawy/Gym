/**
 * What the settings page shows, as plain text: no React, no storage. The page and its cards
 * (BackupCard, NotifySettings, GeneralSettings) read their state and hand it here.
 */
import { MONTHS_AR } from '../data/program';
import { countAr, DAYS, formatClock } from './logic';
import { BACKUP_STALE_DAYS, infoText, type BackupInfo } from './backup';
import type { Trip } from './shop';

/** Seconds → "2:30" (the rest steppers). */
export const clock = (sec: number) => formatClock(sec * 1000);
/** Weight steps (kg) offered for progression. */
export const STEPS = [1, 1.25, 2.5, 5];
/** Week order for the reminder days: Sat → Fri. */
export const WEEK = [6, 0, 1, 2, 3, 4, 5];

const ITEMS: [string, string, string, string] = ['صنف واحد', 'صنفين', 'أصناف', 'صنف'];
export const itemsAr = (n: number) => (n ? countAr(n, ITEMS) : 'مفيش حاجة');

/** Minutes after midnight → "7:30 م". */
export const timeAr = (m: number) => {
  const h = Math.floor(m / 60), mm = m % 60;
  return `${h % 12 || 12}:${String(mm).padStart(2, '0')} ${h < 12 ? 'ص' : 'م'}`;
};

/** "2026-11-05" → "5 نوفمبر 2026". */
export const dayAr = (k: string) => `${+k.slice(8)} ${MONTHS_AR[+k.slice(5, 7) - 1]} ${k.slice(0, 4)}`;

export const PHOTOS: [string, string, string, string] = ['صورة', 'صورتين', 'صور', 'صورة'];

/** What a backup (or the phone) holds, with the workout date range. */
export const infoAr = (i: BackupInfo) => (i.total ? `${infoText(i)}${i.from && i.to ? ` (تمارين من ${dayAr(i.from)} لـ ${dayAr(i.to)})` : ''}` : 'مفيش تسجيل لسه');

/** Days since the last backup → its line on the backup card. */
export const backupAgeText = (since: number | null) =>
  since == null ? 'لسه ما عملتش نسخة احتياطية' : since === 0 ? 'آخر نسخة النهارده ✓' : `آخر نسخة من ${countAr(since, DAYS)}`;

/** No backup yet, or the last one is too old (the line turns orange). */
export const backupStale = (since: number | null) => since == null || since >= BACKUP_STALE_DAYS;

/** The picked backup folder's name from its (SAF) uri; '' (no folder) → 'جوه التطبيق بس'. */
export const folderName = (backupDir: string) =>
  backupDir ? decodeURIComponent(backupDir.split('/').pop() ?? '').replace(/^primary:/, '') || 'متحدد' : 'جوه التطبيق بس';

/**
 * Why the last automatic backup failed: on the day the folder copy was due (`autoKey` = the last
 * automatic backup's day) it's the folder, else the in-app copy. null when nothing failed.
 */
export const autoErrorText = (autoError: string | null, autoKey: string | null) =>
  !autoError
    ? null
    : autoError === autoKey
      ? 'معرفتش أكتب في الفولدر آخر مرة. اختاره تاني.'
      : 'النسخة التلقائية ما اتحفظتش آخر مرة (ممكن مساحة الموبايل مليانة). فضّي شوية مساحة واحفظ نسخة بإيدك.';

/** The program row's grey line: days, exercises, and whether it was edited. */
export const programSub = (program: readonly { exercises: readonly unknown[] }[], edited: boolean) =>
  `التمارين والمجموعات والتكرارات · ${program.length} أيام · ${program.reduce((n, d) => n + d.exercises.length, 0)} تمرين${edited ? ' · متعدّل' : ''}`;

/** One line per shopping trip (or the single weekly one). */
export const tripLines = (trips: readonly Pick<Trip, 'label' | 'groups'>[]) =>
  trips.length === 1
    ? ['مرة واحدة كل جمعة للأسبوع كله']
    : trips.map((d, i) => `المرة ${i + 1}: ${d.label} · ${itemsAr(d.groups.reduce((a, g) => a + g.items.length, 0))}`);

/** Reminder days with `wd` switched: removed if there, else added (sorted). */
export const toggleDay = (days: readonly number[], wd: number) => (days.includes(wd) ? days.filter((d) => d !== wd) : [...days, wd].sort());

/** The light week row's grey line. */
export const deloadSub = (on: boolean, until: string) =>
  on ? `شغال لحد ${dayAr(until)}: نص المجموعات في كل تمرين` : '7 أيام بنص المجموعات عشان جسمك يرتاح. التطبيق بيقترحه لوحده لما يحين وقته';
