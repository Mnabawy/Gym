/// <reference types="jest" />
import { PROGRAM } from '../src/data/program';
import { after, currentWorkout, lastOf, projected, seqAt } from '../src/lib/schedule';
import type { TrainedDay } from '../src/lib/storage.types';

// Program days by id (the weekday each was written for): 1 ظهر → 2 صدر وبايسبس → 3 خلفية → 5 كتف وترايسبس → 6 أمامية → 1 …
const BACK = 1, CHEST = 2, HAMS = 3, SHOULDERS = 5, QUADS = 6;
const TODAY = '2026-11-04'; // Wednesday
const s = (date: string, ...weekdays: number[]): TrainedDay => ({ date, weekdays, sets: 10 });

test('sequence follows the program order and wraps', () => {
  expect(PROGRAM.map((d) => d.weekday)).toEqual([BACK, CHEST, HAMS, SHOULDERS, QUADS]);
  expect(after(QUADS)).toBe(BACK);
  expect(seqAt(-1)).toBe(QUADS);
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
    // Back on Monday, nothing Tuesday (its old fixed day was chest) → Wednesday is still chest, not hams.
    expect(currentWorkout([s('2026-11-02', BACK)], TODAY).id).toBe(CHEST);
  });
  test('a workout done on a "wrong" day moves the order with it', () => {
    expect(currentWorkout([s('2026-11-02', BACK), s('2026-11-03', SHOULDERS)], TODAY).id).toBe(QUADS);
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
    expect(lastOf([BACK, QUADS])).toBe(BACK); // quads → back wraps
    expect(currentWorkout([s('2026-11-03', BACK, CHEST)], TODAY).id).toBe(HAMS);
  });
});

describe('projected', () => {
  test('continues over the plan weekdays (Mon, Tue, Wed, Fri, Sat)', () => {
    const cur = currentWorkout([s('2026-11-03', BACK)], TODAY); // today (Wed) → chest
    expect(projected('2026-11-05', TODAY, cur)).toBe(CHEST); // Thu is a rest day: nothing new
    expect(projected('2026-11-06', TODAY, cur)).toBe(HAMS); // Fri
    expect(projected('2026-11-07', TODAY, cur)).toBe(SHOULDERS); // Sat
    expect(projected('2026-11-09', TODAY, cur)).toBe(QUADS); // Mon
  });
  test('from a rest day, the next plan day takes the current workout', () => {
    const thu = '2026-11-05';
    const cur = currentWorkout([s('2026-11-04', HAMS)], thu); // → shoulders
    expect(projected('2026-11-06', thu, cur)).toBe(SHOULDERS);
  });
  test('trained on a rest day → the next plan day moves on', () => {
    const thu = '2026-11-05';
    const cur = currentWorkout([s(thu, SHOULDERS)], thu);
    expect(projected('2026-11-06', thu, cur)).toBe(QUADS);
  });
});
