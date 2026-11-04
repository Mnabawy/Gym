/// <reference types="jest" />
import { VERSES } from '../src/data/verses';
import { arabicDigits, nextVerseIndex } from '../src/lib/logic';

describe('verses data', () => {
  test('every entry has one text per ayah and a valid reference', () => {
    for (const v of VERSES) {
      expect(v.surah.length).toBeGreaterThan(1);
      expect(v.n).toBeGreaterThanOrEqual(1);
      expect(v.n).toBeLessThanOrEqual(114);
      expect(v.ayahs.length).toBe(v.text.length);
      for (const line of v.text) expect(line.trim()).toBe(line);
      for (const line of v.text) expect(line.length).toBeGreaterThan(5);
    }
  });
  test('multi-ayah entries are consecutive', () => {
    for (const v of VERSES) v.ayahs.forEach((a, i) => i > 0 && expect(a).toBe(v.ayahs[i - 1] + 1));
  });
  test('no duplicates', () => {
    const keys = VERSES.map((v) => `${v.n}:${v.ayahs.join(',')}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
  test('no stray pause marks at the edges', () => {
    for (const v of VERSES) for (const line of v.text) expect(line).not.toMatch(/^[ۖ-ۜ۞]|[ۖ-ۜ۞]$/);
  });
});

describe('nextVerseIndex', () => {
  test('walks the list in order and wraps', () => {
    expect(nextVerseIndex(0, 3)).toBe(1);
    expect(nextVerseIndex(2, 3)).toBe(0);
  });
  test('first run or a stale index starts at a random one', () => {
    expect(nextVerseIndex(null, 10, () => 0.55)).toBe(5);
    expect(nextVerseIndex(12, 10, () => 0)).toBe(0);
    expect(nextVerseIndex(NaN, 10, () => 0.99)).toBe(9);
  });
});

test('arabicDigits', () => {
  expect(arabicDigits(286)).toBe('٢٨٦');
  expect(arabicDigits('5–6')).toBe('٥–٦');
});
