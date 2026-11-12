/// <reference types="jest" />
import { PROGRAM } from '../src/data/program';
import { after, currentWorkout, dateInWeek, isTrainingDay, lastOf, projected, reminderTimes, seqAt } from '../src/lib/schedule';
import type { TrainedDay } from '../src/lib/storage.types';

// Program days by id (the weekday each was written for): 1 ظهر → 2 صدر وبايسبس → 3 رجل → 5 كتف وترايسبس → 1 …
// 6 was the old quads day (retired when the two leg days became one): logged sessions on it are skipped.
const BACK = 1, CHEST = 2, LEGS = 3, SHOULDERS = 5, OLD_QUADS = 6;
const TODAY = '2026-11-04'; // Wednesday
const s = (date: string, ...weekdays: number[]): TrainedDay => ({ date, weekdays, sets: 10 });

test('sequence follows the program order and wraps', () => {
  expect(PROGRAM.map((d) => d.weekday)).toEqual([BACK, CHEST, LEGS, SHOULDERS]);
  expect(after(SHOULDERS)).toBe(BACK);
  expect(seqAt(-1)).toBe(SHOULDERS);
});

describe('currentWorkout', () => {
  test('no history → first workout', () => {
    expect(currentWorkout([], TODAY)).toEqual({ id: BACK, started: false, last: undefined });
  });
  test('next after the last session, however many days ago', () => {
    expect(currentWorkout([s('2026-11-03', BACK)], TODAY).id).toBe(CHEST);
    expect(currentWorkout([s('2026-10-20', BACK)], TODAY).id).toBe(CHEST); // two weeks off: still chest
  });
  test('skipping a weekday does not skip a workout', () => {
    // Back on Monday, nothing Tuesday (its old fixed day was chest) → Wednesday is still chest, not legs.
    expect(currentWorkout([s('2026-11-02', BACK)], TODAY).id).toBe(CHEST);
  });
  test('a workout done on a "wrong" day moves the order with it', () => {
    expect(currentWorkout([s('2026-11-02', BACK), s('2026-11-03', LEGS)], TODAY).id).toBe(SHOULDERS);
  });
  test("today's session stays on screen until the day ends", () => {
    const c = currentWorkout([s('2026-11-03', BACK), s(TODAY, CHEST)], TODAY);
    expect(c).toEqual({ id: CHEST, started: true, last: { date: '2026-11-03', id: BACK } });
  });
  test('a past skipped date was due the workout after the session before it', () => {
    expect(currentWorkout([s('2026-11-02', BACK), s(TODAY, CHEST)], '2026-11-03').id).toBe(CHEST);
  });
  test('two workouts on one date → continue after the second', () => {
    expect(lastOf([CHEST, BACK])).toBe(CHEST);
    expect(lastOf([BACK, SHOULDERS])).toBe(BACK); // shoulders → back wraps
    expect(currentWorkout([s('2026-11-03', BACK, CHEST)], TODAY).id).toBe(LEGS);
  });
  test('a session on the retired quads day is skipped: the order goes on from the one before it', () => {
    expect(currentWorkout([s('2026-11-02', SHOULDERS), s('2026-11-03', OLD_QUADS)], TODAY).id).toBe(BACK);
    expect(lastOf([SHOULDERS, OLD_QUADS])).toBe(SHOULDERS);
  });
});

describe('projected', () => {
  test('continues over the plan weekdays (Mon, Tue, Wed, Fri)', () => {
    const cur = currentWorkout([s('2026-11-03', BACK)], TODAY); // today (Wed) → chest
    expect(projected('2026-11-05', TODAY, cur)).toBe(CHEST); // Thu is a rest day: nothing new
    expect(projected('2026-11-06', TODAY, cur)).toBe(LEGS); // Fri
    expect(projected('2026-11-07', TODAY, cur)).toBe(LEGS); // Sat is a rest day now
    expect(projected('2026-11-09', TODAY, cur)).toBe(SHOULDERS); // Mon
    expect(projected('2026-11-10', TODAY, cur)).toBe(BACK); // Tue
  });
  test('from a rest day, the next plan day takes the current workout', () => {
    const thu = '2026-11-05';
    const cur = currentWorkout([s('2026-11-04', LEGS)], thu); // → shoulders
    expect(projected('2026-11-06', thu, cur)).toBe(SHOULDERS);
  });
  test('trained on a rest day → the next plan day moves on', () => {
    const thu = '2026-11-05';
    const cur = currentWorkout([s(thu, SHOULDERS)], thu);
    expect(projected('2026-11-06', thu, cur)).toBe(BACK);
  });
});

describe('food tab training day', () => {
  const trained = new Set(['2026-11-02', '2026-11-04']);
  test('a day with a logged workout is a training day, a past day without one was rest', () => {
    expect(isTrainingDay('2026-11-02', TODAY, trained, null)).toBe(true);
    expect(isTrainingDay('2026-11-03', TODAY, trained, null)).toBe(false);
  });
  test('today counts as training until marked rest; logging overrides the mark', () => {
    expect(isTrainingDay('2026-11-05', '2026-11-05', trained, null)).toBe(true);
    expect(isTrainingDay('2026-11-05', '2026-11-05', trained, '2026-11-05')).toBe(false);
    expect(isTrainingDay(TODAY, TODAY, trained, TODAY)).toBe(true); // already trained today
    expect(isTrainingDay('2026-11-05', '2026-11-05', trained, '2026-11-04')).toBe(true); // yesterday's mark doesn't stick
  });
  test('later days count as training', () => {
    expect(isTrainingDay('2026-11-06', TODAY, trained, TODAY)).toBe(true);
  });
  test('weekday chips map into the Saturday–Friday week', () => {
    expect(dateInWeek(6, TODAY)).toBe('2026-10-31'); // Sat
    expect(dateInWeek(3, TODAY)).toBe(TODAY); // Wed
    expect(dateInWeek(5, TODAY)).toBe('2026-11-06'); // Fri
  });
});

describe('reminderTimes', () => {
  // Wednesday 4 Nov 2026, 10:00; the window is two weeks
  const now = new Date(2026, 10, 4, 10, 0);
  const keys = (ds: Date[]) => ds.map((d) => `${d.getDate()} ${d.getHours()}:${d.getMinutes()}`);
  test('next plan days at the time, today included while it is ahead', () => {
    expect(keys(reminderTimes(now, 19 * 60 + 30, [1, 2, 3, 5, 6], false, 4))).toEqual(['4 19:30', '6 19:30', '7 19:30', '9 19:30']);
  });
  test('today skipped once trained or past the time', () => {
    expect(keys(reminderTimes(now, 19 * 60, [3], true, 2))).toEqual(['11 19:0']);
    expect(keys(reminderTimes(now, 9 * 60, [3], false, 1))).toEqual(['11 9:0']);
  });
  test('no days → nothing', () => {
    expect(reminderTimes(now, 600, [], false)).toEqual([]);
  });
});
