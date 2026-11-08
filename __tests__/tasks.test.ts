/// <reference types="jest" />
import { addMonths, allView, counts, dayTasks, doneBetween, doneOn, dueCounts, from12, monthGrid, nextDue, parseTasks, tagColor, timeAr, to12, todayView, toggleTask, type Task } from '../src/lib/tasks';

// Sunday 8 Nov 2026
const T = '2026-11-08';
const mk = (o: Partial<Task>): Task => ({ id: 'x', title: 'مهمة', due: null, time: null, priority: 3, subs: [], repeat: null, remind: false, done: null, created: '2026-11-01', ...o });

test('parse drops broken tasks', () => {
  const ok = mk({ id: 'a', time: 600, remind: true });
  const list = parseTasks(JSON.stringify([{ ...ok, note: ' ملاحظة ', evening: true, urgent: true }, { ...ok }, { id: 'b', title: ' ' }, { ...ok, id: 'c', priority: 9, time: 5000, remind: true, due: 'x' }]));
  expect(list.map((t) => t.id)).toEqual(['a', 'c']);
  expect(list[0]).toEqual({ ...ok, note: 'ملاحظة' });
  expect(list[1]).toMatchObject({ priority: 3, time: null, remind: false, due: null });
  expect(parseTasks('nope')).toEqual([]);
});

test('views: today with overdue, a day, all open by day, the calendar dots', () => {
  const list = [
    mk({ id: 'late', due: '2026-11-07', priority: 1 }),
    mk({ id: 'pm', due: T, time: 20 * 60 }),
    mk({ id: 'am', due: T, time: 9 * 60 }),
    mk({ id: 'notime', due: T, priority: 1 }),
    mk({ id: 'done', due: T, done: T }),
    mk({ id: 'tue', due: '2026-11-10' }),
    mk({ id: 'mon', due: '2026-11-09' }),
    mk({ id: 'any2', priority: 2 }),
    mk({ id: 'any1', priority: 1 }),
  ];
  const v = todayView(list, T);
  expect(v.overdue.map((t) => t.id)).toEqual(['late']);
  expect(v.day.map((t) => t.id)).toEqual(['am', 'pm', 'notime']);
  expect(v.done.map((t) => t.id)).toEqual(['done']);
  expect(dayTasks(list, '2026-11-09').map((t) => t.id)).toEqual(['mon']);
  expect(doneOn(list, T).map((t) => t.id)).toEqual(['done']);
  expect(dueCounts(list)).toEqual({ '2026-11-07': 1, [T]: 3, '2026-11-09': 1, '2026-11-10': 1 });
  expect(allView(list, T).map((g) => [g.date, g.late, g.tasks.map((t) => t.id)])).toEqual([
    ['2026-11-07', true, ['late']],
    [T, false, ['am', 'pm', 'notime']],
    ['2026-11-09', false, ['mon']],
    ['2026-11-10', false, ['tue']],
    [null, false, ['any1', 'any2']],
  ]);
  expect(counts(list, T)).toEqual({ today: 4, doneToday: 1, open: 8 });
  expect(doneBetween(list, '2026-11-01', T)).toBe(1);
});

test('calendar: months from Saturday, and the 12-hour clock', () => {
  const nov = monthGrid('2026-11'); // 1 Nov 2026 is a Sunday
  expect(nov[0]).toEqual([null, '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']);
  expect(nov.flat().filter(Boolean)).toHaveLength(30);
  expect(nov.every((w) => w.length === 7)).toBe(true);
  expect(monthGrid('2026-08')[0][0]).toBe('2026-08-01'); // a Saturday
  expect(addMonths('2026-11', 2)).toBe('2027-01');
  expect(addMonths('2026-01', -1)).toBe('2025-12');
  expect(to12(0)).toEqual({ h: 12, min: 0, pm: false });
  expect(to12(17 * 60 + 35)).toEqual({ h: 5, min: 35, pm: true });
  expect(to12(12 * 60)).toEqual({ h: 12, min: 0, pm: true });
  for (const m of [0, 59, 720, 735, 1439]) {
    const c = to12(m);
    expect(from12(c.h, c.min, c.pm)).toBe(m);
  }
});

test('repeating tasks leave a done copy and move on; undo puts them back', () => {
  expect(nextDue('2026-11-08', 'daily')).toBe('2026-11-09');
  expect(nextDue('2026-11-12', 'weekdays')).toBe('2026-11-15'); // Thu → Sun
  expect(nextDue('2026-01-31', 'monthly')).toBe('2026-02-28');
  expect(nextDue('2026-12-15', 'monthly')).toBe('2027-01-15');
  const r = mk({ id: 'r', due: T, repeat: 'daily', subs: [{ id: 's', title: 'خطوة', done: true }] });
  const after = toggleTask([r], 'r', T, 'copy');
  expect(after.find((t) => t.id === 'r')).toMatchObject({ due: '2026-11-09', done: null });
  expect(after.find((t) => t.id === 'r')!.subs[0].done).toBe(false);
  expect(after.find((t) => t.id === 'copy')).toMatchObject({ done: T, repeat: null, from: 'r', wasDue: T });
  const undone = toggleTask(after, 'copy', T, 'z');
  expect(undone).toHaveLength(1);
  expect(undone[0]).toMatchObject({ id: 'r', due: T });
  // An overdue repeating task skips to the next day after today.
  expect(toggleTask([mk({ id: 'o', due: '2026-11-01', repeat: 'weekly' })], 'o', T, 'c').find((t) => t.id === 'o')!.due).toBe('2026-11-15');
  // Plain tasks just tick on and off.
  expect(toggleTask(toggleTask([mk({ id: 'p' })], 'p', T, 'n'), 'p', T, 'n')[0].done).toBeNull();
});

test('labels', () => {
  expect(timeAr(17 * 60)).toBe('5 العصر');
  expect(timeAr(9 * 60 + 30)).toBe('9:30 الصبح');
  expect(timeAr(12 * 60)).toBe('12 الضهر');
  expect(tagColor('شغل')).toBe(tagColor('شغل'));
});
