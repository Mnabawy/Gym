// Native storage: expo-sqlite (iOS / Android)
import * as SQLite from 'expo-sqlite';
import { rowsToSets, type SetRow, type Storage } from './storage.types';

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
`);

type Row = { idx: number; kg: number | null; reps: number | null; done: number };

export const storage: Storage = {
  setsFor(date, exId) {
    return rowsToSets(db.getAllSync<Row>('SELECT idx, kg, reps, done FROM set_logs WHERE date = ? AND ex_id = ? ORDER BY idx', date, exId));
  },
  saveSet(r: SetRow) {
    db.runSync(
      `INSERT INTO set_logs (date, weekday, ex_id, idx, kg, reps, done) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(date, ex_id, idx) DO UPDATE SET kg = excluded.kg, reps = excluded.reps, done = excluded.done`,
      r.date, r.weekday, r.exId, r.idx, r.kg, r.reps, r.done,
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
  mealChecks(date) {
    return db.getAllSync<{ meal: string }>('SELECT meal FROM meal_checks WHERE date = ?', date).map((r) => r.meal);
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
};
