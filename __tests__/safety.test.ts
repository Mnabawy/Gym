/// <reference types="jest" />
import {
  dumpHash,
  enoughSpace,
  findReusable,
  hasAnythingToProtect,
  hasLocalData,
  isRecoveryId,
  isTmpName,
  parseManifest,
  parseSnapshotName,
  PRE_WIPE_DAYS,
  RECOVERY_DAYS,
  recoveryAction,
  recoveryCreatedAt,
  recoveryId,
  retentionPlan,
  SafetyError,
  SNAPSHOT_FRESH_DAYS,
  SNAPSHOT_KEEP,
  snapshotName,
  spaceNeeded,
  tmpName,
  toManifest,
  utf8Length,
  type SnapshotInfo,
  type SnapshotReason,
} from '../src/lib/safety';
import type { Dump } from '../src/lib/storage.types';

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;
const dump = (over: Partial<Dump> = {}): Dump => ({
  sets: [
    { date: '2026-11-01', weekday: 1, exId: 'bench', idx: 0, kg: 60, reps: 8, done: 1 },
    { date: '2026-11-01', weekday: 1, exId: 'bench', idx: 1, kg: 62, reps: 8, done: 1, rir: 2, at: 5 },
  ],
  meals: [{ date: '2026-11-01', meal: 'breakfast' }],
  shop: [{ week: '2026-w44', item: 'rice' }],
  meta: { weights: '[{"date":"2026-11-01","kg":80}]', settings: '{"accent":"#007AFF"}' },
  ...over,
});
const snap = (reason: SnapshotReason, ageDays: number, hash = '0123456789abcdef'): SnapshotInfo => {
  const at = NOW - ageDays * DAY;
  return { name: snapshotName(reason, at, hash), reason, at, hash };
};

describe('snapshot names', () => {
  test('build and parse round trip; anything else is not a snapshot', () => {
    const n = snapshotName('first-sync', NOW, 'abcdef0123456789');
    expect(n).toBe(`gym-safety-first-sync-${NOW}-abcdef0123456789.json`);
    expect(parseSnapshotName(n)).toEqual({ name: n, reason: 'first-sync', at: NOW, hash: 'abcdef0123456789' });
    for (const reason of ['first-sync', 'pre-restore', 'pre-wipe'] as const) expect(parseSnapshotName(snapshotName(reason, NOW, '0123456789abcdef'))?.reason).toBe(reason);
    for (const bad of [
      'gym-auto-2026-11-01.json',
      'gym-backup-2026-11-01.json',
      `gym-safety-other-${NOW}-abcdef0123456789.json`,
      `gym-safety-pre-wipe-${NOW}-abcdef01.json`,
      `gym-safety-pre-wipe-${NOW}-ABCDEF0123456789.json`,
      `../gym-safety-pre-wipe-${NOW}-abcdef0123456789.json`,
      `gym-safety-pre-wipe-${NOW}-abcdef0123456789.json.tmp`,
      '',
    ]) expect(parseSnapshotName(bad)).toBeNull();
  });

  test('a temporary file is recognised and is never a snapshot', () => {
    const n = snapshotName('pre-restore', NOW, 'abcdef0123456789');
    expect(isTmpName(tmpName(n))).toBe(true);
    expect(isTmpName(n)).toBe(false);
    expect(parseSnapshotName(tmpName(n))).toBeNull();
    expect(isTmpName('gym-auto-2026-11-01.json')).toBe(false);
  });
});

describe('dumpHash', () => {
  test('16 hex characters, the same for the same data in any order', () => {
    const a = dump();
    const b = dump({ sets: [...a.sets].reverse(), meta: { settings: a.meta.settings, weights: a.meta.weights } });
    expect(dumpHash(a)).toMatch(/^[0-9a-f]{16}$/);
    expect(dumpHash(b)).toBe(dumpHash(a));
  });

  test('any change to a set, a tick, a shopping tick or a meta value changes it', () => {
    const base = dumpHash(dump());
    const sets = dump().sets;
    expect(dumpHash(dump({ sets: [{ ...sets[0], kg: 61 }, sets[1]] }))).not.toBe(base);
    expect(dumpHash(dump({ sets: [sets[0]] }))).not.toBe(base);
    expect(dumpHash(dump({ meals: [] }))).not.toBe(base);
    expect(dumpHash(dump({ shop: [{ week: '2026-w44', item: 'oats' }] }))).not.toBe(base);
    expect(dumpHash(dump({ meta: { ...dump().meta, weights: '[]' } }))).not.toBe(base);
    expect(dumpHash(dump({ meta: { ...dump().meta, extra: '1' } }))).not.toBe(base);
  });

  test('phone-only sync keys are not part of it; a missing rir equals a null one', () => {
    const a = dump();
    expect(dumpHash(dump({ meta: { ...a.meta, 'sync.dirty': '{}', 'sync.session': 'x' } }))).toBe(dumpHash(a));
    const withNull = dump({ sets: a.sets.map((r) => ({ ...r, rir: r.rir ?? null, at: r.at ?? null })) });
    expect(dumpHash(withNull)).toBe(dumpHash(a));
  });
});

describe('hasAnythingToProtect', () => {
  const empty: Dump = { sets: [], meals: [], shop: [], meta: {} };
  test('an empty phone, or one with only phone-only bookkeeping, has nothing to protect', () => {
    expect(hasAnythingToProtect(empty)).toBe(false);
    expect(hasAnythingToProtect({ ...empty, meta: { driveUser: 'a@x.test', welcomeDone: '1', 'sync.on': '1', section: 'tasks', weights: '' } })).toBe(false);
  });
  test('a set, a tick, or a synced meta value (settings count) does', () => {
    expect(hasAnythingToProtect({ ...empty, sets: dump().sets })).toBe(true);
    expect(hasAnythingToProtect({ ...empty, meals: dump().meals })).toBe(true);
    expect(hasAnythingToProtect({ ...empty, shop: dump().shop })).toBe(true);
    expect(hasAnythingToProtect({ ...empty, meta: { settings: '{"accent":"#fff"}' } })).toBe(true);
    expect(hasAnythingToProtect({ ...empty, meta: { tasks: '[{"id":"t1"}]' } })).toBe(true);
  });
});

describe('space', () => {
  test('utf8Length matches the real byte length (ASCII, Arabic, emoji)', () => {
    const bytes = (s: string) => encodeURIComponent(s).replace(/%[0-9A-F]{2}/g, '.').length; // an independent count: each %XX is one byte
    for (const s of ['', 'abc', 'تمرين النهارده', 'x😀y', '{"a":"ح"}']) expect(utf8Length(s)).toBe(bytes(s));
  });
  test('a snapshot needs twice its size plus a margin; an unknown amount does not block', () => {
    expect(spaceNeeded(1000)).toBe(2000 + 1_000_000);
    expect(enoughSpace(spaceNeeded(1000), spaceNeeded(1000))).toBe(true);
    expect(enoughSpace(spaceNeeded(1000) - 1, spaceNeeded(1000))).toBe(false);
    expect(enoughSpace(0, 1)).toBe(false);
    expect(enoughSpace(null, 5e9)).toBe(true);
    expect(enoughSpace(undefined, 5e9)).toBe(true);
    expect(enoughSpace(Number.NaN, 5e9)).toBe(true);
  });
});

describe('reuse and retention', () => {
  test('the newest snapshot of the same reason and data is reused; another reason or data is not', () => {
    const files = [snap('first-sync', 3, 'aaaaaaaaaaaaaaaa'), snap('first-sync', 1, 'aaaaaaaaaaaaaaaa'), snap('pre-restore', 1, 'aaaaaaaaaaaaaaaa'), snap('first-sync', 0, 'bbbbbbbbbbbbbbbb')];
    expect(findReusable(files, 'first-sync', 'aaaaaaaaaaaaaaaa')).toBe(files[1]);
    expect(findReusable(files, 'pre-wipe', 'aaaaaaaaaaaaaaaa')).toBeNull();
    expect(findReusable(files, 'first-sync', 'cccccccccccccccc')).toBeNull();
  });

  test('first-sync and pre-restore: the newest 5 stay, and so does anything younger than 14 days', () => {
    const old = Array.from({ length: 7 }, (_, i) => snap('first-sync', 20 + i * 20, `${i}`.repeat(16)));
    const plan = retentionPlan(old, NOW);
    expect(plan.keep).toHaveLength(SNAPSHOT_KEEP);
    expect(plan.remove.map((f) => f.hash)).toEqual(['5'.repeat(16), '6'.repeat(16)]);
    const young = Array.from({ length: 8 }, (_, i) => snap('pre-restore', i + 1, `${i}`.repeat(16)));
    expect(retentionPlan(young, NOW).remove).toEqual([]); // 8 snapshots, all younger than 14 days
    const edge = [...Array.from({ length: 5 }, (_, i) => snap('first-sync', i + 1, `${i}`.repeat(16))), snap('first-sync', SNAPSHOT_FRESH_DAYS - 0.1, 'a'.repeat(16)), snap('first-sync', SNAPSHOT_FRESH_DAYS + 0.1, 'b'.repeat(16))];
    expect(retentionPlan(edge, NOW).remove.map((f) => f.hash)).toEqual(['b'.repeat(16)]);
  });

  test('pre-wipe: every one is kept for 30 days, then it goes (no "keep the newest" exception)', () => {
    const files = [snap('pre-wipe', 1, '1'.repeat(16)), snap('pre-wipe', 2, '2'.repeat(16)), snap('pre-wipe', PRE_WIPE_DAYS - 0.1, '3'.repeat(16)), snap('pre-wipe', PRE_WIPE_DAYS + 0.1, '4'.repeat(16))];
    expect(retentionPlan(files, NOW).remove.map((f) => f.hash)).toEqual(['4'.repeat(16)]);
    expect(retentionPlan([snap('pre-wipe', 90)], NOW).keep).toEqual([]);
  });

  test('reasons are counted separately, and a snapshot stamped in the future counts as young', () => {
    const files = [...Array.from({ length: 5 }, (_, i) => snap('first-sync', 100 + i, `${i}`.repeat(16))), snap('pre-restore', 100, '9'.repeat(16)), snap('first-sync', -5, 'f'.repeat(16))];
    const plan = retentionPlan(files, NOW);
    expect(plan.keep.map((f) => f.hash)).toContain('9'.repeat(16)); // the only pre-restore is its own newest
    expect(plan.keep.map((f) => f.hash)).toContain('f'.repeat(16));
    expect(plan.remove).toHaveLength(1); // 6 first-sync, only the oldest falls outside the newest 5
  });
});

describe('recovery manifest and what to do with a recovery folder', () => {
  const NAMES = ['2026-11-01_1.jpg', '2026-11-02_2.jpg'];

  test('ids and the manifest round trip; bad input reads as no manifest', () => {
    expect(recoveryId(NOW)).toBe(`photos-${NOW}`);
    expect(isRecoveryId(recoveryId(NOW))).toBe(true);
    for (const bad of ['photos-', 'photos-abc', '../photos-1800000000000', 'photos-1800000000000/x', 'x']) expect(isRecoveryId(bad)).toBe(false);
    expect(recoveryCreatedAt(recoveryId(NOW))).toBe(NOW);
    expect(recoveryCreatedAt('nope')).toBeNull();
    expect(parseManifest(toManifest('ready', NAMES))).toEqual({ v: 1, state: 'ready', names: NAMES });
    expect(parseManifest(toManifest('wiped', NAMES, NOW))).toEqual({ v: 1, state: 'wiped', names: NAMES, wipedAt: NOW });
    expect(parseManifest(JSON.stringify({ v: 1, state: 'moving', names: [...NAMES, '../evil.jpg', 5] }))?.names).toEqual(NAMES);
    for (const bad of [null, undefined, '', '{', '[]', '{"v":2,"state":"ready","names":[]}', '{"v":1,"state":"done","names":[]}']) expect(parseManifest(bad)).toBeNull();
  });

  const wiped = (wipedAt?: number) => ({ v: 1 as const, state: 'wiped' as const, names: NAMES, ...(wipedAt != null ? { wipedAt } : null) });
  const unfinished = (state: 'moving' | 'ready') => ({ v: 1 as const, state, names: NAMES });

  test('a finished wipe is kept 30 days after the wipe, then deleted', () => {
    expect(recoveryAction(wiped(NOW), NOW - 90 * DAY, false, NOW + (RECOVERY_DAYS - 1) * DAY)).toBe('keep');
    expect(recoveryAction(wiped(NOW), NOW - 90 * DAY, false, NOW + RECOVERY_DAYS * DAY)).toBe('purge');
    expect(recoveryAction(wiped(), NOW, false, NOW + RECOVERY_DAYS * DAY)).toBe('purge'); // no wipedAt: counted from creation
    expect(recoveryAction(wiped(NOW), NOW, true, NOW + 1)).toBe('keep'); // data coming back never rolls a finished one back
  });

  test('an unfinished wipe: data still here means it never happened (photos go back); an empty phone means it did (mark it finished)', () => {
    for (const state of ['moving', 'ready'] as const) {
      expect(recoveryAction(unfinished(state), NOW, true, NOW)).toBe('rollback');
      expect(recoveryAction(unfinished(state), NOW, false, NOW)).toBe('mark-wiped');
    }
    expect(recoveryAction(null, NOW, true, NOW)).toBe('rollback'); // missing or broken manifest = unfinished
    expect(recoveryAction(null, NOW, false, NOW)).toBe('mark-wiped');
  });

  test('an unfinished folder is never deleted, however old', () => {
    for (const has of [true, false]) expect(recoveryAction(unfinished('ready'), NOW - 400 * DAY, has, NOW)).not.toBe('purge');
  });
});

test('SafetyError is an Error with a code', () => {
  const e = new SafetyError('space', 'full');
  expect(e).toBeInstanceOf(Error);
  expect(e).toBeInstanceOf(SafetyError);
  expect(e.code).toBe('space');
  expect(e.name).toBe('SafetyError');
});

describe('dumpHash and hasLocalData ignore phone-only state', () => {
  const empty: Dump = { sets: [], meals: [], shop: [], meta: {} };
  test('phone-only meta (sync.*, Google link, UI state) does not change the hash; synced meta does', () => {
    const base = dump();
    const noisy = { ...base, meta: { ...base.meta, driveUser: 'a@x.test', welcomeDone: '1', section: 'tasks', lastBackup: '2026-11-01', 'sync.on': '1', 'calendar.source': 'gym' } };
    expect(dumpHash(noisy)).toBe(dumpHash(base));
    expect(dumpHash({ ...base, meta: { ...base.meta, tasks: '[]' } })).not.toBe(dumpHash(base));
  });
  test('settings alone are not local data (an interrupted wipe stays a wipe), but real data is', () => {
    expect(hasLocalData({ ...empty, meta: { settings: '{"accent":"#fff"}' } })).toBe(false);
    expect(hasLocalData({ ...empty, meta: { settings: '{"a":1}', tasks: '[{"id":"t1"}]' } })).toBe(true);
    expect(hasLocalData({ ...empty, sets: dump().sets })).toBe(true);
  });
});
