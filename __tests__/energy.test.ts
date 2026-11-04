/// <reference types="jest" />
import { bmiLabel, DEFAULT_BODY, energyFor, parseBody, type Body } from '../src/lib/energy';

const man: Body = { sex: 'male', age: 25, height: 183, weight: 82, bodyFat: null, activity: 'moderate', goal: 'maintain' };

describe('energyFor', () => {
  test('needs sex, age, height and weight in range', () => {
    expect(energyFor(DEFAULT_BODY)).toBeNull();
    expect(energyFor({ ...man, sex: null })).toBeNull();
    expect(energyFor({ ...man, age: 5 })).toBeNull();
    expect(energyFor({ ...man, weight: null })).toBeNull();
  });
  test('Mifflin–St Jeor × activity', () => {
    const e = energyFor(man)!;
    expect(e.bmr).toBe(1844); // 820 + 1143.75 − 125 + 5
    expect(e.tdee).toBe(2858); // × 1.55
    expect(e.kcal).toBe(2860);
    expect(e.formula).toBe('mifflin');
    expect(energyFor({ ...man, sex: 'female' })!.bmr).toBe(1678); // −161 instead of +5
  });
  test('goal moves calories and protein', () => {
    const cut = energyFor({ ...man, goal: 'cut' })!;
    const bulk = energyFor({ ...man, goal: 'bulk' })!;
    expect(cut.kcal).toBe(2290); // −20%
    expect(bulk.kcal).toBe(3140); // +10%
    expect(cut.protein).toBe(Math.round(82 * 2.2));
    expect(cut.weekly).toBeLessThan(0);
    expect(bulk.weekly).toBeGreaterThan(0);
  });
  test('macros add up to the calories', () => {
    for (const goal of ['cut', 'maintain', 'bulk'] as const) {
      const e = energyFor({ ...man, goal })!;
      expect(Math.abs(e.protein * 4 + e.carbs * 4 + e.fat * 9 - e.kcal)).toBeLessThan(15);
      expect(e.fat * 9).toBeGreaterThanOrEqual(e.kcal * 0.24);
    }
  });
  test('body fat switches to Katch–McArdle', () => {
    const e = energyFor({ ...man, bodyFat: 15 })!;
    expect(e.formula).toBe('katch');
    expect(e.lean).toBe(69.7);
    expect(e.bmr).toBe(Math.round(370 + 21.6 * 82 * 0.85));
  });
  test('a hard cut never goes under the safe minimum', () => {
    const e = energyFor({ sex: 'female', age: 60, height: 150, weight: 45, bodyFat: null, activity: 'sedentary', goal: 'cut' })!;
    expect(e.kcal).toBe(1200);
    expect(e.floored).toBe(true);
  });
});

test('bmiLabel', () => {
  expect([17, 22, 27, 31].map(bmiLabel)).toEqual(['نحافة', 'طبيعي', 'وزن زيادة', 'سمنة']);
});

test('parseBody keeps valid fields only', () => {
  expect(parseBody(null)).toEqual(DEFAULT_BODY);
  expect(parseBody({ sex: 'x', age: '25', weight: 80, activity: 'couch', goal: 'cut' })).toEqual({ ...DEFAULT_BODY, weight: 80, goal: 'cut' });
});
