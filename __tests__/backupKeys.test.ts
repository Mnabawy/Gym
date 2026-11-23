// DATA_KEYS (src/lib/backup.ts): which meta keys count as "things you logged".
import { DATA_KEYS, hasData } from '../src/lib/backup';
import { isLocalMeta } from '../src/lib/metaKeys';
import { DB_RECOVERED_KEY } from '../src/lib/dbOpen';
import type { Dump } from '../src/lib/storage.types';

const only = (meta: Record<string, string>): Dump => ({ sets: [], meals: [], shop: [], meta });

test('no duplicates, no phone-only key, no settings', () => {
  expect(new Set(DATA_KEYS).size).toBe(DATA_KEYS.length);
  for (const k of DATA_KEYS) expect(isLocalMeta(k)).toBe(false);
  for (const k of ['settings', 'lastBackup', 'autoBackupAt', 'sync.on', DB_RECOVERED_KEY]) expect(DATA_KEYS).not.toContain(k);
});

test.each(['weights', 'water', 'notes', 'program'])('a phone holding only %s is not empty', (k) => {
  const v = k === 'weights' ? '[{"date":"2026-11-01","kg":80}]' : k === 'program' ? '{"1":[]}' : '{"2026-11-01":250}';
  expect(hasData(only({ [k]: v }))).toBe(true);
});

test('settings and phone-only keys alone are empty', () => {
  expect(hasData(only({ settings: '{"a":1}', lastBackup: '2026-11-01', 'sync.dirty': '{"x":1}' }))).toBe(false);
});
