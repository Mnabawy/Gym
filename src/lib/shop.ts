// Split the weekly shopping list into several trips (settings → "بتشتري كام مرة في الأسبوع").
// Pure — unit tested in __tests__/shop.test.ts.
//
// The shopping week starts Friday (see shopWeekKey) and trip k covers a run of days. Items are never split: each one
// is bought whole on one trip, and trips get an equal number of items (they differ by one at most) — see assignTrips.
// You choose another trip for any item from the shopping tab's edit mode (`moves`); the list itself never changes.
import { SHOPPING, type ShopItem } from '../data/shopping';
import { WEEKDAYS_AR } from '../data/program';

/** Weekday numbers (0 = Sunday) in shopping-week order: Friday first. */
export const SHOP_WEEK = [5, 6, 0, 1, 2, 3, 4];
export const TRIPS_MIN = 1;
export const TRIPS_MAX = 5;

type Group = (typeof SHOPPING)[number];

export type TripItem = {
  item: ShopItem;
  /** Check-off key; includes the trip count so changing it mid-week doesn't carry ticks to the wrong trip. */
  key: string;
  /** What to buy and the exact weekly need, as written in the list. */
  buy: string;
  need: string;
  /** Days of the week the item is eaten. */
  days: string[];
};
export type Trip = { index: number; weekdays: number[]; label: string; groups: { title: string; color: Group['color']; items: TripItem[] }[] };

/** n runs of consecutive shopping-week days, longer runs first: 2 → Fri–Mon, Tue–Thu. */
export function tripDays(n: number): number[][] {
  const k = Math.min(TRIPS_MAX, Math.max(TRIPS_MIN, Math.round(n)));
  const out: number[][] = [];
  let at = 0;
  for (let i = 0; i < k; i++) {
    const len = Math.floor(SHOP_WEEK.length / k) + (i < SHOP_WEEK.length % k ? 1 : 0);
    out.push(SHOP_WEEK.slice(at, at + len));
    at += len;
  }
  return out;
}

/** "الجمعة – الاتنين", or one day name. `short` drops the "ال" ("جمعة – اتنين") for tight spots. */
export function daysLabel(weekdays: number[], short = false): string {
  const name = (d: number) => (short ? WEEKDAYS_AR[d].replace(/^ال/, '') : WEEKDAYS_AR[d]);
  const a = name(weekdays[0]);
  return weekdays.length > 1 ? `${a} – ${name(weekdays[weekdays.length - 1])}` : a;
}

/** Shopping-week position of the first day an item is eaten (Friday = 0); no days (lemons) → 0. */
export function firstDay(item: Pick<ShopItem, 'days'>): number {
  const at = item.days.map((d) => SHOP_WEEK.indexOf(WEEKDAYS_AR.indexOf(d))).filter((i) => i >= 0);
  return at.length ? Math.min(...at) : 0;
}

/**
 * Which trip each item goes on. Trips get equal counts (bigger ones first). Items eaten on few days are placed first,
 * on the trip that covers the first day they're eaten (liver on Monday → Monday's trip); when that trip is full they go
 * to the nearest earlier trip, then the nearest later one. Everyday items fill the rest — bought
 * every week at the same point, they last until the next time anyway. `moves` (id → trip) override.
 */
export function assignTrips(k: number, data: readonly Group[], moves: Readonly<Record<string, number>> = {}): Map<string, number> {
  const runs = tripDays(k);
  const items = data.flatMap((g) => g.items);
  const room = runs.map((_, t) => Math.floor(items.length / k) + (t < items.length % k ? 1 : 0));
  const want = (item: ShopItem) => Math.max(0, runs.findIndex((r) => r.includes(SHOP_WEEK[firstDay(item)])));
  const spread = (item: ShopItem) => item.days.length || 8; // no days = most flexible
  const order = items.map((item, i) => ({ item, i })).sort((a, b) => spread(a.item) - spread(b.item) || firstDay(a.item) - firstDay(b.item) || a.i - b.i);
  const out = new Map<string, number>();
  for (const { item } of order) {
    const p = want(item);
    const tries = [p, ...Array.from({ length: p }, (_, d) => p - 1 - d), ...Array.from({ length: k - 1 - p }, (_, d) => p + 1 + d)];
    const t = tries.find((x) => room[x] > 0) ?? p;
    room[t]--;
    out.set(item.id, t);
  }
  for (const [id, t] of Object.entries(moves)) if (out.has(id) && Number.isInteger(t) && t >= 0 && t < k) out.set(id, t);
  return out;
}

/** The week's list as `n` trips; every item lands, whole, on exactly one. n = 1 gives the list as written. */
export function splitShopping(n: number, data: readonly Group[] = SHOPPING, moves: Readonly<Record<string, number>> = {}): Trip[] {
  const runs = tripDays(n);
  const whole = runs.length === 1;
  const tripOf = assignTrips(runs.length, data, moves);
  return runs.map((weekdays, index) => {
    const groups = data.map((g) => ({
      title: g.title,
      color: g.color,
      items: g.items
        .filter((item) => tripOf.get(item.id) === index)
        .map((item) => ({ item, key: whole ? item.id : `${item.id}#${runs.length}.${index}`, buy: item.buy, need: item.exact, days: item.days })),
    }));
    return { index, weekdays, label: daysLabel(weekdays), groups: groups.filter((g) => g.items.length) };
  });
}

/** Moves saved for a trip count ("5:بيض" → 3) as id → trip. */
export function movesFor(k: number, all: Readonly<Record<string, number>>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, t] of Object.entries(all)) if (key.startsWith(`${k}:`)) out[key.slice(String(k).length + 1)] = t;
  return out;
}

/** Trip that covers a weekday (0 = Sunday). */
export const tripFor = (trips: readonly Trip[], weekday: number) => Math.max(0, trips.findIndex((t) => t.weekdays.includes(weekday)));
