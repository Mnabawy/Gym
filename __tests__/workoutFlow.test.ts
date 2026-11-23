import { FACTS, HADITHS } from '../src/data/workoutQuotes';
import { nextToOpen, quoteFor } from '../src/lib/workoutFlow';

const ex = [
  { id: 'a', sets: 3 },
  { id: 'b', sets: 3 },
  { id: 'c', sets: 2 },
  { id: 'd', sets: 3 },
];

describe('nextToOpen', () => {
  it('opens the next one in order', () => {
    expect(nextToOpen(ex, { a: 3 }, 'a')).toBe('b');
  });
  it('skips finished ones after it', () => {
    expect(nextToOpen(ex, { a: 3, b: 3, c: 2 }, 'b')).toBe('d');
  });
  it('comes back to one you skipped when the rest are done', () => {
    expect(nextToOpen(ex, { b: 3, c: 2, d: 3 }, 'd')).toBe('a');
    expect(nextToOpen(ex, { c: 2, d: 3 }, 'c')).toBe('a');
  });
  it('is null when the workout is done', () => {
    expect(nextToOpen(ex, { a: 3, b: 3, c: 2, d: 3 }, 'd')).toBeNull();
  });
  it('an unknown id starts from the top', () => {
    expect(nextToOpen(ex, { a: 3 }, 'zz')).toBe('b');
  });
});

describe('quoteFor', () => {
  it('takes turns: hadith, fact, hadith…', () => {
    expect(quoteFor(0)).toBe(HADITHS[0]);
    expect(quoteFor(1)).toBe(FACTS[0]);
    expect(quoteFor(2)).toBe(HADITHS[1]);
    expect(quoteFor(3)).toBe(FACTS[1]);
  });
  it('goes round each list', () => {
    expect(quoteFor(HADITHS.length * 2)).toBe(HADITHS[0]);
    expect(quoteFor(FACTS.length * 2 + 1)).toBe(FACTS[0]);
    expect(quoteFor(-5)).toBe(HADITHS[0]);
  });
  it('every quote has text and a source', () => {
    for (const q of [...HADITHS, ...FACTS]) {
      expect(q.text.trim().length).toBeGreaterThan(10);
      expect(q.source.trim().length).toBeGreaterThan(0);
    }
  });
});
