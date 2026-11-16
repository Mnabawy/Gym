/// <reference types="jest" />
import { dirty, expireLogOnly, LAST_UID, LOG_ONLY_DAYS, LOG_ONLY_MAX, onDirty, setTracking, track, untracked } from '../src/lib/track';
import { rowsToSets, type Dump, type SetRow, type Storage } from '../src/lib/storage.types';

function memory(): Storage {
  let S: Dump = { sets: [], meals: [], shop: [], meta: {} };
  return {
    setsFor: (d, e) => rowsToSets(S.sets.filter((r) => r.date === d && r.exId === e)),
    saveSet: (r) => void (S.sets = [...S.sets.filter((x) => !(x.date === r.date && x.exId === r.exId && x.idx === r.idx)), r]),
    lastSession: () => undefined,
    clearDay: (d, ids) => void (S.sets = S.sets.filter((r) => !(r.date === d && ids.includes(r.exId)))),
    deleteSet: () => {},
    transaction: (f) => f(),
    history: () => [],
    doneSetsBetween: () => [],
    sessionDates: () => [],
    trainedDays: () => [],
    allSets: () => S.sets,
    mealChecks: (d) => S.meals.filter((m) => m.date === d).map((m) => m.meal),
    allMealChecks: () => S.meals,
    setMealCheck: (d, m, on) => void (S.meals = [...S.meals.filter((x) => !(x.date === d && x.meal === m)), ...(on ? [{ date: d, meal: m }] : [])]),
    shopChecks: (w) => S.shop.filter((x) => x.week === w).map((x) => x.item),
    setShopCheck: (w, i, on) => void (S.shop = [...S.shop.filter((x) => !(x.week === w && x.item === i)), ...(on ? [{ week: w, item: i }] : [])]),
    clearShop: (w) => void (S.shop = S.shop.filter((x) => x.week !== w)),
    getMeta: (k) => S.meta[k] ?? null,
    setMeta: (k, v) => void (S.meta[k] = v),
    dump: () => ({ sets: [...S.sets], meals: [...S.meals], shop: [...S.shop], meta: { ...S.meta } }),
    restore: (d) => void (S = { sets: [...d.sets], meals: [...d.meals], shop: [...d.shop], meta: { ...d.meta } }),
  };
}
const set = (idx: number): SetRow => ({ date: '2026-11-01', weekday: 1, exId: 'bench', idx, kg: 60, reps: 8, done: 1 });

test('nothing is noted while sync is off', () => {
  const s = track(memory());
  s.saveSet(set(0));
  s.setMeta('program', '[]');
  expect(dirty()).toEqual({});
});

test('writes are noted while on; phone-only keys and untracked writes are not', () => {
  const s = track(memory());
  setTracking(true);
  let calls = 0;
  const off = onDirty(() => calls++);
  s.saveSet(set(0));
  s.saveSet(set(1));
  s.setMealCheck('d', 'm', true);
  s.setMeta('program', '[]');
  s.setMeta('driveUser', 'x');
  untracked(() => s.setMeta('program', '{}'));
  expect(Object.keys(dirty()).sort()).toEqual(['meal:d|m', 'meta:program', 'set:2026-11-01|bench|0', 'set:2026-11-01|bench|1']);
  expect(calls).toBe(4);
  s.clearDay('2026-11-01', ['bench']);
  expect(dirty()['set:2026-11-01|bench|1'].row?.deleted).toBe(true);
  off();
});

test('sync keys stay out of backups and survive a restore; turning off clears the log', () => {
  const s = track(memory());
  setTracking(true);
  s.setMeta('sync.session', 'tok');
  s.setMeta('program', '[1]');
  expect(s.dump().meta).toEqual({ program: '[1]' });
  s.restore({ sets: [set(0)], meals: [], shop: [], meta: { goals: '[]', 'sync.session': 'evil' } });
  expect(s.getMeta('sync.session')).toBe('tok');
  expect(dirty()['meta:program']).toBeDefined(); // gone → sent as a delete
  expect(dirty()['set:2026-11-01|bench|0'].row?.deleted).toBe(false);
  setTracking(false);
  expect(dirty()).toEqual({});
});

test('the to-do list is noted one task at a time, also through a restore', () => {
  const s = track(memory());
  setTracking(false);
  setTracking(true);
  s.setMeta('tasks', JSON.stringify([{ id: 'a', t: 1 }, { id: 'b', t: 1 }]));
  expect(Object.keys(dirty()).sort()).toEqual(['meta:tasks/a', 'meta:tasks/b']);
  setTracking(false);
  setTracking(true);
  s.setMeta('tasks', JSON.stringify([{ id: 'a', t: 2 }]));
  expect(Object.keys(dirty()).sort()).toEqual(['meta:tasks/a', 'meta:tasks/b']);
  expect(dirty()['meta:tasks/a'].row?.data).toEqual({ id: 'a', t: 2 });
  expect(dirty()['meta:tasks/b'].row?.deleted).toBe(true);
  setTracking(false);
  setTracking(true);
  s.restore({ sets: [], meals: [], shop: [], meta: { tasks: JSON.stringify([{ id: 'c' }]) } });
  expect(dirty()['meta:tasks/c'].row?.data).toEqual({ id: 'c' });
  expect(dirty()['meta:tasks/a'].row?.deleted).toBe(true);
  expect(dirty()['meta:tasks']).toBeUndefined();
});

describe('signed out with a kept log ("log only") is bounded', () => {
  const DAY = 86400000;
  let now = 1_000_000_000_000;
  let spy: jest.SpyInstance;
  beforeEach(() => {
    now = 1_000_000_000_000;
    spy = jest.spyOn(Date, 'now').mockImplementation(() => now);
  });
  afterEach(() => spy.mockRestore());
  const signedOut = () => {
    const s = track(memory());
    setTracking(false);
    setTracking(false, true);
    s.setMeta(LAST_UID, 'uid-a');
    return s;
  };

  test('within the limits writes keep being noted', () => {
    const s = signedOut();
    s.setMeta('program', '[1]');
    now += (LOG_ONLY_DAYS - 1) * DAY;
    s.saveSet(set(0));
    expect(Object.keys(dirty()).sort()).toEqual(['meta:program', 'set:2026-11-01|bench|0']);
    expect(s.getMeta(LAST_UID)).toBe('uid-a');
  });

  test(`after ${LOG_ONLY_DAYS} days the log, log-only and the account are dropped together, and nothing more is noted`, () => {
    const s = signedOut();
    s.setMeta('program', '[1]');
    now += (LOG_ONLY_DAYS + 1) * DAY;
    s.setMeta('restDay', '[1]');
    expect(dirty()).toEqual({});
    expect(s.getMeta('sync.dirty')).toBe('{}');
    expect(s.getMeta('sync.logOnly')).toBe('');
    expect(s.getMeta(LAST_UID)).toBe('');
    s.saveSet(set(1));
    expect(dirty()).toEqual({});
  });

  test('expireLogOnly on its own (sign-in) drops an old log without a new write', () => {
    const s = signedOut();
    s.setMeta('program', '[1]');
    expect(expireLogOnly(now + DAY)).toBe(false);
    expect(expireLogOnly(now + (LOG_ONLY_DAYS + 1) * DAY)).toBe(true);
    expect(dirty()).toEqual({});
    expect(s.getMeta(LAST_UID)).toBe('');
  });

  test(`more than ${LOG_ONLY_MAX} entries drops it too`, () => {
    const s = signedOut();
    s.setMeta('tasks', JSON.stringify(Array.from({ length: LOG_ONLY_MAX }, (_, i) => ({ id: `t${i}` }))));
    expect(Object.keys(dirty()).length).toBe(LOG_ONLY_MAX);
    s.setMealCheck('one-more', 'm', true);
    expect(dirty()).toEqual({});
    expect(s.getMeta(LAST_UID)).toBe('');
  });

  test('a log kept before the start time was recorded starts counting now', () => {
    const s = signedOut();
    s.setMeta('sync.logSince', '');
    s.setMeta('program', '[1]');
    expect(s.getMeta('sync.logSince')).toBe(String(now));
    expect(dirty()['meta:program']).toBeDefined();
  });

  test('sync on is never expired', () => {
    const s = track(memory());
    setTracking(true);
    s.setMeta('program', '[1]');
    now += 365 * DAY;
    s.setMeta('restDay', '[1]');
    expect(Object.keys(dirty()).sort()).toEqual(['meta:program', 'meta:restDay']);
    setTracking(false);
  });
});
