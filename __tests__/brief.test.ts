/// <reference types="jest" />
import { clock, morningBrief, type BriefInput } from '../src/lib/brief';
import { currentWorkout } from '../src/lib/schedule';

// Today Wed 4 Nov 2026; last session Mon 2 Nov was back (id 1), so chest (2) is due.
const TODAY = '2026-11-04';
const base: BriefInput = {
  today: TODAY,
  cur: currentWorkout([{ date: '2026-11-02', weekdays: [1], sets: 17 }], TODAY),
  days: [1, 2, 3, 5],
  workoutAt: 19 * 60,
  picks: {},
  waterL: 3,
  weights: [{ date: '2026-11-03', kg: 80 }],
  shopTrips: 1,
  shopMoves: {},
};

test('training day: workout, meals with times, water, prep', () => {
  const b = morningBrief(TODAY, base);
  expect(b.title).toContain('الأربع');
  expect(b.title).toContain('صدر وبايسبس');
  expect(b.body).toContain('7 بالليل');
  expect(b.body).toContain('🍽 الفطار (8 الصبح)');
  expect(b.body).toContain('3.5 لتر'); // +0.5 on a training day
  expect(b.body).toContain('شنطة الجيم');
  expect(b.body).not.toContain('اتوزن'); // weighed yesterday
});

test('rest day: no workout, plain water, weigh-in when it has been a week', () => {
  const b = morningBrief('2026-11-05', { ...base, weights: [{ date: '2026-10-28', kg: 80 }] }); // Thursday
  expect(b.title).toContain('يوم راحة');
  expect(b.body).toContain('3 لتر');
  expect(b.body).not.toContain('شنطة الجيم');
  expect(b.body).toContain('اتوزن');
});

test('next training day gets the next workout in the sequence', () => {
  // Fri 6 Nov: Wed is chest, Fri is the next training day → legs
  expect(morningBrief('2026-11-06', base).title).toContain('رجل وسمانة');
  expect(morningBrief('2026-11-06', base).body).toContain('طلّع الفراخ من الفريزر');
});

test('shopping day on Friday', () => {
  expect(morningBrief('2026-11-06', base).body).toContain('🛒');
  expect(morningBrief(TODAY, base).body).not.toContain('🛒');
});

test('clock: noon, midnight and the half hours', () => {
  expect(clock(720)).toBe('12 العصر');
  expect(clock(750)).toContain('12:30');
  expect(clock(750)).not.toMatch(/^0/);
  expect(clock(0)).toBe('12 الصبح');
  expect(clock(30)).toBe('12:30 الصبح');
  expect(clock(23 * 60 + 59)).toBe('11:59 بالليل');
});
