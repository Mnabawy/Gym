/// <reference types="jest" />
/// <reference types="node" />
// The `Storage` cases (src/lib/storage.types.ts) run against the real implementation: storage.ts (expo-sqlite) on
// Node's built-in SQLite (test-utils/nodeSqlite.ts). Each case gets a fresh "phone"; `reopen()` starts the app again
// on the same saved data.
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DB_RECOVERED_KEY, parseDbRecovery } from '../src/lib/dbOpen';
import type { Dump, SetRow, Storage } from '../src/lib/storage.types';
import { isLocalMeta } from '../src/lib/cloudSync';
import { migrate, SCHEMA_MIGRATIONS, SCHEMA_VERSION } from '../src/lib/dbMigrations';
import { META_MIGRATIONS, META_VERSION_KEY, runMetaMigrations } from '../src/lib/metaMigrations';
import { loadNativeStorage, nodeSqlite } from '../test-utils/nodeSqlite';

type Phone = { open(): Storage; breakIt(): void; cleanup(): void };

function nativePhone(): Phone {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainy-contract-'));
  return {
    open: () => loadNativeStorage(dir).mod.storage,
    breakIt: () => {
      // As after the app was closed: no -wal / -shm left (the open connection of this test can't be closed from outside).
      for (const tail of ['-wal', '-shm']) fs.rmSync(path.join(dir, `gym.db${tail}`), { force: true });
      fs.writeFileSync(path.join(dir, 'gym.db'), 'not a database '.repeat(300));
    },
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

const row = (date: string, exId: string, idx: number, kg: number | null = 60, done = 1, extra: Partial<SetRow> = {}): SetRow => ({ date, weekday: 1, exId, idx, kg, reps: kg == null ? null : 8, done, ...extra });
const byKey = <T>(a: T[], key: (x: T) => string) => [...a].sort((p, q) => (key(p) < key(q) ? -1 : key(p) > key(q) ? 1 : 0));
const norm = (d: Dump) => ({
  sets: d.sets.map((r) => ({ ...r, rir: r.rir ?? null, at: r.at ?? null })),
  meals: byKey(d.meals, (m) => `${m.date}|${m.meal}`),
  shop: byKey(d.shop, (x) => `${x.week}|${x.item}`),
  meta: d.meta,
});

describe.each([
  ['native (SQLite)', nativePhone],
])('%s', (_name, make) => {
  let phone: Phone;
  let s: Storage;
  beforeEach(() => {
    phone = make();
    s = phone.open();
  });
  afterEach(() => phone.cleanup());

  test('a set is saved, read back and overwritten in place; missing indexes are blank', () => {
    s.saveSet(row('2026-11-01', 'bench', 0, 60));
    s.saveSet(row('2026-11-01', 'bench', 2, 70, 0, { rir: 2, at: 123 }));
    s.saveSet(row('2026-11-01', 'bench', 0, 65));
    expect(s.setsFor('2026-11-01', 'bench')).toEqual([
      { kg: 65, reps: 8, done: true, rir: null, at: null },
      { kg: null, reps: null, done: false },
      { kg: 70, reps: 8, done: false, rir: 2, at: 123 },
    ]);
    expect(s.setsFor('2026-11-01', 'squat')).toEqual([]);
  });

  test('lastSession: the newest earlier day with a number, not the same day, not an empty one', () => {
    s.saveSet(row('2026-11-01', 'bench', 0, 60));
    s.saveSet(row('2026-11-03', 'bench', 0, 62));
    s.saveSet(row('2026-11-04', 'bench', 0, null));
    s.saveSet(row('2026-11-05', 'bench', 0, 64));
    expect(s.lastSession('bench', '2026-11-05')?.[0].kg).toBe(62);
    expect(s.lastSession('bench', '2026-11-01')).toBeUndefined();
  });

  test('lastSession: the whole day in idx order with gaps blank, only this exercise, done and undone sets alike', () => {
    s.saveSet(row('2026-11-02', 'bench', 2, 70, 0, { rir: 1, at: 5 }));
    s.saveSet(row('2026-11-02', 'bench', 0, 60));
    s.saveSet(row('2026-11-02', 'squat', 0, 100));
    s.saveSet(row('2026-11-03', 'squat', 0, 110));
    expect(s.lastSession('bench', '2026-11-04')).toEqual([
      { kg: 60, reps: 8, done: true, rir: null, at: null },
      { kg: null, reps: null, done: false },
      { kg: 70, reps: 8, done: false, rir: 1, at: 5 },
    ]);
    expect(s.lastSession('bench', '2026-11-02')).toBeUndefined();
    expect(s.lastSession('deadlift', '2026-11-30')).toBeUndefined();
    // A day that only has empty rows is skipped, but that day's empty rows still come with a day that has a number.
    s.saveSet(row('2026-11-05', 'bench', 0, null));
    s.saveSet(row('2026-11-06', 'bench', 1, null));
    s.saveSet(row('2026-11-06', 'bench', 0, 65));
    expect(s.lastSession('bench', '2026-11-06')?.[0].kg).toBe(60);
    expect(s.lastSession('bench', '2026-11-07')).toEqual([
      { kg: 65, reps: 8, done: true, rir: null, at: null },
      { kg: null, reps: null, done: true, rir: null, at: null },
    ]);
  });

  test('history: one entry per date oldest first, each day like setsFor, other exercises left out', () => {
    s.saveSet(row('2026-11-09', 'bench', 1, 72, 0, { rir: 3, at: 7 }));
    s.saveSet(row('2026-11-01', 'bench', 2, 64));
    s.saveSet(row('2026-11-09', 'bench', 0, 70));
    s.saveSet(row('2026-11-01', 'bench', 0, 60));
    s.saveSet(row('2026-11-05', 'squat', 0, 100));
    s.saveSet(row('2026-11-05', 'bench', 0, null, 0));
    const h = s.history('bench');
    expect(h).toEqual([
      { date: '2026-11-01', sets: [{ kg: 60, reps: 8, done: true, rir: null, at: null }, { kg: null, reps: null, done: false }, { kg: 64, reps: 8, done: true, rir: null, at: null }] },
      { date: '2026-11-05', sets: [{ kg: null, reps: null, done: false, rir: null, at: null }] },
      { date: '2026-11-09', sets: [{ kg: 70, reps: 8, done: true, rir: null, at: null }, { kg: 72, reps: 8, done: false, rir: 3, at: 7 }] },
    ]);
    for (const d of h) expect(d.sets).toEqual(s.setsFor(d.date, 'bench'));
    expect(s.history('deadlift')).toEqual([]);
    expect(s.history('squat').map((d) => d.date)).toEqual(['2026-11-05']);
  });

  test('clearDay and deleteSet remove only what they name', () => {
    s.saveSet(row('2026-11-01', 'bench', 0));
    s.saveSet(row('2026-11-01', 'bench', 1));
    s.saveSet(row('2026-11-01', 'squat', 0));
    s.saveSet(row('2026-11-02', 'bench', 0));
    s.deleteSet('2026-11-01', 'bench', 1);
    expect(s.setsFor('2026-11-01', 'bench')).toHaveLength(1);
    s.clearDay('2026-11-01', ['bench']);
    expect(s.setsFor('2026-11-01', 'bench')).toEqual([]);
    expect(s.setsFor('2026-11-01', 'squat')).toHaveLength(1);
    expect(s.setsFor('2026-11-02', 'bench')).toHaveLength(1);
  });

  test('history, doneSetsBetween, sessionDates, trainedDays and allSets agree', () => {
    s.saveSet(row('2026-11-03', 'bench', 0));
    s.saveSet(row('2026-11-01', 'bench', 0));
    s.saveSet(row('2026-11-01', 'bench', 1, 60, 0));
    s.saveSet({ ...row('2026-11-01', 'squat', 0), weekday: 2 });
    s.saveSet(row('2026-11-09', 'squat', 0));
    expect(s.history('bench').map((h) => h.date)).toEqual(['2026-11-01', '2026-11-03']);
    expect(byKey(s.doneSetsBetween('2026-11-01', '2026-11-03'), (x) => x.exId)).toEqual([
      { exId: 'bench', n: 2 },
      { exId: 'squat', n: 1 },
    ]);
    expect(s.sessionDates('2026-11-02', '2026-11-09')).toEqual(['2026-11-03', '2026-11-09']);
    expect(s.trainedDays().map((d) => ({ ...d, weekdays: [...d.weekdays].sort() }))).toEqual([
      { date: '2026-11-01', weekdays: [1, 2], sets: 2 },
      { date: '2026-11-03', weekdays: [1], sets: 1 },
      { date: '2026-11-09', weekdays: [1], sets: 1 },
    ]);
    expect(s.allSets().map((r) => `${r.date} ${r.exId} ${r.idx}`)).toEqual(['2026-11-01 bench 0', '2026-11-01 bench 1', '2026-11-01 squat 0', '2026-11-03 bench 0', '2026-11-09 squat 0']);
  });

  test('meal and shopping ticks: on twice is one tick, off removes it, clearShop empties one week', () => {
    s.setMealCheck('2026-11-02', 'lunch', true);
    s.setMealCheck('2026-11-01', 'breakfast', true);
    s.setMealCheck('2026-11-01', 'breakfast', true);
    s.setMealCheck('2026-11-02', 'dinner', true);
    s.setMealCheck('2026-11-02', 'dinner', false);
    expect(s.mealChecks('2026-11-01')).toEqual(['breakfast']);
    expect(s.allMealChecks()).toEqual([
      { date: '2026-11-01', meal: 'breakfast' },
      { date: '2026-11-02', meal: 'lunch' },
    ]);
    s.setShopCheck('w1', 'eggs', true);
    s.setShopCheck('w1', 'eggs', true);
    s.setShopCheck('w1', 'rice', true);
    s.setShopCheck('w2', 'milk', true);
    s.setShopCheck('w1', 'rice', false);
    expect(s.shopChecks('w1')).toEqual(['eggs']);
    s.clearShop('w1');
    expect(s.shopChecks('w1')).toEqual([]);
    expect(s.shopChecks('w2')).toEqual(['milk']);
  });

  test('meta: null when missing, last write wins', () => {
    expect(s.getMeta('x')).toBeNull();
    s.setMeta('x', '1');
    s.setMeta('x', '2');
    expect(s.getMeta('x')).toBe('2');
  });

  test('a transaction applies all its writes', () => {
    s.transaction(() => {
      s.saveSet(row('2026-11-01', 'bench', 0));
      s.setMealCheck('2026-11-01', 'lunch', true);
      s.setMeta('k', 'v');
    });
    expect(s.setsFor('2026-11-01', 'bench')).toHaveLength(1);
    expect(s.mealChecks('2026-11-01')).toEqual(['lunch']);
    expect(s.getMeta('k')).toBe('v');
  });

  test('a nested transaction that throws rolls back only its own writes; the outer one still commits', () => {
    s.transaction(() => {
      s.setMeta('outer', '1');
      s.saveSet(row('2026-11-01', 'bench', 0));
      expect(() =>
        s.transaction(() => {
          s.setMeta('inner', 'x');
          s.setMeta('outer', 'changed');
          s.saveSet(row('2026-11-01', 'squat', 0));
          throw new Error('inner');
        }),
      ).toThrow('inner');
      s.setMeta('after', '2');
    });
    expect(s.getMeta('inner')).toBeNull();
    expect(s.getMeta('outer')).toBe('1');
    expect(s.getMeta('after')).toBe('2');
    expect(s.setsFor('2026-11-01', 'squat')).toEqual([]);
    expect(s.setsFor('2026-11-01', 'bench')).toHaveLength(1);
    // Depth is back to 0: the next one is a real transaction that rolls back as a whole.
    expect(() => s.transaction(() => { s.setMeta('later', '1'); throw new Error('x'); })).toThrow('x');
    expect(s.getMeta('later')).toBeNull();
    s.transaction(() => s.setMeta('last', '1'));
    expect(s.getMeta('last')).toBe('1');
  });

  test('a nested transaction that throws inside an outer one that also throws: nothing is kept', () => {
    expect(() =>
      s.transaction(() => {
        s.setMeta('o', '1');
        try {
          s.transaction(() => { s.setMeta('i', '1'); throw new Error('inner'); });
        } catch {}
        throw new Error('outer');
      }),
    ).toThrow('outer');
    expect(s.getMeta('o')).toBeNull();
    expect(s.getMeta('i')).toBeNull();
  });

  test('dump → restore puts back exactly the same data, replacing what was there', () => {
    s.saveSet(row('2026-11-01', 'bench', 0, 60, 1, { rir: 1, at: 99 }));
    s.setMealCheck('2026-11-01', 'lunch', true);
    s.setShopCheck('w1', 'eggs', true);
    s.setMeta('weights', '[1]');
    const d = s.dump();
    s.saveSet(row('2026-11-05', 'squat', 0));
    s.setMeta('other', 'x');
    s.restore(d);
    expect(norm(s.dump())).toEqual(norm(d));
    expect(s.getMeta('other')).toBeNull();
  });

  test('everything is still there after the app starts again', () => {
    s.saveSet(row('2026-11-01', 'bench', 0));
    s.setMealCheck('2026-11-01', 'lunch', true);
    s.setShopCheck('w1', 'eggs', true);
    s.setMeta('weights', '[1]');
    const before = norm(s.dump());
    expect(norm(phone.open().dump())).toEqual(before);
  });

  test('broken saved data: the app still starts, empty, with a note to restore a backup', () => {
    s.saveSet(row('2026-11-01', 'bench', 0));
    phone.breakIt();
    const again = phone.open();
    expect(again.allSets()).toEqual([]);
    expect(parseDbRecovery(again.getMeta(DB_RECOVERED_KEY))?.file).toMatch(/\.broken-\d+$/);
    again.setMeta('weights', '[2]');
    expect(again.getMeta('weights')).toBe('[2]');
  });
});

describe.each([
  ['native (SQLite)', nativePhone],
])('%s: meta migrations', (_name, make) => {
  let phone: Phone;
  let s: Storage;
  beforeEach(() => {
    phone = make();
    s = phone.open();
  });
  afterEach(() => phone.cleanup());

  test('none to run at start: nothing is written', () => {
    expect(META_MIGRATIONS).toHaveLength(0);
    expect(s.getMeta(META_VERSION_KEY)).toBeNull();
  });

  test('each runs once, in order; the version survives a restart and is phone-only', () => {
    const ran: string[] = [];
    const list = [() => void ran.push('a'), (m: { setMeta(k: string, v: string): void }) => (ran.push('b'), m.setMeta('x', '1'))];
    expect(runMetaMigrations(s, list)).toEqual({ version: 2, error: null });
    expect(runMetaMigrations(s, list)).toEqual({ version: 2, error: null });
    expect(ran).toEqual(['a', 'b']);
    expect(s.getMeta(META_VERSION_KEY)).toBe('2');
    const again = phone.open();
    expect(runMetaMigrations(again, list).version).toBe(2);
    expect(ran).toEqual(['a', 'b']);
    // A third one added by a later build runs alone.
    expect(runMetaMigrations(again, [...list, () => void ran.push('c')]).version).toBe(3);
    expect(ran).toEqual(['a', 'b', 'c']);
    expect(isLocalMeta(META_VERSION_KEY)).toBe(true);
  });

  test('a failing one keeps the version, undoes its writes (and their sync notes) and stops; it runs again on the next start', () => {
    s.setMeta('sync.on', '1'); // sync on: writes are noted for sending
    let fail = true;
    const ran: string[] = [];
    const list = [
      () => void ran.push('a'),
      (m: { setMeta(k: string, v: string): void }) => {
        m.setMeta('tasks', JSON.stringify([{ id: 't1', title: 'half done' }]));
        m.setMeta('water', '{"2026-11-01":500}');
        if (fail) throw new Error('boom');
        ran.push('b');
      },
      () => void ran.push('c'),
    ];
    const r = runMetaMigrations(s, list);
    expect(r.version).toBe(1);
    expect(String((r.error as Error).message)).toBe('boom');
    expect(s.getMeta(META_VERSION_KEY)).toBe('1');
    expect(ran).toEqual(['a']);
    expect(s.getMeta('tasks')).toBeNull();
    expect(s.getMeta('water')).toBeNull();
    // The change log in memory was rolled back too: the next write saves it without the undone records.
    s.setMeta('restDay', '2026-11-01');
    const log = Object.keys(JSON.parse(s.getMeta('sync.dirty') ?? '{}') as object);
    expect(log.some((k) => /tasks|water/.test(k))).toBe(false);
    expect(log).toContain('meta:restDay');
    fail = false;
    expect(runMetaMigrations(phone.open(), list)).toEqual({ version: 3, error: null });
    expect(ran).toEqual(['a', 'b', 'c']);
  });
});

describe('native (SQLite): schema migrations', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (file: string) => { exec(sql: string): void; prepare(sql: string): { get(...p: unknown[]): unknown; all(...p: unknown[]): unknown[] }; close(): void } };
  let dir: string;
  const file = () => path.join(dir, 'gym.db');
  /** Reads the file from the side (a second connection), like a look at it after the app ran. */
  const peek = <T>(f: (db: InstanceType<typeof DatabaseSync>) => T): T => {
    const db = new DatabaseSync(file());
    try {
      return f(db);
    } finally {
      db.close();
    }
  };
  const version = () => peek((db) => (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version);
  const columns = () => peek((db) => (db.prepare('PRAGMA table_info(set_logs)').all() as { name: string }[]).map((c) => c.name));
  /** A gym.db as the build before migrations left it: user_version 0, the tables, and the later columns or not. */
  const oldInstall = (withLaterColumns: boolean) =>
    peek((db) => {
      db.exec(`
        CREATE TABLE set_logs (
          date TEXT NOT NULL, weekday INTEGER NOT NULL, ex_id TEXT NOT NULL, idx INTEGER NOT NULL,
          kg REAL, reps INTEGER, done INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (date, ex_id, idx)
        );
        CREATE INDEX set_logs_ex ON set_logs (ex_id, date);
        CREATE TABLE meal_checks (date TEXT NOT NULL, meal TEXT NOT NULL, PRIMARY KEY (date, meal));
        CREATE TABLE shop_checks (week TEXT NOT NULL, item TEXT NOT NULL, PRIMARY KEY (week, item));
        CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        INSERT INTO set_logs (date, weekday, ex_id, idx, kg, reps, done) VALUES ('2026-11-01', 1, 'bench', 0, 60, 8, 1);
        INSERT INTO meal_checks VALUES ('2026-11-01', 'lunch');
        INSERT INTO shop_checks VALUES ('w1', 'eggs');
        INSERT INTO meta VALUES ('weights', '[1]');
      `);
      if (withLaterColumns) {
        db.exec('ALTER TABLE set_logs ADD COLUMN rir INTEGER; ALTER TABLE set_logs ADD COLUMN at INTEGER;');
        db.exec("UPDATE set_logs SET rir = 2, at = 99 WHERE ex_id = 'bench'");
      }
    });

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainy-migrate-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('a fresh database ends at the latest version with every table and column', () => {
    const s = loadNativeStorage(dir).mod.storage;
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(1);
    expect(version()).toBe(SCHEMA_VERSION);
    expect(columns()).toEqual(['date', 'weekday', 'ex_id', 'idx', 'kg', 'reps', 'done', 'rir', 'at']);
    s.saveSet(row('2026-11-01', 'bench', 0, 60, 1, { rir: 1, at: 5 }));
    expect(loadNativeStorage(dir).mod.storage.setsFor('2026-11-01', 'bench')).toEqual([{ kg: 60, reps: 8, done: true, rir: 1, at: 5 }]);
    expect(version()).toBe(SCHEMA_VERSION);
  });

  test('an install at user_version 0 that already has every column upgrades and keeps its data', () => {
    oldInstall(true);
    expect(version()).toBe(0);
    const s = loadNativeStorage(dir).mod.storage;
    expect(s.getMeta(DB_RECOVERED_KEY)).toBeNull();
    expect(version()).toBe(SCHEMA_VERSION);
    expect(s.setsFor('2026-11-01', 'bench')).toEqual([{ kg: 60, reps: 8, done: true, rir: 2, at: 99 }]);
    expect(s.mealChecks('2026-11-01')).toEqual(['lunch']);
    expect(s.shopChecks('w1')).toEqual(['eggs']);
    expect(s.getMeta('weights')).toBe('[1]');
  });

  test('an install missing the later columns gets them, its rows kept', () => {
    oldInstall(false);
    expect(columns()).not.toContain('rir');
    const s = loadNativeStorage(dir).mod.storage;
    expect(version()).toBe(SCHEMA_VERSION);
    expect(columns()).toEqual(expect.arrayContaining(['rir', 'at']));
    expect(s.setsFor('2026-11-01', 'bench')).toEqual([{ kg: 60, reps: 8, done: true, rir: null, at: null }]);
    s.saveSet(row('2026-11-01', 'bench', 1, 62, 1, { rir: 3, at: 7 }));
    expect(s.setsFor('2026-11-01', 'bench')[1]).toEqual({ kg: 62, reps: 8, done: true, rir: 3, at: 7 });
  });

  test('a failing migration rolls back its changes and leaves user_version as it was', () => {
    loadNativeStorage(dir); // at the latest version
    const db = nodeSqlite(dir).sqlite.openDatabaseSync('gym.db');
    const failing = [
      ...SCHEMA_MIGRATIONS,
      (d: { execSync(sql: string): void }) => {
        d.execSync('CREATE TABLE half_done (x INTEGER)');
        throw new Error('boom');
      },
    ];
    expect(() => migrate(db, failing)).toThrow('boom');
    expect(version()).toBe(SCHEMA_VERSION);
    expect(peek((d) => d.prepare("SELECT name FROM sqlite_master WHERE name = 'half_done'").get())).toBeUndefined();
    // Fixed in the next build: it runs then.
    const fixed = [...SCHEMA_MIGRATIONS, (d: { execSync(sql: string): void }) => d.execSync('CREATE TABLE half_done (x INTEGER)')];
    expect(migrate(db, fixed)).toBe(SCHEMA_VERSION + 1);
    expect(version()).toBe(SCHEMA_VERSION + 1);
    // A newer file is left alone by an older build.
    expect(migrate(db)).toBe(SCHEMA_VERSION + 1);
    db.closeSync();
  });

  /** dbMigrations.ts whose migration 1 fails like a full disk on the first (real file) run only. */
  const fullDisk = () => {
    let calls = 0;
    return () => {
      const real = jest.requireActual<typeof import('../src/lib/dbMigrations')>('../src/lib/dbMigrations');
      return {
        ...real,
        migrate: (db: Parameters<typeof real.migrate>[0]) =>
          real.migrate(db, [
            (d) => {
              real.SCHEMA_MIGRATIONS[0](d);
              // Only the real file fails (the in-memory fallback has room).
              if (calls++ === 0) throw new Error('Call to function NativeDatabase.execSync has been rejected. → Caused by: Error code 13: database or disk is full');
            },
          ]),
      };
    };
  };

  test('a full disk while an old install gets missing columns is not corruption: in memory, the file stays in place at its version, the next start opens it', () => {
    oldInstall(false);
    const s = loadNativeStorage(dir, { './dbMigrations': fullDisk() }).mod.storage;
    const note = parseDbRecovery(s.getMeta(DB_RECOVERED_KEY));
    expect(note).toMatchObject({ memory: true, cause: 'error', file: null });
    expect(fs.readdirSync(dir).filter((f) => f.includes('.broken-'))).toEqual([]);
    expect(version()).toBe(0);
    expect(columns()).not.toContain('rir'); // the half-done migration was rolled back
    const next = loadNativeStorage(dir).mod.storage;
    expect(version()).toBe(SCHEMA_VERSION);
    expect(next.setsFor('2026-11-01', 'bench')).toEqual([{ kg: 60, reps: 8, done: true, rir: null, at: null }]);
  });

  test('a full disk while an old install with the whole schema is bumped: it keeps using its file at version 0, migrated next start', () => {
    oldInstall(true);
    const s = loadNativeStorage(dir, { './dbMigrations': fullDisk() }).mod.storage;
    expect(s.getMeta(DB_RECOVERED_KEY)).toBeNull();
    expect(s.setsFor('2026-11-01', 'bench')).toEqual([{ kg: 60, reps: 8, done: true, rir: 2, at: 99 }]);
    s.setMeta('weights', '[2]');
    expect(version()).toBe(0);
    const next = loadNativeStorage(dir).mod.storage;
    expect(version()).toBe(SCHEMA_VERSION);
    expect(next.getMeta('weights')).toBe('[2]');
  });
});
