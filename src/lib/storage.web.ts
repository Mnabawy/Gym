// Web storage: localStorage (used for the web preview; the phone app uses SQLite)
import { rowsToSets, type SetRow, type Storage } from './storage.types';

type State = { sets: SetRow[]; meals: { date: string; meal: string }[]; shop: { week: string; item: string }[] };
const KEY = 'gym-app-v1';

function load(): State {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { sets: [], meals: [], shop: [] };
}
let S = load();
function persist() {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(S));
  } catch {}
}

export const storage: Storage = {
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
    const dates = [...new Set(S.sets.filter((r) => r.exId === exId && r.date < date && (r.kg != null || r.reps != null)).map((r) => r.date))].sort();
    const d = dates.pop();
    return d ? this.setsFor(d, exId) : undefined;
  },
  clearDay(date, exIds) {
    S.sets = S.sets.filter((r) => !(r.date === date && exIds.includes(r.exId)));
    persist();
  },
  history(exId) {
    const dates = [...new Set(S.sets.filter((r) => r.exId === exId).map((r) => r.date))].sort();
    return dates.map((date) => ({ date, sets: this.setsFor(date, exId) }));
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
};
