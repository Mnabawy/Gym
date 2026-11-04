/// <reference types="jest" />
import { CITIES, clock12, countdown, nextPrayer, parsePlace, PRAYERS, timesFor, untilAr } from '../src/lib/prayer';

const CAIRO = { lat: 30.0444, lng: 31.2357 };
const DAY = new Date(Date.UTC(2026, 10, 4, 10)); // 4 Nov 2026, midday in Cairo

describe('timesFor', () => {
  const t = timesFor(CAIRO, DAY);
  test('in order through the day', () => {
    for (let i = 1; i < PRAYERS.length; i++) expect(t[PRAYERS[i]].getTime()).toBeGreaterThan(t[PRAYERS[i - 1]].getTime());
  });
  test('Dhuhr just after solar noon in Cairo (≈ 09:39 UTC in early November)', () => {
    const utcMin = t.dhuhr.getUTCHours() * 60 + t.dhuhr.getUTCMinutes();
    expect(utcMin).toBeGreaterThanOrEqual(9 * 60 + 35);
    expect(utcMin).toBeLessThanOrEqual(9 * 60 + 45);
  });
  test('Fajr about 1h20 before sunrise (Egyptian 19.5°)', () => {
    const gap = (t.sunrise.getTime() - t.fajr.getTime()) / 60000;
    expect(gap).toBeGreaterThan(70);
    expect(gap).toBeLessThan(95);
  });
  test('methods differ where they should', () => {
    expect(timesFor(CAIRO, DAY, 'mwl').fajr.getTime()).toBeGreaterThan(t.fajr.getTime()); // 18° vs 19.5°
  });
});

describe('nextPrayer', () => {
  const t = timesFor(CAIRO, DAY);
  test('skips sunrise', () => {
    expect(nextPrayer(CAIRO, new Date(t.fajr.getTime() + 60000)).key).toBe('dhuhr');
  });
  test('the next one during the day', () => {
    expect(nextPrayer(CAIRO, new Date(t.dhuhr.getTime() + 60000))).toEqual({ key: 'asr', at: t.asr });
  });
  test("after Isha → tomorrow's Fajr", () => {
    const n = nextPrayer(CAIRO, new Date(t.isha.getTime() + 60000));
    expect(n.key).toBe('fajr');
    expect(n.at.getTime()).toBeGreaterThan(t.isha.getTime());
    expect(n.at.getTime() - t.fajr.getTime()).toBeGreaterThan(23 * 3600000);
  });
});

test('clock12', () => {
  expect(clock12(new Date(2026, 10, 4, 4, 41))).toBe('4:41 ص');
  expect(clock12(new Date(2026, 10, 4, 12, 5))).toBe('12:05 م');
  expect(clock12(new Date(2026, 10, 4, 0, 30))).toBe('12:30 ص');
  expect(clock12(new Date(2026, 10, 4, 17, 2))).toBe('5:02 م');
});

test('untilAr', () => {
  expect(untilAr(20_000)).toBe('دقيقة');
  expect(untilAr(0)).toBe('أقل من دقيقة');
  expect(untilAr(3 * 60_000)).toBe('3 دقايق');
  expect(untilAr(85 * 60_000)).toBe('ساعة و25 دقيقة');
  expect(untilAr(120 * 60_000)).toBe('ساعتين');
});

test('city list is valid and in range', () => {
  expect(new Set(CITIES.map((c) => c.name)).size).toBe(CITIES.length);
  for (const c of CITIES) expect(parsePlace({ ...c, at: 0 })).toMatchObject({ lat: c.lat, lng: c.lng });
});

test('parsePlace rejects junk', () => {
  expect(parsePlace(null)).toBeNull();
  expect(parsePlace({ lat: 200, lng: 0 })).toBeNull();
  expect(parsePlace({ lat: 30, lng: 31, name: 'القاهرة', at: 5 })).toEqual({ lat: 30, lng: 31, name: 'القاهرة', at: 5 });
  expect(parsePlace({ lat: 30, lng: 31, at: 5, manual: true })?.manual).toBe(true);
});

test('countdown', () => {
  expect(countdown(3_909_000)).toBe('1:05:09');
  expect(countdown(247_000)).toBe('4:07');
  expect(countdown(-5)).toBe('0:00');
});
