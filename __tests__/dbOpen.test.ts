/// <reference types="jest" />
/// <reference types="node" />
// Opening the database without a white screen (src/lib/dbOpen.ts), pure and through the real storage.ts on node:sqlite.
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { brokenName, DB_RECOVERED_KEY, isCorrupt, markerName, openWithRecovery, parseDbRecovery, type OpenDeps } from '../src/lib/dbOpen';
import { loadNativeStorage } from '../test-utils/nodeSqlite';

describe('openWithRecovery', () => {
  const deps = (o: Partial<OpenDeps<string>> & { failOpen?: number[]; failSetup?: string[]; setupError?: string } = {}) => {
    const log: string[] = [];
    let opens = 0;
    const d: OpenDeps<string> = {
      open: () => {
        opens++;
        log.push(`open ${opens}`);
        if (o.failOpen?.includes(opens)) throw new Error('cannot open');
        return `db${opens}`;
      },
      setup: (db) => {
        log.push(`setup ${db}`);
        if (o.failSetup?.includes(db)) throw new Error(o.setupError ?? 'file is not a database');
      },
      close: (db) => void log.push(`close ${db}`),
      moveAside: (at) => (log.push(`move ${at}`), `gym.db.broken-${at}`),
      moveBack: (at) => void log.push(`back ${at}`),
      openMemory: () => (log.push('memory'), 'mem'),
      now: () => 42,
      ...o,
    };
    return { d, log };
  };

  test('a good file: no note, nothing moved', () => {
    const { d, log } = deps();
    expect(openWithRecovery(d)).toEqual({ db: 'db1', recovery: null });
    expect(log).toEqual(['open 1', 'setup db1']);
  });

  test('a broken file is moved aside (not deleted), then closed, and a fresh one opened, with a note', () => {
    const { d, log } = deps({ failSetup: ['db1'] });
    const r = openWithRecovery(d);
    expect(r.db).toBe('db2');
    expect(r.recovery).toEqual({ at: 42, file: 'gym.db.broken-42', error: 'file is not a database', cause: 'corrupt' });
    expect(log).toEqual(['open 1', 'setup db1', 'move 42', 'close db1', 'open 2', 'setup db2']);
  });

  test('the file cannot be moved: in-memory for this session, never the same broken file again', () => {
    const { d, log } = deps({
      failSetup: ['db1'],
      moveAside: () => {
        throw new Error('EPERM');
      },
    });
    const r = openWithRecovery(d);
    expect(r.db).toBe('mem');
    expect(r.recovery).toMatchObject({ file: null, memory: true });
    expect(log).not.toContain('open 2');
  });

  test('even the fresh file fails: the moved files are put back under their own name, then in-memory', () => {
    const { d, log } = deps({ failSetup: ['db1', 'db2'] });
    expect(openWithRecovery(d)).toMatchObject({ db: 'mem', recovery: { file: null, memory: true, cause: 'corrupt' } });
    expect(log).toEqual(['open 1', 'setup db1', 'move 42', 'close db1', 'open 2', 'setup db2', 'close db2', 'back 42', 'memory', 'setup mem']);
  });

  test('the fresh file fails and putting it back fails too: the note keeps the moved name', () => {
    const { d } = deps({
      failSetup: ['db1', 'db2'],
      moveBack: () => {
        throw new Error('EPERM');
      },
    });
    expect(openWithRecovery(d)).toMatchObject({ db: 'mem', recovery: { file: 'gym.db.broken-42', memory: true } });
  });

  for (const err of ['database or disk is full', 'database is locked', 'database is busy', 'unable to open database file', 'disk I/O error']) {
    test(`not corrupt (${err}): the file is never moved, in-memory for this session`, () => {
      const { d, log } = deps({ failSetup: ['db1'], setupError: err });
      const r = openWithRecovery(d);
      expect(r).toMatchObject({ db: 'mem', recovery: { file: null, memory: true, cause: 'error', error: err } });
      expect(log.some((l) => l.startsWith('move') || l.startsWith('back'))).toBe(false);
      expect(log).toContain('close db1');
      expect(log).not.toContain('open 2');
    });
  }

  test('a full disk while opening (open itself throws): nothing moved', () => {
    const { d, log } = deps({ failOpen: [1], open: () => { throw Object.assign(new Error('Error code 13: database or disk is full'), {}); } });
    expect(openWithRecovery(d).recovery).toMatchObject({ cause: 'error', file: null, memory: true });
    expect(log.some((l) => l.startsWith('move'))).toBe(false);
  });

  test('isCorrupt: only a broken file', () => {
    for (const e of [
      new Error('file is not a database'),
      new Error('database disk image is malformed'),
      new Error("Call to function 'NativeDatabase.execSync' has been rejected. Caused by: Error code 11: database disk image is malformed"),
      Object.assign(new Error('x'), { code: 'SQLITE_CORRUPT' }),
      Object.assign(new Error('x'), { errcode: 26 }),
      Object.assign(new Error('x'), { errcode: 267 }), // SQLITE_CORRUPT_VTAB
    ])
      expect(isCorrupt(e)).toBe(true);
    for (const e of [
      new Error('database or disk is full'),
      new Error('database is locked'),
      new Error('Error code 13: database or disk is full'),
      Object.assign(new Error('x'), { code: 'SQLITE_FULL' }),
      Object.assign(new Error('x'), { errcode: 5 }),
      null,
      undefined,
    ])
      expect(isCorrupt(e)).toBe(false);
  });

  test('parseDbRecovery reads the note back and ignores junk', () => {
    expect(parseDbRecovery(JSON.stringify({ at: 1, file: 'x', error: 'e' }))).toEqual({ at: 1, file: 'x', error: 'e' });
    for (const raw of [null, '', 'nope', '{}', '[]']) expect(parseDbRecovery(raw)).toBeNull();
  });
});

describe('the real storage.ts', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainy-db-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('a good database keeps its data across starts and has no note', () => {
    const a = loadNativeStorage(dir).mod.storage;
    a.saveSet({ date: '2026-11-01', weekday: 1, exId: 'bench', idx: 0, kg: 60, reps: 8, done: 1 });
    a.setMeta('weights', '[1]');
    const b = loadNativeStorage(dir).mod.storage;
    expect(b.setsFor('2026-11-01', 'bench')[0]).toMatchObject({ kg: 60, reps: 8, done: true });
    expect(b.getMeta(DB_RECOVERED_KEY)).toBeNull();
  });

  test('a broken gym.db: moved aside with its bytes intact, a fresh one opens, and the note says so', () => {
    const junk = 'this is not a sqlite file '.repeat(200);
    fs.writeFileSync(path.join(dir, 'gym.db'), junk);
    fs.writeFileSync(path.join(dir, 'gym.db-wal'), 'wal-bytes');
    const { mod, opened } = loadNativeStorage(dir);
    const note = parseDbRecovery(mod.storage.getMeta(DB_RECOVERED_KEY));
    expect(note).toMatchObject({ file: brokenName('gym.db', note!.at) });
    expect(note!.memory).toBeUndefined();
    expect(opened).toEqual(['gym.db', 'gym.db']);
    expect(fs.readFileSync(path.join(dir, note!.file!), 'utf8')).toBe(junk); // never deleted
    expect(fs.readFileSync(path.join(dir, `${note!.file}-wal`), 'utf8')).toBe('wal-bytes');
    mod.storage.setMeta('weights', '[1]'); // the fresh database works and keeps what is written
    expect(loadNativeStorage(dir).mod.storage.getMeta('weights')).toBe('[1]');
  });

  test('gym.db that cannot be opened (not corrupt): left in place, in-memory, and the note survives to the next start', () => {
    fs.mkdirSync(path.join(dir, 'gym.db')); // a folder: "unable to open database file", not a broken file
    const first = loadNativeStorage(dir).mod.storage;
    const note = parseDbRecovery(first.getMeta(DB_RECOVERED_KEY));
    expect(note).toMatchObject({ cause: 'error', memory: true, file: null });
    expect(fs.statSync(path.join(dir, 'gym.db')).isDirectory()).toBe(true); // never moved
    expect(fs.readdirSync(dir).some((f) => f.includes('.broken-'))).toBe(false);
    expect(fs.existsSync(path.join(dir, markerName('gym.db')))).toBe(true); // the in-memory note is kept outside the database
    first.setMeta('weights', '[1]'); // in memory: lost
    fs.rmdirSync(path.join(dir, 'gym.db'));
    const next = loadNativeStorage(dir).mod.storage;
    expect(parseDbRecovery(next.getMeta(DB_RECOVERED_KEY))).toMatchObject({ at: note!.at, cause: 'error', unsaved: true });
    expect(parseDbRecovery(next.getMeta(DB_RECOVERED_KEY))?.memory).toBeUndefined();
    expect(fs.existsSync(path.join(dir, markerName('gym.db')))).toBe(false);
    expect(next.getMeta('weights')).toBeNull();
    // Dismissed once, it stays dismissed.
    next.setMeta(DB_RECOVERED_KEY, '');
    expect(loadNativeStorage(dir).mod.storage.getMeta(DB_RECOVERED_KEY)).toBe('');
  });

  test('a good gym.db that is locked at start (busy): not moved, its data still there on the next start', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DatabaseSync } = require('node:sqlite');
    const other = new DatabaseSync(path.join(dir, 'gym.db'));
    other.exec(`CREATE TABLE set_logs (date TEXT NOT NULL, weekday INTEGER NOT NULL, ex_id TEXT NOT NULL, idx INTEGER NOT NULL,
      kg REAL, reps INTEGER, done INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (date, ex_id, idx));
      INSERT INTO set_logs VALUES ('2026-11-01', 1, 'bench', 0, 60, 8, 1);`);
    other.exec('PRAGMA locking_mode = EXCLUSIVE; BEGIN EXCLUSIVE;');
    const busy = loadNativeStorage(dir).mod.storage;
    expect(parseDbRecovery(busy.getMeta(DB_RECOVERED_KEY))).toMatchObject({ cause: 'error', memory: true, file: null });
    other.exec('ROLLBACK');
    other.close();
    expect(fs.readdirSync(dir).some((f) => f.includes('.broken-'))).toBe(false);
    const next = loadNativeStorage(dir).mod.storage;
    expect(next.setsFor('2026-11-01', 'bench')[0]).toMatchObject({ kg: 60, reps: 8 });
    expect(parseDbRecovery(next.getMeta(DB_RECOVERED_KEY))).toMatchObject({ unsaved: true });
  });
});
