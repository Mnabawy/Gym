import { buildDay, firstFree, hm, leftovers, splitPast, suggest, mealAt, mealsOn, moveTo, nextItem, nowItem, pickFor, placeAt, slotStarts, spanAr, topFor, unscheduled, type Fixed } from '../src/lib/dayPlan';
import { parseTask, toggleTask, type Task } from '../src/lib/tasks';

const D = '2026-11-18';
const task = (p: Partial<Task> & { id: string }): Task => ({ title: p.id, due: D, time: null, priority: 3, subs: [], repeat: null, remind: false, done: null, created: '2026-11-01', ...p });

describe('mealAt', () => {
  it('reads the plan times', () => {
    expect(mealAt('الفطار', true, null)).toBe(8 * 60);
    expect(mealAt('الغدا', false, null)).toBe(13 * 60);
  });
  it('ties the smoothie and dinner to the workout', () => {
    const gym = { at: 19 * 60, end: 20 * 60 + 30 };
    expect(mealAt('السموزي', true, gym)).toBe(18 * 60);
    expect(mealAt('العشا', true, gym)).toBe(20 * 60 + 30);
    expect(mealAt('السموزي', true, null)).toBeNull();
  });
  it('night meals and «أي وقت»', () => {
    expect(mealAt('العشا', false, null)).toBe(20 * 60);
    expect(mealAt('السناك', false, null)).toBe(22 * 60);
    expect(mealAt('السموزي', false, null)).toBeNull();
  });
  it('mealsOn skips untimed ones and marks ticked ones', () => {
    const m = mealsOn(false, null, { الغدا: 'فراخ' }, new Set(['الفطار']));
    expect(m.map((x) => x.title)).toEqual(['الفطار', 'الغدا', 'العشا', 'السناك']);
    expect(m[0].done).toBe(true);
    expect(m[1].sub).toBe('فراخ');
  });
});

describe('buildDay', () => {
  const fixed: Fixed[] = [
    { kind: 'prayer', id: 'p:dhuhr', at: 700, mins: 0, title: 'الضهر' },
    { kind: 'meal', id: 'meal:الغدا', at: 780, mins: 30, title: 'الغدا' },
    { kind: 'gym', id: 'gym', at: 1140, mins: 90, title: 'الجيم' },
  ];
  const tasks = [task({ id: 'a', time: 900, mins: 120 }), task({ id: 'b' }), task({ id: 'c', time: 600, due: '2026-11-19' })];
  const day = buildDay({ date: D, fixed, tasks, now: null, start: 600, end: 1320 });

  it('sorts fixed items and timed tasks of that day', () => {
    expect(day.filter((i) => i.kind !== 'free').map((i) => i.id)).toEqual(['p:dhuhr', 'meal:الغدا', 'a', 'gym']);
  });
  it('finds free gaps of 30 minutes or more', () => {
    const free = day.filter((i) => i.kind === 'free').map((i) => [i.at, i.end]);
    // 10:00–11:40, 12:00–13:00 (after the prayer, on the quarter), 13:30–15:00, 17:00–19:00, 20:30–22:00
    expect(free).toEqual([[600, 700], [720, 780], [810, 900], [1020, 1140], [1230, 1320]]);
  });
  it('starts free time from now on today', () => {
    const d = buildDay({ date: D, fixed, tasks, now: 1003, start: 600, end: 1320 });
    // The block runs till 17:00, so the first free time after now starts then.
    expect(d.filter((i) => i.kind === 'free').map((i) => i.at)).toEqual([1020, 1230]);
  });
  it('keeps a task finished that day, drops one finished before', () => {
    const d = buildDay({ date: D, fixed: [], tasks: [task({ id: 'x', time: 600, done: D }), task({ id: 'y', time: 700, done: '2026-11-17' })], now: null });
    expect(d.filter((i) => i.kind === 'task').map((i) => [i.id, i.done])).toEqual([['x', true]]);
  });
  it('now and next', () => {
    expect(nowItem(day, 950)?.id).toBe('a');
    expect(nowItem(day, 1100)).toBeNull();
    expect(nextItem(day, 1100)?.id).toBe('gym');
  });
});

describe('work hours, the past, suggestions', () => {
  const work: Fixed = { kind: 'work', id: 'work', at: 600, mins: 480, title: 'الشغل' };
  const fixed: Fixed[] = [
    { kind: 'prayer', id: 'p:fajr', at: 300, mins: 0, title: 'الفجر' },
    { kind: 'meal', id: 'meal:الفطار', at: 480, mins: 30, title: 'الفطار', done: true },
    { kind: 'meal', id: 'meal:الغدا', at: 780, mins: 30, title: 'الغدا' },
    work,
  ];
  it('work hours are busy: no free time inside them', () => {
    const d = buildDay({ date: D, fixed, tasks: [], now: null, start: 480, end: 1320 });
    expect(d.filter((i) => i.kind === 'free').map((i) => [i.at, i.end])).toEqual([[510, 600], [1080, 1320]]);
  });
  it('nowItem prefers a block over work hours', () => {
    const d = buildDay({ date: D, fixed, tasks: [task({ id: 'a', time: 660, mins: 60 })], now: null });
    expect(nowItem(d, 670)?.id).toBe('a');
    expect(nowItem(d, 900)?.id).toBe('work');
  });
  it('splitPast folds prayers, work and done things; keeps an unticked meal and an open task', () => {
    const d = buildDay({ date: D, fixed, tasks: [task({ id: 'late', time: 500 })], now: 1100 });
    const { past, rest } = splitPast(d, 1100);
    expect(past.map((i) => i.id)).toEqual(['p:fajr', 'meal:الفطار', 'work']);
    expect(rest.map((i) => i.id).slice(0, 2)).toEqual(['late', 'meal:الغدا']);
  });
  it('firstFree: the first slot that fits, else the first one', () => {
    const d = buildDay({ date: D, fixed, tasks: [], now: null, start: 480, end: 1320 });
    expect(firstFree(d, 60)).toEqual({ at: 510, end: 600 });
    expect(firstFree(d, 120)).toEqual({ at: 1080, end: 1320 });
    expect(firstFree(d, 600)).toEqual({ at: 510, end: 600 });
  });
  it('suggest: a top pick with no time, in free time or work hours', () => {
    const top = [task({ id: 'p', top: D, space: 'personal' }), task({ id: 'w', top: D, space: 'work' }), task({ id: 't', top: D, time: 900 })];
    const d = buildDay({ date: D, fixed, tasks: top, now: 1085 });
    expect(suggest(d, top, 1085, D)).toMatchObject({ task: { id: 'p' }, at: 1095 });
    // during work hours, a work pick first
    const w = buildDay({ date: D, fixed, tasks: top, now: 700 });
    expect(suggest(w, top, 700, D)).toMatchObject({ task: { id: 'w' }, at: 700, end: 1080 });
    // a block running now: nothing to suggest
    expect(suggest(w, top, 905, D)).toBeNull();
    expect(suggest(d, [], 1085, D)).toBeNull();
  });
});

describe('top 3 and moving tasks', () => {
  const list = [
    task({ id: 'a', top: D, priority: 2 }),
    task({ id: 'b', top: D, priority: 1, done: D }),
    task({ id: 'c', top: D, priority: 1 }),
    task({ id: 'd', top: '2026-11-17' }),
    task({ id: 'e', due: null }),
    task({ id: 'f', due: '2026-11-15' }),
    task({ id: 'g', time: 600 }),
  ];
  it('topFor: open first, by priority, max 3', () => {
    expect(topFor(list, D).map((t) => t.id)).toEqual(['c', 'a', 'b']);
  });
  it('unscheduled: no time, late or no day; top picks first', () => {
    expect(unscheduled(list, D).map((t) => t.id)).toEqual(['c', 'a', 'd', 'f', 'e']);
  });
  it('leftovers: open, today or before', () => {
    expect(leftovers(list, D).map((t) => t.id)).toEqual(['a', 'c', 'd', 'f', 'g']);
  });
  it('moveTo drops time, reminder and the top mark', () => {
    const m = moveTo(task({ id: 'z', time: 600, remind: true, top: D, mins: 50 }), '2026-11-19');
    expect(m).toMatchObject({ due: '2026-11-19', time: null, remind: false, mins: 50 });
    expect(m.top).toBeUndefined();
    expect(moveTo(task({ id: 'z' }), null).due).toBeNull();
  });
  it('pickFor: same day keeps the time, an earlier task moves over without its time', () => {
    expect(pickFor(task({ id: 'z', time: 600, remind: true }), D)).toMatchObject({ top: D, due: D, time: 600, remind: true });
    expect(pickFor(task({ id: 'z', time: 600, remind: true }), '2026-11-19')).toMatchObject({ top: '2026-11-19', due: '2026-11-19', time: null, remind: false });
    expect(pickFor(task({ id: 'z', due: null }), D)).toMatchObject({ due: D, time: null });
    expect(pickFor(task({ id: 'z', due: '2026-11-25', time: 600 }), D)).toMatchObject({ top: D, due: '2026-11-25', time: 600 });
  });
  it('placeAt sets the day, time and length', () => {
    expect(placeAt(task({ id: 'z', due: null }), D, 720, 50)).toMatchObject({ due: D, time: 720, mins: 50 });
  });
  it('a repeating top task: the done copy keeps the mark, the next one drops it', () => {
    const l = toggleTask([task({ id: 'r', repeat: 'daily', top: D })], 'r', D, 'r2');
    expect(l.find((t) => t.id === 'r')?.top).toBeUndefined();
    expect(l.find((t) => t.id === 'r2')?.top).toBe(D);
  });
  it('parseTask keeps mins and top, drops bad ones', () => {
    expect(parseTask({ id: 'a', title: 'x', mins: 50, top: D })).toMatchObject({ mins: 50, top: D });
    const bad = parseTask({ id: 'a', title: 'x', mins: 2, top: 'soon' })!;
    expect(bad.mins).toBeUndefined();
    expect(bad.top).toBeUndefined();
  });
});

describe('helpers', () => {
  it('slotStarts', () => {
    expect(slotStarts(715, 780)).toEqual([715, 720, 750]);
    expect(slotStarts(720, 750)).toEqual([720]);
  });
  it('spanAr and hm', () => {
    expect(spanAr(25)).toBe('25 د');
    expect(spanAr(90)).toBe('ساعة ونص');
    expect(spanAr(120)).toBe('ساعتين');
    expect(hm(900)).toBe('3:00');
    expect(hm(705)).toBe('11:45');
    expect(hm(0)).toBe('12:00');
  });
});
