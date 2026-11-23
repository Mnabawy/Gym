/// <reference types="jest" />
import { dayKey } from '../src/lib/journal';
import {
  bestBySet,
  setHint,
  doneLine,
  doneSets,
  fmt,
  isRecord,
  iso,
  lineAt,
  missingOf,
  prevBestFor,
  rirAr,
  stepValue,
  suggest,
  tickedRow,
  toRow,
  type Row,
} from '../src/lib/setRows';

const row = (kg: string, reps: string, done = false, rir: number | null = null, at: number | null = null): Row => ({ kg, reps, done, rir, at });
const set = (kg: number | null, reps: number | null, done = true) => ({ kg, reps, done });

test('toRow: empty and saved sets', () => {
  expect(toRow()).toEqual(row('', ''));
  expect(toRow({ kg: 0, reps: 8, done: true, rir: 2, at: 5 })).toEqual(row('0', '8', true, 2, 5));
  expect(toRow({ kg: null, reps: 10, done: false })).toEqual(row('', '10'));
});

test('rirAr, fmt, iso', () => {
  expect(rirAr(0)).toBe('فشل');
  expect(rirAr(2)).toBe('فاضل 2');
  expect(rirAr(4)).toBe('فاضل +4');
  expect(rirAr(7)).toBe('فاضل +4');
  expect(fmt(2.5)).toBe('2.5');
  expect(fmt(0.1 + 0.2)).toBe('0.3');
  expect(fmt(2.456)).toBe('2.46');
  expect(iso('5')).toBe('⁦5⁩');
});

test('missingOf: 0 kg is fine (bodyweight), 0 reps is not', () => {
  expect(missingOf({ kg: '0', reps: '8' })).toEqual({ kg: false, reps: false });
  expect(missingOf({ kg: '', reps: '8' })).toEqual({ kg: true, reps: false });
  expect(missingOf({ kg: '20', reps: '0' })).toEqual({ kg: false, reps: true });
  expect(missingOf({ kg: '', reps: '' })).toEqual({ kg: true, reps: true });
  expect(missingOf({ kg: '٨٢٫٥', reps: '١٠' })).toEqual({ kg: false, reps: false });
});

test('lineAt: first not done, else the last', () => {
  expect(lineAt([row('', ''), row('', '')])).toBe(0);
  expect(lineAt([row('1', '1', true), row('', ''), row('', '')])).toBe(1);
  expect(lineAt([row('1', '1', true), row('1', '1', true)])).toBe(1);
});

describe('suggest', () => {
  const last = [set(50, 10), set(55, 8)];
  test('saved values win', () => {
    expect(suggest(0, [row('60', '6')], last)).toEqual({ at: 0, kg: '60', reps: '6' });
  });
  test('weight from the set before today, reps from the same set last time', () => {
    expect(suggest(1, [row('60', '6', true), row('', '')], last)).toEqual({ at: 1, kg: '60', reps: '8' });
  });
  test('past the end of last time: its last set', () => {
    expect(suggest(2, [row('', ''), row('', ''), row('', '')], last)).toEqual({ at: 2, kg: '55', reps: '8' });
  });
  test('no last time: reps from the set before', () => {
    expect(suggest(1, [row('60', '6', true), row('', '')], undefined)).toEqual({ at: 1, kg: '60', reps: '6' });
  });
  test('nothing at all: empty', () => {
    expect(suggest(0, [row('', '')], undefined)).toEqual({ at: 0, kg: '', reps: '' });
  });
});

describe('stepValue', () => {
  test('empty fields: reps start at the bottom of the range, weight at one step (or 0 going down)', () => {
    expect(stepValue('', 'reps', 1, 2.5, 8)).toBe('8');
    expect(stepValue('', 'reps', -1, 2.5, 8)).toBe('8');
    expect(stepValue('', 'kg', 1, 2.5, 8)).toBe('2.5');
    expect(stepValue('', 'kg', -1, 2.5, 8)).toBe('0');
  });
  test('moves by the weight step or by 1 rep', () => {
    expect(stepValue('20', 'kg', 1, 2.5, 8)).toBe('22.5');
    expect(stepValue('20', 'kg', -1, 2.5, 8)).toBe('17.5');
    expect(stepValue('10', 'reps', 1, 2.5, 8)).toBe('11');
  });
  test('never below 0', () => {
    expect(stepValue('1', 'kg', -1, 2.5, 8)).toBe('0');
    expect(stepValue('0', 'reps', -1, 2.5, 8)).toBe('0');
  });
  test('rounds float noise and reads typed decimals', () => {
    expect(stepValue('0.1', 'kg', 1, 0.2, 8)).toBe('0.3');
    expect(stepValue('82,5', 'kg', 1, 1.25, 8)).toBe('83.75');
  });
});

describe('tickedRow', () => {
  test('ticks with the shown values and the time when live', () => {
    expect(tickedRow(row('', ''), { kg: '60', reps: '8' }, 123)).toEqual(row('60', '8', true, null, 123));
  });
  test('a past day has no time', () => {
    expect(tickedRow(row('', ''), { kg: '60', reps: '8' }, null)).toEqual(row('60', '8', true, null, null));
  });
  test('untick keeps the numbers, drops RIR and time', () => {
    expect(tickedRow(row('60', '8', true, 2, 99), { kg: '1', reps: '1' }, 5)).toEqual(row('60', '8', false, null, null));
  });
});

test('prevBestFor: only days before, same variant', () => {
  const hist = [
    { date: '2026-11-01', sets: [set(100, 5)] },
    { date: '2026-11-03', sets: [set(200, 5)] }, // swapped day
    { date: '2026-11-05', sets: [set(110, 5, false), set(90, 5)] }, // not done ignored
    { date: '2026-11-10', sets: [set(300, 5)] }, // today
  ];
  const swaps = { [dayKey('2026-11-03', 'bench')]: 'Dumbbell Press' };
  expect(prevBestFor(hist, '2026-11-10', 'bench', swaps, null)).toBeCloseTo(116.7, 1);
  expect(prevBestFor(hist, '2026-11-10', 'bench', swaps, 'Dumbbell Press')).toBeCloseTo(233.3, 1);
  expect(prevBestFor([], '2026-11-10', 'bench', {}, null)).toBe(0);
});

test('doneSets and doneLine', () => {
  const rows = [row('60', '8', true), row('', '12', true), row('70', '', true), row('80', '5')];
  const done = doneSets(rows);
  expect(done).toEqual([set(60, 8), set(null, 12), set(70, null)]);
  expect(doneLine(done)).toBe('60×8 · 12 · 70×–');
  expect(doneLine([set(0, 10)])).toBe('10');
  expect(doneLine([set(22.5, 6)])).toBe('22.5×6');
});

test('isRecord: beats the best before, only when there was one', () => {
  expect(isRecord(100, [set(100, 5)])).toBe(true);
  expect(isRecord(200, [set(100, 5)])).toBe(false);
  expect(isRecord(0, [set(100, 5)])).toBe(false);
});

describe('per-set history', () => {
  const s = (kg: number | null, reps: number | null, done = true) => ({ kg, reps, done });
  const hist = [
    { date: '2026-11-01', sets: [s(60, 8), s(65, 6), s(70, 4, false)] },
    { date: '2026-11-05', sets: [s(62.5, 8), s(60, 8)] },
    { date: '2026-11-08', sets: [s(100, 5)] }, // swapped that day
    { date: '2026-11-22', sets: [s(90, 5)] }, // today
  ];
  it('heaviest done weight per set, before today, same variant', () => {
    expect(bestBySet(hist, '2026-11-22', 'x', { '2026-11-08|x': 'Other' }, null)).toEqual([62.5, 65]);
  });
  it('hint text', () => {
    expect(setHint(s(60, 8), 65)).toBe('آخر مرة 60×8 · أعلى 65 كجم');
    expect(setHint(undefined, null)).toBe('');
    expect(setHint(s(null, 12), null)).toBe('آخر مرة 12');
  });
});
