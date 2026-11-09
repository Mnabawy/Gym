/// <reference types="jest" />
import { addLines, dumpView, nextFriday, parseDump, removeItem, setKind, splitLines } from '../src/lib/dump';

const T = '2026-11-09'; // Monday

test('lines become items, newest first, bullets and blanks dropped', () => {
  expect(splitLines('• أ\n\n- ب \n ج')).toEqual(['أ', 'ب', 'ج']);
  const a = addLines([], 'واحد\nاتنين', T, 1);
  expect(a.map((x) => x.text)).toEqual(['واحد', 'اتنين']);
  const b = addLines(a, 'تلاتة', T, 2);
  expect(b[0].text).toBe('تلاتة');
  expect(new Set(b.map((x) => x.id)).size).toBe(3);
});

test('sorting: worries with a day wait, ideas are kept, done ones go', () => {
  let l = addLines([], 'قلق\nفكرة\nمهمة', T, 1);
  const [worry, idea, task] = l;
  l = setKind(l, worry.id, 'worry', nextFriday(T));
  l = setKind(l, idea.id, 'idea');
  l = removeItem(l, task.id);
  const v = dumpView(l, T);
  expect(v.unsorted).toEqual([]);
  expect(v.worriesNow).toEqual([]);
  expect(v.worriesLater.map((x) => x.text)).toEqual(['قلق']);
  expect(v.ideas.map((x) => x.text)).toEqual(['فكرة']);
  expect(dumpView(l, '2026-11-13').worriesNow.map((x) => x.text)).toEqual(['قلق']);
  expect(parseDump(JSON.stringify(l))).toEqual(l);
  expect(parseDump('x')).toEqual([]);
});

test('next Friday', () => {
  expect(nextFriday('2026-11-09')).toBe('2026-11-13');
  expect(nextFriday('2026-11-13')).toBe('2026-11-20');
});
