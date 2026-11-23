// Spreadsheet export (settings → صدّر لـ Excel): one CSV file per kind of data, UTF-8 with a BOM so Excel shows the
// Arabic right. Pure — unit tested in __tests__/csv.test.ts; sharing the file is in backupIO.ts.
import type { SetRow } from './storage.types';
import type { WeighIn, Measure } from './weight';
import { PARTS } from './weight';

const BOM = '﻿';

/** One CSV cell: quoted when it has a comma, quote or line break. */
export function cell(v: string | number | null | undefined): string {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(head: string[], rows: (string | number | null | undefined)[][]): string {
  return BOM + [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

export type NameOf = (exId: string) => string;
export type DayTitle = (weekday: number) => string;

/** Every logged set (done or not, with any number in it). */
export function setsCsv(rows: readonly SetRow[], name: NameOf, day: DayTitle): string {
  const at = (ms: number | null | undefined) => (ms ? new Date(ms).toTimeString().slice(0, 5) : '');
  return toCsv(
    ['التاريخ', 'اليوم', 'التمرين', 'المجموعة', 'الوزن (كجم)', 'التكرارات', 'خلصت', 'فاضل كام تكرار (RIR)', 'الساعة', 'الحجم (كجم × تكرار)'],
    rows
      .filter((r) => r.kg != null || r.reps != null)
      .map((r) => [r.date, day(r.weekday), name(r.exId), r.idx + 1, r.kg, r.reps, r.done ? 'أيوه' : 'لا', r.rir ?? '', at(r.at), r.done && r.kg && r.reps ? Math.round(r.kg * r.reps * 10) / 10 : '']),
  );
}

/** Weigh-ins and measurements side by side, one row per date that has either. */
export function bodyCsv(weights: readonly WeighIn[], measures: readonly Measure[]): string {
  const dates = [...new Set([...weights.map((w) => w.date), ...measures.map((m) => m.date)])].sort();
  return toCsv(
    ['التاريخ', 'الوزن (كجم)', ...PARTS.map((p) => `${p.label} (سم)`)],
    dates.map((d) => {
      const m = measures.find((x) => x.date === d);
      return [d, weights.find((w) => w.date === d)?.kg, ...PARTS.map((p) => m?.[p.k])];
    }),
  );
}

