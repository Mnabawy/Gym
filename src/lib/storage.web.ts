// Web storage: localStorage (used for the web preview; the phone app uses SQLite)
import { brokenName, DB_RECOVERED_KEY, type DbRecovery } from './dbOpen';
import { runMetaMigrations } from './metaMigrations';
import { track } from './track';
import { groupByDate, rowsToSets, type SetRow, type Storage } from './storage.types';

type State = { sets: SetRow[]; meals: { date: string; meal: string }[]; shop: { week: string; item: string }[]; meta: Record<string, string> };
const KEY = 'gym-app-v1';

const empty = (): State => ({ sets: [], meals: [], shop: [], meta: {} });
function load(): State {
  let raw: string | null | undefined;
  try {
    raw = globalThis.localStorage?.getItem(KEY);
  } catch {}
  if (!raw) return empty();
  try {
    const v = JSON.parse(raw) as Partial<State>;
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('not the app data');
    return { ...empty(), ...v } as State;
  } catch (e) {
    // Like storage.ts: a broken copy is kept under another key (never deleted) and the app starts fresh, with a note.
    const at = Date.now();
    let file: string | null = brokenName(KEY, at);
    try {
      globalThis.localStorage?.setItem(file, raw);
    } catch {
      file = null;
    }
    const note: DbRecovery = { at, file, error: String((e as Error)?.message ?? e).slice(0, 200) };
    return { ...empty(), meta: { [DB_RECOVERED_KEY]: JSON.stringify(note) } };
  }
}
let S = load();
let batching = false;
function persist() {
  if (batching) return;
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(S));
  } catch {}
}

const base: Storage = {
  setsFor(date, exId) {
    return rowsToSets(S.sets.filter((r) => r.date === date && r.exId === exId));
  },
  saveSet(r) {
    const i = S.sets.findIndex((x) => x.date === r.date && x.exId === r.exId && x.idx === r.idx);
    if (i >= 0) S.sets[i] = r;
    else S.sets.push(r);
    persist();
  },
  lastSession(exId, date) {
    // One pass for the newest earlier day with a number, one for its rows.
    let d: string | undefined;
    for (const r of S.sets) if (r.exId === exId && r.date < date && (r.kg != null || r.reps != null) && (d === undefined || r.date > d)) d = r.date;
    return d ? this.setsFor(d, exId) : undefined;
  },
  clearDay(date, exIds) {
    S.sets = S.sets.filter((r) => !(r.date === date && exIds.includes(r.exId)));
    persist();
  },
  deleteSet(date, exId, idx) {
    S.sets = S.sets.filter((r) => !(r.date === date && r.exId === exId && r.idx === idx));
    persist();
  },
  transaction(f) {
    // All or nothing, like SQLite: a write that throws puts back what was there before. A nested one (a savepoint in
    // storage.ts) keeps its own copy, so only its writes go back and the outer one can still commit.
    const outer = !batching;
    const before = JSON.stringify(S);
    batching = true;
    try {
      f();
    } catch (e) {
      S = JSON.parse(before) as State;
      throw e;
    } finally {
      if (outer) {
        batching = false;
        persist();
      }
    }
  },
  history(exId) {
    // One pass over the rows (not one per date), grouped by date like storage.ts.
    const rows = S.sets.filter((r) => r.exId === exId).sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.idx - b.idx));
    return groupByDate(rows);
  },
  doneSetsBetween(from, to) {
    const m = new Map<string, number>();
    for (const r of S.sets) if (r.done && r.date >= from && r.date <= to) m.set(r.exId, (m.get(r.exId) ?? 0) + 1);
    return [...m].map(([exId, n]) => ({ exId, n }));
  },
  sessionDates(from, to) {
    return [...new Set(S.sets.filter((r) => r.done && r.date >= from && r.date <= to).map((r) => r.date))].sort();
  },
  trainedDays() {
    const m = new Map<string, { date: string; weekdays: number[]; sets: number }>();
    for (const r of S.sets) {
      if (!r.done) continue;
      const d = m.get(r.date) ?? { date: r.date, weekdays: [], sets: 0 };
      if (!d.weekdays.includes(r.weekday)) d.weekdays.push(r.weekday);
      d.sets++;
      m.set(r.date, d);
    }
    return [...m.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  },
  allSets() {
    return [...S.sets].sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.exId !== b.exId ? (a.exId < b.exId ? -1 : 1) : a.idx - b.idx));
  },
  mealChecks(date) {
    return S.meals.filter((m) => m.date === date).map((m) => m.meal);
  },
  allMealChecks() {
    return [...S.meals].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  },
  setMealCheck(date, meal, on) {
    S.meals = S.meals.filter((m) => !(m.date === date && m.meal === meal));
    if (on) S.meals.push({ date, meal });
    persist();
  },
  shopChecks(week) {
    return S.shop.filter((s) => s.week === week).map((s) => s.item);
  },
  setShopCheck(week, item, on) {
    S.shop = S.shop.filter((s) => !(s.week === week && s.item === item));
    if (on) S.shop.push({ week, item });
    persist();
  },
  clearShop(week) {
    S.shop = S.shop.filter((s) => s.week !== week);
    persist();
  },
  getMeta(key) {
    return S.meta[key] ?? null;
  },
  setMeta(key, value) {
    S.meta[key] = value;
    persist();
  },
  dump() {
    return { sets: this.allSets(), meals: this.allMealChecks(), shop: [...S.shop], meta: { ...S.meta } };
  },
  restore(d) {
    S = { sets: d.sets.map((r) => ({ ...r })), meals: d.meals.map((m) => ({ ...m })), shop: d.shop.map((x) => ({ ...x })), meta: { ...d.meta } };
    persist();
  },
};

/** Every write is noted for Supabase sync (src/lib/track.ts). */
export const storage: Storage = track(base);

/** One-time meta changes (metaMigrations.ts; web has no SQLite schema, only these). `error` is reported by the root layout. */
export const metaMigrations = runMetaMigrations(storage);
