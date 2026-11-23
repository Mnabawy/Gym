// The phone database's schema, as an ordered list of migrations keyed by SQLite's `PRAGMA user_version` (0 on a file
// that never ran one). On open, every migration past the file's version runs in order, each in its own transaction that
// also bumps user_version, so a failed one leaves the file and its version exactly as they were and runs again on the
// next start. Errors are thrown as they are (never wrapped): dbOpen.ts tells a corrupt file from a full disk by them.
// To change the schema, add a new function at the END of SCHEMA_MIGRATIONS; never edit or reorder one that shipped.
// Pure: storage.ts gives it the expo-sqlite database; tested on real SQLite in __tests__/storageContract.test.ts.

import { isCorrupt } from './dbOpen';

/** The part of expo-sqlite's sync API a migration uses. */
export type MigrationDb = {
  execSync(sql: string): void;
  getAllSync<T>(sql: string): T[];
  getFirstSync<T>(sql: string): T | null;
  withTransactionSync(f: () => void): void;
};

export type Migration = (db: MigrationDb) => void;

/** Adds a column unless the table already has it (installs from before user_version got it from the old start code). */
export function addColumn(db: MigrationDb, table: string, column: string, type: string) {
  const cols = db.getAllSync<{ name: string }>(`PRAGMA table_info(${table})`).map((c) => c.name);
  if (!cols.includes(column)) db.execSync(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}

export const SCHEMA_MIGRATIONS: readonly Migration[] = [
  // 1: the whole schema as it was before migrations existed. Written to be a no-op on an install that already has it
  // (user_version 0, tables made and columns added by the old start code).
  (db) => {
    db.execSync(`
      CREATE TABLE IF NOT EXISTS set_logs (
        date TEXT NOT NULL, weekday INTEGER NOT NULL, ex_id TEXT NOT NULL, idx INTEGER NOT NULL,
        kg REAL, reps INTEGER, done INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (date, ex_id, idx)
      );
      CREATE INDEX IF NOT EXISTS set_logs_ex ON set_logs (ex_id, date);
      CREATE TABLE IF NOT EXISTS meal_checks (date TEXT NOT NULL, meal TEXT NOT NULL, PRIMARY KEY (date, meal));
      CREATE TABLE IF NOT EXISTS shop_checks (week TEXT NOT NULL, item TEXT NOT NULL, PRIMARY KEY (week, item));
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `);
    // Reps left in the tank (rir) and when the set was ticked (at, ms).
    addColumn(db, 'set_logs', 'rir', 'INTEGER');
    addColumn(db, 'set_logs', 'at', 'INTEGER');
  },
];

/** The schema version this build writes. */
export const SCHEMA_VERSION = SCHEMA_MIGRATIONS.length;

export const userVersion = (db: MigrationDb): number => db.getFirstSync<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0;

/**
 * Runs the migrations past the file's user_version, each with its version bump in one transaction. A file from a newer
 * build (higher version) is left as it is. Returns the version the file ends at.
 * Errors are thrown as they are (dbOpen.ts classifies them), except a non-corrupt failure of an old install's bump (below).
 */
export function migrate(db: MigrationDb, list: readonly Migration[] = SCHEMA_MIGRATIONS): number {
  for (let v = userVersion(db); v < list.length; v++) {
    const next = v + 1;
    try {
      db.withTransactionSync(() => {
        list[next - 1](db);
        db.execSync(`PRAGMA user_version = ${next}`);
      });
    } catch (e) {
      // An install from before migrations (version 0) that already has the whole schema needs nothing from migration 1
      // but its bump: when only that can't be written (disk full, busy...), it keeps using its file as it did before
      // migrations, at version 0, and tries again next start. Later migrations still run (or fail) as usual.
      if (v === 0 && !isCorrupt(e) && baselineComplete(db)) continue;
      throw e;
    }
  }
  return userVersion(db);
}

/** The file already has everything migration 1 makes (tables, index, the later set_logs columns). */
function baselineComplete(db: MigrationDb): boolean {
  try {
    const names = new Set(db.getAllSync<{ name: string }>("SELECT name FROM sqlite_master WHERE type IN ('table', 'index')").map((r) => r.name));
    const cols = new Set(db.getAllSync<{ name: string }>('PRAGMA table_info(set_logs)').map((c) => c.name));
    return (
      ['set_logs', 'set_logs_ex', 'meal_checks', 'shop_checks', 'meta'].every((n) => names.has(n)) &&
      ['date', 'weekday', 'ex_id', 'idx', 'kg', 'reps', 'done', 'rir', 'at'].every((c) => cols.has(c))
    );
  } catch {
    return false;
  }
}
