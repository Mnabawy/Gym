// Spreadsheet export (settings → صدّر لـ Excel): one CSV file per kind of data, UTF-8 with a BOM so Excel shows the
// Arabic right. Pure — unit tested in __tests__/csv.test.ts; sharing the file is in backupIO.ts.
import type { SetRow } from './storage.types';
import type { WeighIn, Measure } from './weight';
import { PARTS } from './weight';
import type { Cardio } from './cardio';
import { CARDIO, INTENSITY, metOf } from './cardio';
import type { Habit, Log } from './habits';
import { dayState } from './habits';
import { addDays } from './gaps';
import type { Goal } from './goals';

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

export function cardioCsv(all: Record<string, Cardio[]>, weightKg: number | null): string {
  const rows: (string | number | undefined)[][] = [];
  for (const d of Object.keys(all).sort()) {
    for (const c of all[d]) {
      rows.push([d, CARDIO[c.type].label, c.minutes, INTENSITY[c.intensity].label, c.km, c.steps, weightKg ? Math.round(metOf(c) * weightKg * (c.minutes / 60)) : undefined]);
    }
  }
  return toCsv(['التاريخ', 'النوع', 'الدقايق', 'السرعة', 'المسافة (كم)', 'الخطوات', 'سعرات تقريبية'], rows);
}

/** One row per habit per day from its start to today: done / excused / missed / off / paused. */
export function habitsCsv(habits: readonly Habit[], log: Log, today: string): string {
  const word = { done: 'عملتها', skip: 'معذور', missed: 'فوّتها', today: 'النهارده', off: 'مش عليك', paused: 'متوقفة', before: '', future: '' } as const;
  const rows: string[][] = [];
  for (const h of habits) {
    for (let d = h.start; d <= today; d = addDays(d, 1)) rows.push([d, h.name, word[dayState(h, log, d, today)]]);
  }
  rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return toCsv(['التاريخ', 'العادة', 'الحالة'], rows);
}

/** Goals: every logged bit of progress and every finished task, oldest first, with the total after each. */
export function goalsCsv(goals: readonly Goal[]): string {
  const rows: (string | number)[][] = [];
  for (const g of goals) {
    const events = [
      ...g.entries.map((e) => ({ date: e.date, kind: 'تقدّم', what: e.note ?? '', amount: e.amount })),
      ...g.stages.flatMap((s) => s.tasks.filter((t) => t.done).map((t) => ({ date: t.done as string, kind: 'خطوة', what: `${s.title}: ${t.title}`, amount: 0 }))),
    ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    let total = g.start;
    for (const e of events) {
      total += e.amount;
      rows.push([g.name, e.date, e.kind, e.what, e.amount || '', total, g.target, g.unit]);
    }
  }
  return toCsv(['الهدف', 'التاريخ', 'النوع', 'التفاصيل', 'الكمية', 'الإجمالي', 'الهدف', 'الوحدة'], rows);
}
