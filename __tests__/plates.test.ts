/// <reference types="jest" />
import { ALL_EXERCISES, RETIRED_EXERCISES } from '../src/data/program';
import { ALTERNATIVES } from '../src/data/alternatives';
import { barFor, EZ_BAR_KG, platesFor, warmups } from '../src/lib/plates';

test('plates per side, heaviest first', () => {
  expect(platesFor(100, 20)).toEqual({ perSide: [25, 15], left: 0 });
  expect(platesFor(62.5, 20)).toEqual({ perSide: [20, 1.25], left: 0 });
  expect(platesFor(20, 20)).toEqual({ perSide: [], left: 0 });
  expect(platesFor(142.5, 20)).toEqual({ perSide: [25, 25, 10, 1.25], left: 0 });
});

test('weights the plates cannot make leave a remainder; under the bar is null', () => {
  expect(platesFor(21, 20)).toEqual({ perSide: [], left: 1 });
  expect(platesFor(15, 20)).toBeNull();
});

test('bar weight by exercise', () => {
  expect(barFor('Deadlift', 20)).toBe(20);
  expect(barFor('Barbell Back Squat', 15)).toBe(15);
  expect(barFor('EZ-Bar Curl', 20)).toBe(EZ_BAR_KG);
  expect(barFor('Leg Press', 20)).toBeNull();
});

test('alternatives: every program exercise has some, none repeats the exercise itself', () => {
  for (const e of ALL_EXERCISES) {
    const a = ALTERNATIVES[e.id];
    expect(a?.length).toBeGreaterThan(0);
    expect(a).not.toContain(e.name);
    expect(new Set(a).size).toBe(a.length);
  }
  // exercises that left the program keep theirs, in case you add them back
  expect(Object.keys(ALTERNATIVES).sort()).toEqual([...ALL_EXERCISES, ...RETIRED_EXERCISES].map((e) => e.id).sort());
});

test('warm-up ramp', () => {
  expect(warmups(100, 20)).toEqual([{ kg: 20, reps: 8 }, { kg: 40, reps: 5 }, { kg: 60, reps: 3 }, { kg: 80, reps: 2 }]);
  expect(warmups(30, 20)).toEqual([{ kg: 20, reps: 8 }, { kg: 25, reps: 2 }]); // 40% and 60% are under the bar
  expect(warmups(24, null)).toEqual([{ kg: 10, reps: 5 }, { kg: 14, reps: 3 }, { kg: 19, reps: 2 }]);
  expect(warmups(20, 20)).toEqual([]);
});
