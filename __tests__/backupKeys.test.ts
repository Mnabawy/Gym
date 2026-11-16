// DATA_KEYS (src/lib/backup.ts): which meta keys count as "things you logged", derived so it can't drift from sync.
import { backupInfo, DATA_KEYS, hasData, PLAIN_DATA_KEYS } from '../src/lib/backup';
import { isLocalMeta, SPLIT_META } from '../src/lib/cloudSync';
import { DB_RECOVERED_KEY } from '../src/lib/dbOpen';
import type { Dump } from '../src/lib/storage.types';

const only = (meta: Record<string, string>): Dump => ({ sets: [], meals: [], shop: [], meta });

test('every key sync splits into records is data, and so is every plain data key', () => {
  for (const k of Object.keys(SPLIT_META)) if (k !== 'settings') expect(DATA_KEYS).toContain(k); // settings: split, not data
  for (const k of PLAIN_DATA_KEYS) expect(DATA_KEYS).toContain(k);
  expect(new Set(DATA_KEYS).size).toBe(DATA_KEYS.length);
});

test('no phone-only key, no settings', () => {
  for (const k of DATA_KEYS) expect(isLocalMeta(k)).toBe(false);
  for (const k of ['settings', 'focusCfg', 'lastBackup', 'autoBackupAt', 'welcomeDone', 'sync.on', 'focusState', DB_RECOVERED_KEY]) expect(DATA_KEYS).not.toContain(k);
});

test.each(['dump', 'taskTrash', 'tasks', 'focus', 'goals', 'adhkar'])('a phone holding only %s is not empty', (k) => {
  const v = k === 'adhkar' || k === 'habitLog' ? '{"2026-11-01|morning|1":3}' : '[{"id":"a1"}]';
  expect(hasData(only({ [k]: v }))).toBe(true);
  expect(backupInfo(only({ [k]: v })).total).toBe(1);
});

test('settings and phone-only keys alone are empty', () => {
  expect(hasData(only({ settings: '{"a":1}', focusCfg: '{"focus":25}', lastBackup: '2026-11-01', 'sync.dirty': '{"x":1}' }))).toBe(false);
});
