/// <reference types="jest" />
import { SHOPPING } from '../src/data/shopping';
import { daysLabel, gramsToBuy, PANTRY, parseQty, SHOP_WEEK, splitShopping, tripDays, tripFor } from '../src/lib/shop';

const items = SHOPPING.flatMap((g) => g.items);

describe('tripDays', () => {
  test('splits the Friday-first week into runs, longer first', () => {
    expect(tripDays(1).map((d) => d.length)).toEqual([7]);
    expect(tripDays(2)).toEqual([[5, 6, 0, 1], [2, 3, 4]]);
    expect(tripDays(3).map((d) => d.length)).toEqual([3, 2, 2]);
    expect(tripDays(4).map((d) => d.length)).toEqual([2, 2, 2, 1]);
    expect(tripDays(5).map((d) => d.length)).toEqual([2, 2, 1, 1, 1]);
    for (const n of [1, 2, 3, 4, 5]) expect(tripDays(n).flat()).toEqual(SHOP_WEEK);
  });
  test('out-of-range counts are clamped', () => {
    expect(tripDays(0)).toHaveLength(1);
    expect(tripDays(9)).toHaveLength(5);
  });
});

test('every pantry id is on the list', () => {
  for (const id of PANTRY) expect(items.some((i) => i.id === id)).toBe(true);
});

test('one trip = the list as written', () => {
  const [trip] = splitShopping(1);
  const got = trip.groups.flatMap((g) => g.items);
  expect(got.map((i) => [i.key, i.buy, i.need])).toEqual(items.map((i) => [i.id, i.buy, i.exact]));
});

describe('two trips', () => {
  const trips = splitShopping(2);
  const find = (k: number, id: string) => trips[k].groups.flatMap((g) => g.items).find((i) => i.item.id === id);

  test('an item eaten one day goes on the trip that covers that day, in full', () => {
    expect(find(0, 'كبدة')?.need).toBe('200 جم'); // Monday → Fri–Mon trip
    expect(find(1, 'كبدة')).toBeUndefined();
  });
  test('pantry and no-day items are bought once, on the first trip', () => {
    for (const id of [...PANTRY, 'ليمون']) {
      expect(find(0, id)?.once).toBe(true);
      expect(find(1, id)).toBeUndefined();
    }
  });
  test('fresh items are shared by days and never short', () => {
    const eggs = [find(0, 'بيض')!, find(1, 'بيض')!].map((i) => Number(i.buy.split(' ')[0]));
    expect(eggs[0] + eggs[1]).toBeGreaterThanOrEqual(32);
    expect(find(0, 'بيض')!.days).toHaveLength(4);
  });
  test('check keys are unique and differ from the one-trip keys', () => {
    const keys = trips.flatMap((t) => t.groups.flatMap((g) => g.items.map((i) => i.key)));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).not.toContain('بيض');
  });
  test('today picks the trip that covers it', () => {
    expect(tripFor(trips, 5)).toBe(0); // Friday
    expect(tripFor(trips, 3)).toBe(1); // Wednesday
  });
});

test('daysLabel', () => {
  expect(daysLabel([5, 6])).toBe('الجمعة – السبت');
  expect(daysLabel([5, 6], true)).toBe('جمعة – سبت');
  expect(daysLabel([2], true)).toBe('تلات');
});

test('parseQty', () => {
  expect(parseQty('1,140 جم')).toEqual({ n: 1140, unit: 'جم' });
  expect(parseQty('2.5 لتر')).toEqual({ n: 2.5, unit: 'لتر' });
  expect(parseQty('رشة في كل سموزي')).toBeNull();
  expect(parseQty('35 جم في الأسبوع')).toBeNull();
});

test('gramsToBuy rounds up to what you ask for at the shop', () => {
  expect(gramsToBuy(180)).toBe('200 جم');
  expect(gramsToBuy(250)).toBe('ربع كيلو');
  expect(gramsToBuy(290)).toBe('300 جم');
  expect(gramsToBuy(750)).toBe('تلات تربع كيلو');
  expect(gramsToBuy(1090)).toBe('1.1 كيلو');
  expect(gramsToBuy(1250)).toBe('1 كيلو وربع');
  expect(gramsToBuy(1500)).toBe('1 كيلو ونص');
});
