/// <reference types="jest" />
// src/lib/meta.ts: per-entry writes keep old dated history (it syncs one row per entry), and removeEntries.
const mockSaved: Record<string, string> = {};
jest.mock('../src/lib/storage', () => ({
  storage: { getMeta: (k: string) => mockSaved[k] ?? null, setMeta: (k: string, v: string) => void (mockSaved[k] = v) },
}));
// eslint-disable-next-line import/first
import { readNumbers, readStrings, removeEntries, writeEntry } from '../src/lib/meta';
// eslint-disable-next-line import/first
import { dayKey, isDaySwap, SUPPS_KEY, SWAPS_KEY, WATER_KEY } from '../src/lib/journal';

beforeEach(() => {
  for (const k of Object.keys(mockSaved)) delete mockSaved[k];
});

test('writing water keeps entries older than 120 days (no prune that would sync as deletes)', () => {
  mockSaved[WATER_KEY] = JSON.stringify({ '2025-01-01': 2000 });
  mockSaved[SUPPS_KEY] = JSON.stringify({ '2025-01-01|كرياتين': 1 });
  writeEntry(WATER_KEY, 'number', '2026-11-16', 500);
  writeEntry(SUPPS_KEY, 'number', '2026-11-16|كرياتين', 1);
  expect(readNumbers(WATER_KEY)).toEqual({ '2025-01-01': 2000, '2026-11-16': 500 });
  expect(Object.keys(readNumbers(SUPPS_KEY))).toEqual(['2025-01-01|كرياتين', '2026-11-16|كرياتين']);
});

test('removeEntries drops a cleared day\'s swaps and nothing else', () => {
  mockSaved[SWAPS_KEY] = JSON.stringify({
    [dayKey('2026-11-03', 'deadlift')]: 'Trap Bar Deadlift',
    [dayKey('2026-11-04', 'deadlift')]: 'Rack Pull',
    [dayKey('2026-11-03', 'other')]: 'X',
  });
  removeEntries(SWAPS_KEY, (k) => isDaySwap(k, '2026-11-03', ['deadlift', 'lat-pulldown']));
  expect(readStrings(SWAPS_KEY)).toEqual({ [dayKey('2026-11-04', 'deadlift')]: 'Rack Pull', [dayKey('2026-11-03', 'other')]: 'X' });
});

test('removeEntries writes nothing when nothing matches', () => {
  const before = JSON.stringify({ 'b|x': 'y' });
  mockSaved[SWAPS_KEY] = before;
  removeEntries(SWAPS_KEY, () => false);
  expect(mockSaved[SWAPS_KEY]).toBe(before);
  removeEntries('missing', () => true);
  expect(mockSaved.missing).toBeUndefined();
});
