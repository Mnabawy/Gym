// An in-memory `Storage` (src/lib/storage.types.ts) for the sync tests: one per simulated phone, nothing shared.
import { rowsToSets, type Dump, type SetRow, type Storage } from '../src/lib/storage.types';

const same = (a: SetRow, b: SetRow) => a.date === b.date && a.exId === b.exId && a.idx === b.idx;
const byKey = (a: SetRow, b: SetRow) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.exId !== b.exId ? (a.exId < b.exId ? -1 : 1) : a.idx - b.idx);

export function memoryStorage(): Storage {
  let S: Dump = { sets: [], meals: [], shop: [], meta: {} };
  return {
    setsFor: (d, e) => rowsToSets(S.sets.filter((r) => r.date === d && r.exId === e)),
    saveSet: (r) => void (S.sets = [...S.sets.filter((x) => !same(x, r)), { ...r }]),
    lastSession: () => undefined,
    clearDay: (d, ids) => void (S.sets = S.sets.filter((r) => !(r.date === d && ids.includes(r.exId)))),
    deleteSet: (d, e, i) => void (S.sets = S.sets.filter((r) => !(r.date === d && r.exId === e && r.idx === i))),
    transaction: (f) => f(),
    history: () => [],
    doneSetsBetween: () => [],
    sessionDates: () => [],
    trainedDays: () => [],
    allSets: () => [...S.sets].sort(byKey),
    mealChecks: (d) => S.meals.filter((m) => m.date === d).map((m) => m.meal),
    allMealChecks: () => [...S.meals],
    setMealCheck: (d, m, on) => void (S.meals = [...S.meals.filter((x) => !(x.date === d && x.meal === m)), ...(on ? [{ date: d, meal: m }] : [])]),
    shopChecks: (w) => S.shop.filter((x) => x.week === w).map((x) => x.item),
    setShopCheck: (w, i, on) => void (S.shop = [...S.shop.filter((x) => !(x.week === w && x.item === i)), ...(on ? [{ week: w, item: i }] : [])]),
    clearShop: (w) => void (S.shop = S.shop.filter((x) => x.week !== w)),
    getMeta: (k) => S.meta[k] ?? null,
    setMeta: (k, v) => void (S.meta[k] = v),
    dump: () => ({ sets: [...S.sets].sort(byKey), meals: [...S.meals], shop: [...S.shop], meta: { ...S.meta } }),
    restore: (d) => void (S = { sets: d.sets.map((r) => ({ ...r })), meals: d.meals.map((m) => ({ ...m })), shop: d.shop.map((x) => ({ ...x })), meta: { ...d.meta } }),
  };
}
