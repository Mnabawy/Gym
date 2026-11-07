/// <reference types="jest" />
import { clean, cleanDays, DAY_MS, longest, milestone, parseQuits, quitsWeek, reached, riskyTime, runLabel, runStart, saved, target, triggerCounts, urgeScore, type Quit } from '../src/lib/quit';

const at = (s: string) => new Date(s).getTime();
const q: Quit = {
  id: 'q1', name: 'سجاير', icon: 'ban', color: '#7A5CFA', start: at('2026-11-01T10:00:00'), why: 'صحتي', replace: 'مية', costPerDay: 50, currency: 'ج.م', minutesPerDay: 30,
  type: 'smoking', targetDays: 100,
  slips: [{ at: at('2026-11-04T23:00:00'), trigger: 'stress' }],
  urges: [{ at: at('2026-11-03T22:30:00'), resisted: true, trigger: 'stress' }, { at: at('2026-11-05T15:00:00'), resisted: false, trigger: 'bored' }],
};
const NOW = at('2026-11-06T11:00:00');

test('parse keeps good quits and drops broken entries', () => {
  const raw = JSON.stringify([q, { ...q }, { ...q, id: 'x', start: 0 }, { ...q, id: 'y', slips: [{ at: 'x' }, { at: 5, trigger: 'nope' }] }]);
  const qs = parseQuits(raw);
  expect(qs.map((x) => x.id)).toEqual(['q1', 'y']);
  expect(qs[1].slips).toEqual([{ at: 5 }]);
  expect(parseQuits('bad')).toEqual([]);
});

test('the clean run starts at the last slip', () => {
  expect(runStart(q)).toBe(at('2026-11-04T23:00:00'));
  const c = clean(q, NOW);
  expect(c).toMatchObject({ days: 1, hours: 12, minutes: 0 });
  expect(clean({ ...q, slips: [] }, NOW).days).toBe(5);
});

test('milestones', () => {
  expect(milestone(0)).toEqual({ prev: 0, next: 1, share: 0 });
  expect(milestone(2 * DAY_MS)).toMatchObject({ prev: 1, next: 3, share: 0.5 });
  expect(milestone(10 * DAY_MS)).toMatchObject({ prev: 7, next: 14 });
  expect(milestone(400 * DAY_MS)).toMatchObject({ prev: 365, next: 730 });
  expect(reached(8 * DAY_MS)).toEqual([1, 3, 7]);
});

test('a slip keeps the record: longest run, clean days, saved', () => {
  expect(longest(q, NOW)).toBe(at('2026-11-04T23:00:00') - q.start);
  expect(cleanDays(q, NOW)).toEqual({ total: 6, clean: 5, rate: 5 / 6 });
  const s = saved(q, NOW);
  expect(s.money).toBe(Math.round(50 * ((NOW - q.start) / DAY_MS - 1)));
  expect(s.minutes).toBe(Math.round(30 * ((NOW - q.start) / DAY_MS - 1)));
});

test('target: days done, days left, done at the target', () => {
  expect(target(q, NOW)).toEqual({ days: 1, left: 99, share: (NOW - runStart(q)) / (100 * DAY_MS), done: false });
  const hit = { ...q, targetDays: 1 };
  expect(target(hit, NOW)).toMatchObject({ share: 1, done: true });
});

test('parse fills type and target, defaulting a bad type to habit', () => {
  expect(parseQuits(JSON.stringify([{ ...q, type: 'nope', targetDays: undefined }]))[0]).toMatchObject({ type: 'habit', targetDays: 66 });
});

test('triggers, risky time, urges', () => {
  expect(triggerCounts(q)).toEqual([{ trigger: 'stress', slips: 1, urges: 1 }, { trigger: 'bored', slips: 0, urges: 1 }]);
  expect(riskyTime(q)?.key).toBe('late'); // 22:30 and 23:00
  expect(riskyTime({ ...q, urges: [] })).toBeNull();
  expect(urgeScore(q)).toEqual({ resisted: 1, total: 2 });
});

test('a week of a quit', () => {
  expect(quitsWeek([q], '2026-10-31', '2026-11-06', '2026-11-06')).toEqual([{ id: 'q1', cleanDays: 5, slips: 1, resisted: 1, urges: 2 }]);
  expect(quitsWeek([q], '2026-10-24', '2026-10-30', '2026-11-06')).toEqual([]);
});

test('run in words', () => {
  expect(runLabel(12 * DAY_MS + 5)).toBe('12 يوم');
  expect(runLabel(DAY_MS)).toBe('يوم واحد');
  expect(runLabel(3 * 3600000)).toBe('3 ساعة');
  expect(runLabel(5 * 60000)).toBe('5 دقيقة');
});
