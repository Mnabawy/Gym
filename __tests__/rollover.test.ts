/// <reference types="jest" />
import { msUntilMidnight, weekdayOfKey } from '../src/lib/rollover';

describe('msUntilMidnight', () => {
  test('counts to the next local midnight', () => {
    expect(msUntilMidnight(new Date(2026, 10, 15, 23, 0, 0))).toBe(3600_000);
    expect(msUntilMidnight(new Date(2026, 10, 15, 0, 0, 0))).toBe(24 * 3600_000);
  });
  test('month and year ends', () => {
    expect(msUntilMidnight(new Date(2026, 11, 31, 23, 59, 0))).toBe(60_000);
  });
  test('never under one second', () => {
    expect(msUntilMidnight(new Date(2026, 10, 15, 23, 59, 59, 999))).toBe(1000);
  });
  test('follows the clock on a 23 or 25 hour day (DST)', () => {
    // Whatever the machine's zone, noon to next midnight equals the wall-clock gap, never a fixed 24h step.
    for (const d of [new Date(2026, 2, 29, 12), new Date(2026, 9, 25, 12), new Date(2026, 3, 24, 12)]) {
      const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
      expect(d.getTime() + msUntilMidnight(d)).toBe(next.getTime());
    }
  });
});

test('weekdayOfKey', () => {
  expect(weekdayOfKey('2026-11-15')).toBe(0); // Sunday
  expect(weekdayOfKey('2026-11-21')).toBe(6);
});
