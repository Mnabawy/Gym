// Native storage: expo-sqlite (iOS / Android)
import * as SQLite from 'expo-sqlite';
import { track } from './track';
import { rowsToSets, type Dump, type SetRow, type Storage } from './storage.types';

const db = SQLite.openDatabaseSync('gym.db');
db.execSync(`
  PRAGMA journal_mode = WAL;
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
// Columns added later: reps left in the tank (rir) and when the set was ticked (at, ms).
const cols = db.getAllSync<{ name: string }>('PRAGMA table_info(set_logs)').map((c) => c.name);
if (!cols.includes('rir')) db.execSync('ALTER TABLE set_logs ADD COLUMN rir INTEGER');
if (!cols.includes('at')) db.execSync('ALTER TABLE set_logs ADD COLUMN at INTEGER');

type Row = { idx: number; kg: number | null; reps: number | null; done: number; rir: number | null; at: number | null };

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
    const d = db.getFirstSync<{ date: string }>(
      `SELECT date FROM set_logs WHERE ex_id = ? AND date < ? AND (kg IS NOT NULL OR reps IS NOT NULL) ORDER BY date DESC LIMIT 1`,
      exId, date,
    );
    return d ? this.setsFor(d.date, exId) : undefined;
  },
  clearDay(date, exIds) {
    for (const id of exIds) db.runSync('DELETE FROM set_logs WHERE date = ? AND ex_id = ?', date, id);
  },
  deleteSet(date, exId, idx) {
    db.runSync('DELETE FROM set_logs WHERE date = ? AND ex_id = ? AND idx = ?', date, exId, idx);
  },
  transaction(f) {
    db.withTransactionSync(f);
  },
  history(exId) {
    const dates = db.getAllSync<{ date: string }>('SELECT DISTINCT date FROM set_logs WHERE ex_id = ? ORDER BY date', exId);
    return dates.map(({ date }) => ({ date, sets: this.setsFor(date, exId) }));
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
    db.withTransactionSync(() => {
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

/** Every write is noted for Supabase sync (src/lib/track.ts). */
export const storage: Storage = track(base);
