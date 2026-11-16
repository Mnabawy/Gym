/// <reference types="jest" />
// Forward compatibility (src/lib/records.ts): an older build keeps what a newer one wrote, field by field and record by record.
import { itemChanges } from '../src/lib/cloudSync';
import { parseDump, DUMP_KEY } from '../src/lib/dump';
import { parseSessions, FOCUS_KEY } from '../src/lib/focus';
import { parseGoals, GOALS_KEY } from '../src/lib/goals';
import { HABIT_LOG_KEY, HABITS_KEY, parseHabits } from '../src/lib/habits';
import { parseQuits, QUITS_KEY } from '../src/lib/quit';
import { keepExtra, keepUnread, keepUnreadMap } from '../src/lib/records';
import { parseTask, parseTasks, parseTrash, TASKS_KEY, TRASH_KEY } from '../src/lib/tasks';

const mockSaved: Record<string, string> = {};
jest.mock('../src/lib/storage', () => ({
  storage: { getMeta: (k: string) => mockSaved[k] ?? null, setMeta: (k: string, v: string) => void (mockSaved[k] = v) },
}));
// eslint-disable-next-line import/first
import { readTasks, saveTask, writeTasks } from '../src/lib/taskStore';
// eslint-disable-next-line import/first
import { readGoals, saveGoal } from '../src/lib/goalStore';
// eslint-disable-next-line import/first
import { readHabitLog, saveHabit, setMark } from '../src/lib/habitStore';
// eslint-disable-next-line import/first
import { deleteQuit, readQuits } from '../src/lib/quitStore';

beforeEach(() => {
  for (const k of Object.keys(mockSaved)) delete mockSaved[k];
});

// A task as a newer build might write it: a field this build has never heard of, also on a sub-step.
const task = { id: 't1', title: 'مهمة', due: '2026-11-16', time: null, priority: 3, subs: [{ id: 's1', title: 'خطوة', done: false, color: 'red' }], repeat: null, remind: false, done: null, created: '2026-11-01', future: { x: 1 } };
// A record this build can't read at all (no title: a newer build allows it).
const odd = { id: 't2', kind: 'photo', created: '2026-11-01' };

describe('keepExtra', () => {
  test('keeps unknown fields in their place and drops known ones the parser left out', () => {
    const r = keepExtra({ a: 1, zz: 'new', b: 'bad', c: 3 }, new Set(['a', 'b', 'c']), { a: 1, c: 4 });
    expect(r).toEqual({ a: 1, zz: 'new', c: 4 });
    expect(Object.keys(r)).toEqual(['a', 'zz', 'c']);
  });
});

describe('older-shape parsers keep fields they do not know (round trip)', () => {
  const cases: [string, (raw: string) => unknown[], object][] = [
    ['tasks', parseTasks, task],
    ['taskTrash', parseTrash, { id: 't1', task, at: '2026-11-10', why: 'x' }],
    ['goals', parseGoals, { id: 'g1', name: 'هدف', icon: 'cash', color: '#3E9A68', unit: '$', start: 0, target: 100, startDate: '2026-11-01', due: null, why: '', stages: [{ id: 's1', title: 'مرحلة', tasks: [{ id: 'k1', title: 'خطوة', done: null, effort: 3 }], tint: 1 }], entries: [], wins: [], reviews: [], future: true }],
    ['quits', parseQuits, { id: 'q1', name: 'x', icon: 'ban', color: '#7A5CFA', start: 1, why: '', replace: '', costPerDay: 0, currency: 'ج.م', minutesPerDay: 0, slips: [{ at: 5, mood: 2 }], urges: [], type: 'habit', targetDays: 66, future: 'yes' }],
    ['habits', parseHabits, { id: 'h1', name: 'x', icon: 'star', color: '#1BA6A8', days: [0, 1], remind: null, start: '2026-11-01', parts: [{ name: 'p', future: 1 }], future: [1, 2] }],
    ['dump', parseDump, { id: 'd1', text: 'فكرة', at: '2026-11-01', kind: 'idea', future: 'x' }],
    ['focus', parseSessions, { id: 'f1', kind: 'work', start: 1, end: 2, min: 25, date: '2026-11-01', future: 'x' }],
  ];
  test.each(cases)('%s', (_k, parse, rec) => {
    const raw = JSON.stringify([rec]);
    const [x] = parse(raw);
    expect(JSON.stringify(x)).toBe(JSON.stringify(rec)); // byte for byte: no false "edit" for sync
  });
});

describe('records this build cannot read survive a write', () => {
  test('keepUnread keeps them after the record they followed; same id in the new list wins', () => {
    const raw = JSON.stringify([{ id: 'a', title: 'A' }, { id: 'x' }, { id: 'b', title: 'B' }, { id: 'y' }]);
    const one = (r: unknown) => ((r as { title?: string }).title ? r : null);
    expect(JSON.parse(keepUnread(raw, [{ id: 'b', title: 'B' }, { id: 'c', title: 'C' }], one))).toEqual([{ id: 'x' }, { id: 'b', title: 'B' }, { id: 'y' }, { id: 'c', title: 'C' }]);
    expect(JSON.parse(keepUnread(raw, [{ id: 'x', title: 'X' }], one))).toEqual([{ id: 'x', title: 'X' }, { id: 'y' }]);
    expect(keepUnread('broken', [], one)).toBe('[]');
  });

  test('keepUnreadMap keeps entries it cannot read unless the new map sets them', () => {
    const raw = JSON.stringify({ 'h|2026-11-01': 'done', 'h|2026-11-02': 'half', 'h|2026-11-03': 'later' });
    const ok = (_k: string, v: unknown) => v === 'done';
    expect(JSON.parse(keepUnreadMap(raw, { 'h|2026-11-03': 'done' }, ok))).toEqual({ 'h|2026-11-03': 'done', 'h|2026-11-02': 'half' });
  });

  test('task store: an unreadable task is hidden, kept on every write, and never synced as a delete', () => {
    mockSaved[TASKS_KEY] = JSON.stringify([task, odd]);
    const before = mockSaved[TASKS_KEY];
    expect(readTasks().map((t) => t.id)).toEqual(['t1']);
    saveTask({ ...readTasks()[0], title: 'مهمة 2' });
    saveTask({ ...parseTask({ ...task, id: 't3', future: undefined })!, title: 'جديدة' });
    const stored = JSON.parse(mockSaved[TASKS_KEY]);
    expect(stored.map((t: { id: string }) => t.id)).toEqual(['t1', 't2', 't3']);
    expect(stored[0]).toMatchObject({ title: 'مهمة 2', future: { x: 1 }, subs: [{ id: 's1', color: 'red' }] });
    expect(stored[1]).toEqual(odd);
    // What sync sends: the edited task (with its unknown field) and the new one; nothing for t2.
    const rows = itemChanges(TASKS_KEY, before, mockSaved[TASKS_KEY], 1);
    expect(rows.map((r) => [r.key, r.deleted])).toEqual([
      ['tasks/t1', false],
      ['tasks/t3', false],
    ]);
    expect(rows[0].data).toMatchObject({ future: { x: 1 } });
    writeTasks([]);
    expect(JSON.parse(mockSaved[TASKS_KEY])).toEqual([odd]);
  });

  test('a no-op write changes nothing sync would send', () => {
    mockSaved[TASKS_KEY] = JSON.stringify([task, odd]);
    const before = mockSaved[TASKS_KEY];
    writeTasks(readTasks());
    expect(itemChanges(TASKS_KEY, before, mockSaved[TASKS_KEY], 1)).toEqual([]);
  });

  test('goal, quit and habit-log stores keep what they cannot read', () => {
    const oddGoal = { id: 'g9', name: 'x', target: 5, start: 5, startDate: '2026-11-01' };
    mockSaved[GOALS_KEY] = JSON.stringify([oddGoal]);
    saveGoal({ id: 'g1', name: 'هدف', icon: 'cash', color: '#3E9A68', unit: '$', start: 0, target: 100, startDate: '2026-11-01', due: null, why: '', stages: [], entries: [], wins: [], reviews: [] });
    expect(readGoals().map((g) => g.id)).toEqual(['g1']);
    expect(JSON.parse(mockSaved[GOALS_KEY])).toContainEqual(oddGoal);

    const oddQuit = { id: 'q9', name: 'x', start: -1 };
    mockSaved[QUITS_KEY] = JSON.stringify([oddQuit, { id: 'q1', name: 'y', start: 10 }]);
    deleteQuit('q1');
    expect(readQuits()).toEqual([]);
    expect(JSON.parse(mockSaved[QUITS_KEY])).toEqual([oddQuit]);

    saveHabit({ id: 'h1', name: 'x', icon: 'star', color: '#1BA6A8', days: [0, 1, 2, 3, 4, 5, 6], remind: null, start: '2026-11-01' });
    mockSaved[HABIT_LOG_KEY] = JSON.stringify({ 'h1|2026-11-01': 'half' });
    setMark('h1', '2026-11-02', 'done');
    expect(readHabitLog()).toEqual({ 'h1|2026-11-02': 'done' });
    expect(JSON.parse(mockSaved[HABIT_LOG_KEY])).toEqual({ 'h1|2026-11-02': 'done', 'h1|2026-11-01': 'half' });
    expect(JSON.parse(mockSaved[HABITS_KEY])).toHaveLength(1);
  });

  test('trash, dump and focus keys are covered too', () => {
    // Every SPLIT_META list key has a parser that hides an unreadable record (the stores keep it).
    expect(parseTrash(JSON.stringify([{ id: 'z', at: 'later' }]))).toEqual([]);
    expect(parseDump(JSON.stringify([{ id: 'z', text: '', at: '2026-11-01' }]))).toEqual([]);
    expect(parseSessions(JSON.stringify([{ id: 'z', min: 0 }]))).toEqual([]);
    expect([TRASH_KEY, DUMP_KEY, FOCUS_KEY]).toEqual(['taskTrash', 'dump', 'focus']);
  });
});

test('keepUnread keeps one copy of an unreadable id stored twice', () => {
  const raw = JSON.stringify([{ id: 'a', ok: true }, { id: 'x' }, { id: 'x' }]);
  const one = (r: unknown) => ((r as { ok?: boolean }).ok ? r : null);
  const out = JSON.parse(keepUnread(raw, [{ id: 'a', ok: true }], one));
  expect(out.filter((r: { id: string }) => r.id === 'x')).toHaveLength(1);
});
