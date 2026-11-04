/// <reference types="jest" />
import { ALL_EXERCISES } from '../src/data/program';
import { FORM_VIDEOS, videoUrl } from '../src/data/videos';

test('every exercise has a form video with a valid YouTube id', () => {
  for (const e of ALL_EXERCISES) {
    const v = FORM_VIDEOS[e.id];
    expect(v).toBeDefined();
    expect(v.id).toMatch(/^[\w-]{11}$/);
    expect(v.views).toBeGreaterThan(0);
  }
  expect(Object.keys(FORM_VIDEOS).sort()).toEqual(ALL_EXERCISES.map((e) => e.id).sort());
});

test('shorts and regular videos get the right link', () => {
  expect(videoUrl({ id: 'abcdefghijk', short: true, title: '', channel: '', views: 1 })).toBe('https://www.youtube.com/shorts/abcdefghijk');
  expect(videoUrl({ id: 'abcdefghijk', short: false, title: '', channel: '', views: 1 })).toBe('https://www.youtube.com/watch?v=abcdefghijk');
});
