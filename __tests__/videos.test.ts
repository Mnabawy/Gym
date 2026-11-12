/// <reference types="jest" />
import { ALL_EXERCISES, RETIRED_EXERCISES } from '../src/data/program';
import { embedUrl, FORM_VIDEOS, videoUrl, viewsAr } from '../src/data/videos';

test('every exercise has a form video with a valid YouTube id', () => {
  for (const e of ALL_EXERCISES) {
    const v = FORM_VIDEOS[e.id];
    expect(v).toBeDefined();
    expect(v.id).toMatch(/^[\w-]{11}$/);
    expect(v.views).toBeGreaterThan(0);
  }
  // exercises that left the program keep theirs, in case you add them back
  expect(Object.keys(FORM_VIDEOS).sort()).toEqual([...ALL_EXERCISES, ...RETIRED_EXERCISES].map((e) => e.id).sort());
});

test('shorts and regular videos get the right link', () => {
  expect(videoUrl({ id: 'abcdefghijk', short: true, title: '', channel: '', views: 1 })).toBe('https://www.youtube.com/shorts/abcdefghijk');
  expect(videoUrl({ id: 'abcdefghijk', short: false, title: '', channel: '', views: 1 })).toBe('https://www.youtube.com/watch?v=abcdefghijk');
});

test('embed link and view counts', () => {
  expect(embedUrl('abcdefghijk')).toBe('https://www.youtube-nocookie.com/embed/abcdefghijk?autoplay=1&playsinline=1&rel=0&modestbranding=1');
  expect(viewsAr(59_000_000)).toBe('59 مليون');
  expect(viewsAr(1_520_865)).toBe('1.5 مليون');
  expect(viewsAr(563_000)).toBe('563 ألف');
});
