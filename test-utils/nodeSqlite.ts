/// <reference types="jest" />
/// <reference types="node" />
// A stand-in for `expo-sqlite` (the sync API storage.ts uses) on Node's built-in SQLite (`node:sqlite`, Node 22.5+), and a
// small `expo-file-system` (File / Directory: exists, rename, create, delete, textSync, writeSync) on the real disk, so the real src/lib/storage.ts runs in
// jest: its SQL, its migrations and its broken-file recovery. Each call to `nodeSqlite(dir)` is one phone: databases are
// files in `dir`, like expo-sqlite's `defaultDatabaseDirectory`.
import * as nodeFs from 'fs';
import * as path from 'path';
import type * as StorageMod from '../src/lib/storage';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (file: string) => NodeDb };
type NodeDb = {
  exec(sql: string): void;
  prepare(sql: string): { all(...p: unknown[]): unknown[]; get(...p: unknown[]): unknown; run(...p: unknown[]): unknown };
  close(): void;
};

export function nodeSqlite(dir: string) {
  const opened: string[] = [];
  const openDatabaseSync = (name: string) => {
    const file = name === ':memory:' ? ':memory:' : path.join(dir, name);
    opened.push(name);
    const db = new DatabaseSync(file);
    const plain = <T>(r: unknown) => (r == null ? null : ({ ...(r as object) } as T));
    return {
      execSync: (sql: string) => db.exec(sql),
      getAllSync: <T>(sql: string, ...p: unknown[]) => db.prepare(sql).all(...p).map((r) => plain<T>(r) as T),
      getFirstSync: <T>(sql: string, ...p: unknown[]) => plain<T>(db.prepare(sql).get(...p)),
      runSync: (sql: string, ...p: unknown[]) => db.prepare(sql).run(...p),
      withTransactionSync: (f: () => void) => {
        db.exec('BEGIN');
        try {
          f();
          db.exec('COMMIT');
        } catch (e) {
          // Like expo-sqlite: a failed ROLLBACK (SQLite may have rolled back already) never hides the original error.
          try {
            db.exec('ROLLBACK');
          } catch {}
          throw e;
        }
      },
      closeSync: () => db.close(),
    };
  };
  const toPath = (p: string) => p.replace(/^file:\/\//, '');
  class Directory {
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
  }
  class File {
    path: string;
    constructor(d: Directory, name: string) {
      this.path = path.join(toPath(d.uri), name);
    }
    get exists() {
      return nodeFs.existsSync(this.path);
    }
    textSync() {
      return nodeFs.readFileSync(this.path, 'utf8');
    }
    writeSync(text: string) {
      nodeFs.writeFileSync(this.path, text);
    }
    create() {
      if (nodeFs.existsSync(this.path)) throw new Error(`EEXIST: ${this.path}`);
      nodeFs.writeFileSync(this.path, '');
    }
    delete() {
      nodeFs.rmSync(this.path);
    }
    rename(name: string) {
      const to = path.join(path.dirname(this.path), name);
      if (nodeFs.existsSync(to)) throw new Error(`EEXIST: ${to}`);
      nodeFs.renameSync(this.path, to);
      this.path = to;
    }
  }
  return {
    opened,
    sqlite: { openDatabaseSync, defaultDatabaseDirectory: dir },
    files: { File, Directory, Paths: {} },
  };
}

/**
 * The real storage.ts for one phone whose database folder is `dir`, in its own module registry. `mocks`: more modules to
 * replace in that registry (path relative to src/lib, e.g. './dbMigrations' → a factory).
 */
export function loadNativeStorage(dir: string, mocks: Record<string, () => unknown> = {}): { mod: typeof StorageMod; opened: string[] } {
  const fake = nodeSqlite(dir);
  let mod!: typeof StorageMod;
  jest.isolateModules(() => {
    jest.doMock('expo-sqlite', () => fake.sqlite);
    jest.doMock('expo-file-system', () => fake.files);
    for (const [name, factory] of Object.entries(mocks)) jest.doMock(path.join(__dirname, '../src/lib', name), factory);
    mod = jest.requireActual<typeof StorageMod>('../src/lib/storage');
  });
  return { mod, opened: fake.opened };
}
