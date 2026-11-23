// Native storage: expo-sqlite (iOS / Android)
import { Directory, File } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import { brokenName, carriedOver, DB_RECOVERED_KEY, markerName, openWithRecovery, parseDbRecovery, type DbRecovery } from './dbOpen';
import { migrate } from './dbMigrations';
import { runMetaMigrations } from './metaMigrations';
import { groupByDate, rowsToSets, type Dump, type SetRow, type Storage } from './storage.types';

const NAME = 'gym.db';

function setup(db: SQLite.SQLiteDatabase) {
  // Outside any transaction: SQLite can't change the journal mode inside one.
  db.execSync('PRAGMA journal_mode = WAL;');
  // Tables and columns: dbMigrations.ts, by PRAGMA user_version. Its errors come through as they are, so dbOpen.ts still
  // moves only a corrupt file aside (a full disk mid-migration runs in memory with the file and its version untouched).
  migrate(db);
  // Reading a row makes SQLite read the file: a broken one fails here, not later on a screen.
  db.getFirstSync('SELECT key FROM meta LIMIT 1');
}

const dbDir = () => {
  const root = String(SQLite.defaultDatabaseDirectory ?? '');
  return new Directory(root.startsWith('file://') ? root : `file://${root}`);
};
const TAILS = ['', '-wal', '-shm'];

/** Moves gym.db (and its -wal / -shm) aside, renamed with the time; never deletes. The new name, or null if there was no file. */
function moveAside(at: number): string | null {
  const dir = dbDir();
  const main = new File(dir, NAME);
  if (!main.exists) return null;
  for (const tail of ['-wal', '-shm']) {
    const f = new File(dir, NAME + tail);
    if (f.exists) f.rename(brokenName(NAME, at) + tail);
  }
  main.rename(brokenName(NAME, at));
  return brokenName(NAME, at);
}

/** Undoes moveAside(at): the fresh (empty, failed) gym.db and its -wal / -shm go, the moved files get their names back. */
function moveBack(at: number) {
  const dir = dbDir();
  if (!new File(dir, brokenName(NAME, at)).exists) throw new Error('nothing to put back');
  // A -wal / -shm left by the fresh open must not be applied to the old file: drop all of the fresh one first.
  for (const tail of TAILS) {
    const fresh = new File(dir, NAME + tail);
    if (fresh.exists) fresh.delete();
  }
  for (const tail of TAILS) {
    const moved = new File(dir, brokenName(NAME, at) + tail);
    if (moved.exists) moved.rename(NAME + tail);
  }
}

// A broken gym.db must not give a white screen: dbOpen.ts moves a corrupt one aside and opens a fresh one; any other error
// runs this session in memory with the file left in place (meta `dbRecovered`).
const opened = openWithRecovery({
  open: () => SQLite.openDatabaseSync(NAME),
  setup,
  close: (d) => d.closeSync(),
  moveAside,
  moveBack,
  openMemory: () => SQLite.openDatabaseSync(':memory:'),
});
const db = opened.db;

// The note must survive even when this session's database is in memory: then it also goes in a marker file next to
// gym.db, and the next start that opens the real file carries it into meta and deletes the marker.
const marker = () => new File(dbDir(), markerName(NAME));
const putNote = (n: DbRecovery) => db.runSync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', DB_RECOVERED_KEY, JSON.stringify(n));
if (opened.recovery) {
  let saved = false;
  try {
    putNote(opened.recovery);
    saved = !opened.recovery.memory;
  } catch {}
  try {
    const m = marker();
    if (saved) {
      if (m.exists) m.delete(); // an older marker must not overwrite this newer note on the next start
    } else {
      if (!m.exists) m.create();
      m.writeSync(JSON.stringify(opened.recovery));
    }
  } catch {}
} else {
  try {
    const m = marker();
    const old = m.exists ? parseDbRecovery(m.textSync()) : null;
    if (old) putNote(old.memory ? carriedOver(old) : old);
    if (m.exists) m.delete();
  } catch {}
}

type Row = { idx: number; kg: number | null; reps: number | null; done: number; rir: number | null; at: number | null };

// How deep in transactions we are. The outermost is a real one; one opened inside it is a savepoint, so when it throws
// only its own writes roll back (the outer one can catch that and still commit what it did itself).
let txDepth = 0;
function tx(f: () => void) {
  if (!txDepth) {
    txDepth++;
    try {
      db.withTransactionSync(f);
    } finally {
      txDepth--;
    }
    return;
  }
  const sp = `sp${txDepth}`;
  db.execSync(`SAVEPOINT ${sp}`);
  txDepth++;
  try {
    f();
    db.execSync(`RELEASE ${sp}`);
  } catch (e) {
    // A failed ROLLBACK TO never hides the original error.
    try {
      db.execSync(`ROLLBACK TO ${sp}`);
      db.execSync(`RELEASE ${sp}`);
    } catch {}
    throw e;
  } finally {
    txDepth--;
  }
}

const base: Storage = {
  setsFor(date, exId) {
    return rowsToSets(db.getAllSync<Row>('SELECT idx, kg, reps, done, rir, at FROM set_logs WHERE date = ? AND ex_id = ? ORDER BY idx', date, exId));
  },
  saveSet(r: SetRow) {
    db.runSync(
      `INSERT INTO set_logs (date, weekday, ex_id, idx, kg, reps, done, rir, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(date, ex_id, idx) DO UPDATE SET kg = excluded.kg, reps = excluded.reps, done = excluded.done, rir = excluded.rir, at = excluded.at`,
      r.date, r.weekday, r.exId, r.idx, r.kg, r.reps, r.done, r.rir ?? null, r.at ?? null,
    );
  },
  lastSession(exId, date) {
    // One query: the newest earlier day with a number, and all of that day's rows.
    const rows = db.getAllSync<Row>(
      `SELECT idx, kg, reps, done, rir, at FROM set_logs WHERE ex_id = ? AND date = (
         SELECT MAX(date) FROM set_logs WHERE ex_id = ? AND date < ? AND (kg IS NOT NULL OR reps IS NOT NULL)
       ) ORDER BY idx`,
      exId, exId, date,
    );
    return rows.length ? rowsToSets(rows) : undefined;
  },
  clearDay(date, exIds) {
    for (const id of exIds) db.runSync('DELETE FROM set_logs WHERE date = ? AND ex_id = ?', date, id);
  },
  deleteSet(date, exId, idx) {
    db.runSync('DELETE FROM set_logs WHERE date = ? AND ex_id = ? AND idx = ?', date, exId, idx);
  },
  transaction(f) {
    tx(f);
  },
  history(exId) {
    // One query for every day (not one per date), grouped here; rows come sorted by date, then idx.
    const rows = db.getAllSync<Row & { date: string }>('SELECT date, idx, kg, reps, done, rir, at FROM set_logs WHERE ex_id = ? ORDER BY date, idx', exId);
    return groupByDate(rows);
  },
  doneSetsBetween(from, to) {
    return db
      .getAllSync<{ ex_id: string; n: number }>('SELECT ex_id, COUNT(*) AS n FROM set_logs WHERE done = 1 AND date BETWEEN ? AND ? GROUP BY ex_id', from, to)
      .map((r) => ({ exId: r.ex_id, n: r.n }));
  },
  sessionDates(from, to) {
    return db.getAllSync<{ date: string }>('SELECT DISTINCT date FROM set_logs WHERE done = 1 AND date BETWEEN ? AND ? ORDER BY date', from, to).map((r) => r.date);
  },
  trainedDays() {
    return db
      .getAllSync<{ date: string; wds: string; n: number }>(
        'SELECT date, GROUP_CONCAT(DISTINCT weekday) AS wds, COUNT(*) AS n FROM set_logs WHERE done = 1 GROUP BY date ORDER BY date',
      )
      .map((r) => ({ date: r.date, weekdays: r.wds.split(',').map(Number), sets: r.n }));
  },
  allSets() {
    return db
      .getAllSync<{ date: string; weekday: number; ex_id: string; idx: number; kg: number | null; reps: number | null; done: number; rir: number | null; at: number | null }>(
        'SELECT date, weekday, ex_id, idx, kg, reps, done, rir, at FROM set_logs ORDER BY date, ex_id, idx',
      )
      .map((r) => ({ date: r.date, weekday: r.weekday, exId: r.ex_id, idx: r.idx, kg: r.kg, reps: r.reps, done: r.done, rir: r.rir, at: r.at }));
  },
  mealChecks(date) {
    return db.getAllSync<{ meal: string }>('SELECT meal FROM meal_checks WHERE date = ?', date).map((r) => r.meal);
  },
  allMealChecks() {
    return db.getAllSync<{ date: string; meal: string }>('SELECT date, meal FROM meal_checks ORDER BY date');
  },
  setMealCheck(date, meal, on) {
    if (on) db.runSync('INSERT OR IGNORE INTO meal_checks (date, meal) VALUES (?, ?)', date, meal);
    else db.runSync('DELETE FROM meal_checks WHERE date = ? AND meal = ?', date, meal);
  },
  shopChecks(week) {
    return db.getAllSync<{ item: string }>('SELECT item FROM shop_checks WHERE week = ?', week).map((r) => r.item);
  },
  setShopCheck(week, item, on) {
    if (on) db.runSync('INSERT OR IGNORE INTO shop_checks (week, item) VALUES (?, ?)', week, item);
    else db.runSync('DELETE FROM shop_checks WHERE week = ? AND item = ?', week, item);
  },
  clearShop(week) {
    db.runSync('DELETE FROM shop_checks WHERE week = ?', week);
  },
  getMeta(key) {
    return db.getFirstSync<{ value: string }>('SELECT value FROM meta WHERE key = ?', key)?.value ?? null;
  },
  setMeta(key, value) {
    db.runSync('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
  },
  dump(): Dump {
    const meta: Record<string, string> = {};
    for (const r of db.getAllSync<{ key: string; value: string }>('SELECT key, value FROM meta')) meta[r.key] = r.value;
    return {
      sets: this.allSets(),
      meals: this.allMealChecks(),
      shop: db.getAllSync<{ week: string; item: string }>('SELECT week, item FROM shop_checks ORDER BY week'),
      meta,
    };
  },
  restore(d) {
    tx(() => {
      db.execSync('DELETE FROM set_logs; DELETE FROM meal_checks; DELETE FROM shop_checks; DELETE FROM meta;');
      for (const r of d.sets) {
        db.runSync(
          'INSERT OR REPLACE INTO set_logs (date, weekday, ex_id, idx, kg, reps, done, rir, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          r.date, r.weekday, r.exId, r.idx, r.kg, r.reps, r.done, r.rir ?? null, r.at ?? null,
        );
      }
      for (const m of d.meals) db.runSync('INSERT OR IGNORE INTO meal_checks (date, meal) VALUES (?, ?)', m.date, m.meal);
      for (const x of d.shop) db.runSync('INSERT OR IGNORE INTO shop_checks (week, item) VALUES (?, ?)', x.week, x.item);
      for (const [k, v] of Object.entries(d.meta)) db.runSync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', k, v);
    });
  },
};

export const storage: Storage = base;

/** One-time meta changes (metaMigrations.ts), run once the database is open; `error` is reported by the root layout. */
export const metaMigrations = runMetaMigrations(storage);
