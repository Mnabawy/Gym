// Split the weekly shopping list into several trips (settings → "بتشتري كام مرة في الأسبوع").
// Pure — unit tested in __tests__/shop.test.ts.
//
// The shopping week starts Friday (see shopWeekKey). Trip k covers a run of days; a fresh item gets the share of
// its weekly amount for the days it's eaten in that run (liver eaten only Monday → all of it on the trip that covers Monday).
// Dry goods, jars and supplements keep well, so they're bought once, on the first trip.
import { SHOPPING, type ShopItem } from '../data/shopping';
import { WEEKDAYS_AR } from '../data/program';
import { countAr } from './logic';

/** Weekday numbers (0 = Sunday) in shopping-week order: Friday first. */
export const SHOP_WEEK = [5, 6, 0, 1, 2, 3, 4];
export const TRIPS_MIN = 1;
export const TRIPS_MAX = 5;

/** Bought once a week whatever the trip count. */
export const PANTRY = new Set(['رز', 'مكرونة', 'شوفان', 'فول', 'عدس', 'سوداني', 'زبدة فول سوداني', 'طحينة', 'عسل', 'كاكاو', 'قرفة', 'creatine']);

type Group = (typeof SHOPPING)[number];
export type TripItem = {
  item: ShopItem;
  /** Check-off key; includes the trip count so changing it mid-week doesn't carry ticks to the wrong trip. */
  key: string;
  buy: string;
  /** Exact amount needed for this trip ("" when unknown). */
  need: string;
  /** Days in this trip the item is eaten. */
  days: string[];
  /** Bought once for the week (pantry, or no usage days). */
  once: boolean;
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

/** "1,140 جم" → { n: 1140, unit: 'جم' }. Anything else ("رشة في كل سموزي") → null. */
export function parseQty(s: string): { n: number; unit: string } | null {
  const m = /^(\d[\d,]*(?:\.\d+)?)\s+(\S+)$/.exec(s.trim());
  return m ? { n: Number(m[1].replace(/,/g, '')), unit: m[2] } : null;
}

const COUNT_FORMS: Record<string, [string, string, string, string]> = {
  بيضة: ['بيضة', 'بيضتين', 'بيضات', 'بيضة'],
  علبة: ['علبة', 'علبتين', 'علب', 'علبة'],
  رغيف: ['رغيف', 'رغيفين', 'أرغفة', 'رغيف'],
  صباع: ['صباع', 'صباعين', 'صوابع', 'صباع'],
  بلحة: ['بلحة', 'بلحتين', 'بلحات', 'بلحة'],
};
const QUARTER = ['', 'ربع', 'نص', 'تلات تربع'];

/**
 * Grams to buy: rounded up to 50 g (100 g from a kilo up). Quarter-kilo amounts use the words people say at the shop:
 * 300 جم · ربع كيلو · نص كيلو · 1.1 كيلو · 1 كيلو ونص.
 */
export function gramsToBuy(g: number): string {
  const up = (step: number) => Math.max(step, Math.ceil(g / step - 1e-9) * step);
  const fine = up(g < 1000 ? 50 : 100);
  const quarter = up(250);
  const x = quarter <= fine ? quarter : fine;
  if (x % 250) return x < 1000 ? `${x} جم` : `${x / 1000} كيلو`;
  const kilos = Math.floor(x / 1000);
  const q = QUARTER[(x % 1000) / 250];
  if (!kilos) return `${q} كيلو`;
  return q ? `${kilos} كيلو و${q}` : `${kilos} كيلو`;
}

/** Amount to buy and amount needed for a share of a weekly quantity. */
function share(q: { n: number; unit: string }, frac: number): { buy: string; need: string } {
  const v = q.n * frac;
  if (q.unit === 'جم') return { buy: gramsToBuy(v), need: `${Math.max(10, Math.round(v / 10) * 10)} جم` };
  if (q.unit === 'لتر') {
    const need = Math.round(v * 10) / 10;
    return { buy: `${Math.ceil(v * 2) / 2} لتر`, need: `${need} لتر` };
  }
  const c = Math.ceil(v - 1e-9);
  const text = countAr(c, COUNT_FORMS[q.unit] ?? [q.unit, q.unit, q.unit, q.unit]);
  return { buy: text, need: '' };
}

/** The week's list as `n` trips. n = 1 gives the list exactly as written (same buy text, same check keys). */
export function splitShopping(n: number, data: readonly Group[] = SHOPPING): Trip[] {
  const runs = tripDays(n);
  const whole = runs.length === 1;
  return runs.map((weekdays, index) => {
    const names = weekdays.map((d) => WEEKDAYS_AR[d]);
    const groups = data.map((g) => {
      const items: TripItem[] = [];
      for (const item of g.items) {
        const key = whole ? item.id : `${item.id}#${runs.length}.${index}`;
        const q = parseQty(item.exact);
        const once = whole || PANTRY.has(item.id) || !item.days.length || !q;
        if (once) {
          if (index === 0) items.push({ item, key, buy: item.buy, need: item.exact, days: whole ? item.days : [], once: !whole });
          continue;
        }
        const days = item.days.filter((d) => names.includes(d));
        if (!days.length) continue;
        items.push({ item, key, ...share(q, days.length / item.days.length), days, once: false });
      }
      return { title: g.title, color: g.color, items };
    });
    return { index, weekdays, label: daysLabel(weekdays), groups: groups.filter((g) => g.items.length) };
  });
}

/** Trip that covers a weekday (0 = Sunday). */
export const tripFor = (trips: readonly Trip[], weekday: number) => Math.max(0, trips.findIndex((t) => t.weekdays.includes(weekday)));
