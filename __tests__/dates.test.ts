import { addDays, addMonths, dateKey, daysBetween, monthCells, weekdayOf, weekStart } from '../src/lib/dates';
import { nextFriday } from '../src/lib/dump';
import { pruneTrash, type Task } from '../src/lib/tasks';
import { pruneAdhkar } from '../src/lib/adhkar';

// Node re-reads process.env.TZ on change, so each block can run the helpers in another zone.
const ZONES = ['UTC', 'Africa/Cairo', 'America/New_York', 'Pacific/Kiritimati', 'Etc/GMT+12'];
const saved = process.env.TZ;
afterAll(() => {
  process.env.TZ = saved;
});

describe.each(ZONES)('in %s', (tz) => {
  beforeAll(() => {
    process.env.TZ = tz;
  });

  test('dateKey is the local day', () => {
    expect(dateKey(new Date(2026, 0, 1, 0, 30))).toBe('2026-01-01');
    expect(dateKey(new Date(2025, 11, 31, 23, 59))).toBe('2025-12-31');
    expect(dateKey(new Date(2024, 1, 29, 12))).toBe('2024-02-29');
  });

  test('weekdayOf', () => {
    expect(weekdayOf('2026-11-17')).toBe(2); // Tuesday
    expect(weekdayOf('2026-11-14')).toBe(6); // Saturday
    expect(weekdayOf('2026-11-13')).toBe(5); // Friday
  });

  test('addDays over month, year and leap days', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01');
    expect(addDays('2026-11-17', 0)).toBe('2026-11-17');
    expect(addDays('2026-11-17', -365)).toBe('2025-11-17');
  });

  test('addDays and daysBetween across DST changes', () => {
    // Cairo: clocks jump 00:00 → 01:00 on 2024-04-26 (that midnight doesn't exist) and fall back on 2024-10-31.
    expect(addDays('2024-04-25', 1)).toBe('2024-04-26');
    expect(addDays('2024-04-26', 1)).toBe('2024-04-27');
    expect(addDays('2024-11-01', -1)).toBe('2024-10-31');
    expect(addDays('2024-10-31', 1)).toBe('2024-11-01');
    // New York: 2026-03-08 spring forward, 2026-11-01 fall back.
    expect(addDays('2026-03-07', 2)).toBe('2026-03-09');
    expect(addDays('2026-11-02', -2)).toBe('2026-10-31');
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
    expect(daysBetween('2024-04-01', '2024-11-30')).toBe(243);
    for (let i = 0, d = '2024-01-01'; i < 366; i++, d = addDays(d, 1)) expect(daysBetween('2024-01-01', d)).toBe(i);
  });

  test('daysBetween is signed', () => {
    expect(daysBetween('2026-10-31', '2026-11-04')).toBe(4);
    expect(daysBetween('2026-11-04', '2026-10-31')).toBe(-4);
    expect(daysBetween('2026-11-04', '2026-11-04')).toBe(0);
  });

  test('weekStart is the Saturday on or before', () => {
    expect(weekStart('2026-11-14')).toBe('2026-11-14'); // Saturday
    expect(weekStart('2026-11-17')).toBe('2026-11-14'); // Tuesday
    expect(weekStart('2026-11-20')).toBe('2026-11-14'); // Friday = last day of the week
    expect(weekStart('2026-11-21')).toBe('2026-11-21');
    expect(weekStart('2026-01-01')).toBe('2025-12-27'); // across the year
    expect(weekStart('2024-04-26')).toBe('2024-04-20'); // Cairo DST day
  });

  test('addMonths wraps years', () => {
    expect(addMonths(2026, 11, 1)).toEqual({ y: 2027, m: 0 });
    expect(addMonths(2026, 0, -1)).toEqual({ y: 2025, m: 11 });
    expect(addMonths(2026, 5, 0)).toEqual({ y: 2026, m: 5 });
  });

  test('monthCells: weeks from Saturday, padded with nulls', () => {
    const nov = monthCells(2026, 10); // Nov 1 2026 is a Sunday → one pad cell
    expect(nov[0]).toBeNull();
    expect(nov[1]).toBe('2026-11-01');
    expect(nov.length % 7).toBe(0);
    expect(nov.filter(Boolean)).toHaveLength(30);
    const apr = monthCells(2024, 3); // has the Cairo DST day
    expect(apr.filter(Boolean)).toHaveLength(30);
    expect(apr).toContain('2024-04-26');
    expect(monthCells(2026, 7)[0]).toBe('2026-08-01'); // Aug 1 2026 is a Saturday → no pad
  });

  // These used local noon + toISOString(), which slips a day where noon local isn't the same UTC day (UTC+12 and beyond, UTC−12).
  test('local-day callers stay on the right day', () => {
    expect(nextFriday('2026-11-17')).toBe('2026-11-20');
    expect(nextFriday('2026-11-20')).toBe('2026-11-27');
    const t = { id: 'a' } as Task;
    const trash = [
      { id: 'a', task: t, at: '2026-10-18' },
      { id: 'b', task: { ...t, id: 'b' }, at: '2026-10-17' },
    ];
    expect(pruneTrash(trash, [], '2026-11-17').map((x) => x.id)).toEqual(['a']);
    expect(Object.keys(pruneAdhkar({ '2026-11-10|morning': {}, '2026-11-09|morning': {} }, '2026-11-17'))).toEqual(['2026-11-10|morning']);
  });
});
