/// <reference types="jest" />
/* eslint-disable import/first -- the storage mock has to exist before settings.ts loads (it reads storage on import) */
const saved: Record<string, string> = {};
jest.mock('../src/lib/storage', () => ({
  storage: { getMeta: (k: string) => saved[k] ?? null, setMeta: (k: string, v: string) => (saved[k] = v) },
}));

import { ALL_EXERCISES, applyPlan, DEFAULT_REST, DEFAULT_SETS, exerciseById, SETS_MAX } from '../src/data/program';
import { DEFAULT_SETTINGS, parseSettings, useSettings } from '../src/lib/settings';

const defaults = { sets: {}, restHeavy: DEFAULT_REST.heavy, restNormal: DEFAULT_REST.normal };
afterEach(() => useSettings.getState().reset());

describe('parseSettings', () => {
  test('nothing saved or broken JSON → defaults', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{oops')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('42')).toEqual(DEFAULT_SETTINGS);
  });
  test('keeps valid fields, drops wrong types and unknown exercises', () => {
    const s = parseSettings(JSON.stringify({ verse: false, restHeavy: '3m', shopTrips: 2, sets: { deadlift: 4, nope: 3, 'leg-press': 'x' } }));
    expect(s.verse).toBe(false);
    expect(s.restHeavy).toBe(DEFAULT_SETTINGS.restHeavy);
    expect(s.shopTrips).toBe(2);
    expect(s.sets).toEqual({ deadlift: 4 });
  });
  test('keeps valid trip moves only', () => {
    const s = parseSettings(JSON.stringify({ shopMoves: { '3:بيض': 1, '3:لبن': -1, '3:عيش': 'x' } }));
    expect(s.shopMoves).toEqual({ '3:بيض': 1 });
  });
});

describe('applyPlan', () => {
  afterAll(() => applyPlan(defaults));
  test('overrides sets (clamped) and rest by tag', () => {
    applyPlan({ sets: { deadlift: 5, 'leg-press': 99 }, restHeavy: 180, restNormal: 60 });
    expect(exerciseById('deadlift')!.sets).toBe(5);
    expect(exerciseById('leg-press')!.sets).toBe(SETS_MAX);
    expect(exerciseById('deadlift')!.restSec).toBe(180); // heavy
    expect(exerciseById('lat-pulldown')!.restSec).toBe(60);
  });
  test('defaults restore the PDF numbers', () => {
    applyPlan(defaults);
    for (const e of ALL_EXERCISES) expect(e.sets).toBe(DEFAULT_SETS[e.id]);
  });
});

describe('settings store', () => {
  test('changing sets updates the plan and saves; going back to the PDF number drops the override', () => {
    useSettings.getState().setSets('deadlift', 4);
    expect(exerciseById('deadlift')!.sets).toBe(4);
    expect(JSON.parse(saved.settings).sets).toEqual({ deadlift: 4 });
    useSettings.getState().setSets('deadlift', DEFAULT_SETS.deadlift);
    expect(useSettings.getState().sets).toEqual({});
  });
  test('reset restores everything', () => {
    useSettings.getState().update({ verse: false, restNormal: 45 });
    useSettings.getState().reset();
    expect(useSettings.getState().verse).toBe(true);
    expect(exerciseById('lat-pulldown')!.restSec).toBe(DEFAULT_REST.normal);
  });
});

test('the saved color is checked', () => {
  expect(parseSettings(JSON.stringify({ accent: '#2563eb' })).accent).toBe('#2563EB');
  expect(parseSettings(JSON.stringify({ accent: 'blue' })).accent).toBe('#B93435');
  expect(parseSettings(JSON.stringify({ accent: '' })).accent).toBe('');
  expect(parseSettings(null).accent).toBe('#B93435');
});
