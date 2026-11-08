/// <reference types="jest" />
import { anytime, counts, doneBetween, moveToQuadrant, nextDue, parseQuick, parseTasks, quadrantOf, tagColor, timeAr, todayView, toggleTask, upcoming, type Task } from '../src/lib/tasks';

// Sunday 8 Nov 2026
const T = '2026-11-08';
const mk = (o: Partial<Task>): Task => ({ id: 'x', title: 'مهمة', due: null, time: null, priority: 3, subs: [], repeat: null, remind: false, done: null, created: '2026-11-01', ...o });

test('quick add reads Egyptian Arabic', () => {
  const p = parseQuick('كلّم المحاسب بكره 5 العصر !1 #فلوس', T);
  expect(p).toMatchObject({ title: 'كلّم المحاسب', due: '2026-11-09', time: 17 * 60, priority: 1, tag: 'فلوس', repeat: null });
  expect(p.spans.map((s) => s.kind)).toEqual(['date', 'time', 'priority', 'tag']);
  expect(parseQuick('ميعاد الدكتور التلات 7 بالليل', T)).toMatchObject({ title: 'ميعاد الدكتور', due: '2026-11-10', time: 19 * 60 });
  expect(parseQuick('اجتماع الساعة 2', T)).toMatchObject({ title: 'اجتماع', due: T, time: 14 * 60 });
  expect(parseQuick('جري 6:30 الصبح بعد بكره', T)).toMatchObject({ title: 'جري', due: '2026-11-10', time: 6 * 60 + 30 });
  expect(parseQuick('غدا الضهر', T)).toMatchObject({ title: 'غدا', time: 13 * 60, due: T });
  expect(parseQuick('اقرا كل يوم !3', T)).toMatchObject({ title: 'اقرا', repeat: 'daily', priority: 3 });
  expect(parseQuick('درس كل خميس', T)).toMatchObject({ title: 'درس', repeat: 'weekly', due: '2026-11-12' });
  expect(parseQuick('شنطة الجيم بالليل', T)).toMatchObject({ title: 'شنطة الجيم', evening: true, due: T });
  expect(parseQuick('حاجة مهمة !!!', T).priority).toBe(1);
  expect(parseQuick('تقرير كمان ٣ أيام', T).due).toBe('2026-11-11');
  expect(parseQuick('تسليم يوم الخميس', T).due).toBe('2026-11-12');
  expect(parseQuick('ورقة عادية', T)).toMatchObject({ title: 'ورقة عادية', due: null, time: null, priority: null, tag: null });
});

test('parse drops broken tasks', () => {
  const ok = mk({ id: 'a', time: 600, remind: true });
  const list = parseTasks(JSON.stringify([ok, { ...ok }, { id: 'b', title: ' ' }, { ...ok, id: 'c', priority: 9, time: 5000, remind: true, due: 'x' }]));
  expect(list.map((t) => t.id)).toEqual(['a', 'c']);
  expect(list[1]).toMatchObject({ priority: 3, time: null, remind: false, due: null });
  expect(parseTasks('nope')).toEqual([]);
});

test('views: today with overdue and evening, upcoming by day, anytime', () => {
  const list = [
    mk({ id: 'late', due: '2026-11-07', priority: 1 }),
    mk({ id: 'am', due: T, time: 9 * 60 }),
    mk({ id: 'pm', due: T, time: 20 * 60 }),
    mk({ id: 'eve', due: T, evening: true }),
    mk({ id: 'done', due: T, done: T }),
    mk({ id: 'tue', due: '2026-11-10' }),
    mk({ id: 'mon', due: '2026-11-09' }),
    mk({ id: 'any2', priority: 2 }),
    mk({ id: 'any1', priority: 1 }),
  ];
  const v = todayView(list, T);
  expect(v.overdue.map((t) => t.id)).toEqual(['late']);
  expect(v.day.map((t) => t.id)).toEqual(['am']);
  expect(v.evening.map((t) => t.id)).toEqual(['pm', 'eve']);
  expect(v.done.map((t) => t.id)).toEqual(['done']);
  expect(upcoming(list, T).map((d) => d.date)).toEqual(['2026-11-09', '2026-11-10']);
  expect(anytime(list).map((t) => t.id)).toEqual(['any1', 'any2']);
  expect(counts(list, T)).toEqual({ today: 4, doneToday: 1, upcoming: 2, anytime: 2 });
  expect(doneBetween(list, '2026-11-01', T)).toBe(1);
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

test('matrix: urgent by date unless set, important by priority', () => {
  expect(quadrantOf(mk({ due: T, priority: 1 }), T)).toBe('do');
  expect(quadrantOf(mk({ due: '2026-11-20', priority: 2 }), T)).toBe('plan');
  expect(quadrantOf(mk({ due: '2026-11-09', priority: 3 }), T)).toBe('quick');
  expect(quadrantOf(mk({ priority: 4 }), T)).toBe('drop');
  const moved = moveToQuadrant(mk({ priority: 4 }), 'do');
  expect(moved).toMatchObject({ urgent: true, priority: 2 });
  expect(quadrantOf(moved, T)).toBe('do');
  expect(moveToQuadrant(mk({ priority: 1, due: T }), 'drop')).toMatchObject({ urgent: false, priority: 3 });
});

test('labels', () => {
  expect(timeAr(17 * 60)).toBe('5 العصر');
  expect(timeAr(9 * 60 + 30)).toBe('9:30 الصبح');
  expect(timeAr(12 * 60)).toBe('12 الضهر');
  expect(tagColor('شغل')).toBe(tagColor('شغل'));
});

test('yesterday and tags with diacritics', () => {
  expect(parseQuick('ابعت الفاتورة امبارح #تعلّم', T)).toMatchObject({ title: 'ابعت الفاتورة', due: '2026-11-07', tag: 'تعلّم' });
});
