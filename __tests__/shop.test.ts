/// <reference types="jest" />
import { SHOPPING } from '../src/data/shopping';
import { daysLabel, firstDay, isCustom, movesFor, OTHER, SHOP_WEEK, splitShopping, tripDays, tripFor, withCustom } from '../src/lib/shop';

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

const ids = (trip: ReturnType<typeof splitShopping>[number]) => trip.groups.flatMap((g) => g.items.map((i) => i.item.id));

test('every item lands on exactly one trip, whole, as written', () => {
  for (const n of [1, 2, 3, 4, 5]) {
    const trips = splitShopping(n);
    const got = trips.flatMap(ids);
    expect(got.slice().sort()).toEqual(items.map((i) => i.id).sort());
    for (const i of trips.flatMap((t) => t.groups.flatMap((g) => g.items))) {
      expect(i.buy).toBe(i.item.buy);
      expect(i.need).toBe(i.item.exact);
    }
  }
});

test('one trip = the list as written', () => {
  const [trip] = splitShopping(1);
  expect(trip.groups.flatMap((g) => g.items).map((i) => i.key)).toEqual(items.map((i) => i.id));
});

describe('which trip an item goes on', () => {
  const trips = splitShopping(5); // Fri–Sat, Sun–Mon, Tue, Wed, Thu
  const where = (id: string) => trips.findIndex((t) => ids(t).includes(id));
  const sizes = (tr: typeof trips) => tr.map((t) => t.groups.reduce((a, g) => a + g.items.length, 0));
  test('equal counts, differing by one at most', () => {
    for (const n of [2, 3, 4, 5]) {
      const z = sizes(splitShopping(n));
      expect(Math.max(...z) - Math.min(...z)).toBeLessThanOrEqual(1);
    }
  });
  test('items eaten on one day go on the trip that covers it', () => {
    expect(firstDay({ days: ['الاتنين'] })).toBe(3);
    expect(where('كبدة')).toBe(1); // Monday
    expect(where('مانجا')).toBe(2); // Tuesday
    expect(where('عدس')).toBe(3); // Wednesday
  });
  test('check keys are unique and differ from the one-trip keys', () => {
    const keys = trips.flatMap((t) => t.groups.flatMap((g) => g.items.map((i) => i.key)));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).not.toContain('بيض');
  });
  test('today picks the trip that covers it', () => {
    expect(tripFor(trips, 5)).toBe(0); // Friday
    expect(tripFor(trips, 3)).toBe(3); // Wednesday
  });
});

describe('moves and your own items', () => {
  test('a move puts the item on that trip; bad moves are ignored', () => {
    const t = splitShopping(3, SHOPPING, { بيض: 0, كبدة: 9, nope: 1 });
    expect(ids(t[0])).toContain('بيض');
    expect(t.flatMap(ids).filter((id) => id === 'كبدة')).toHaveLength(1);
  });
  test('movesFor reads the moves saved for one trip count', () => {
    expect(movesFor(3, { '3:بيض': 0, '5:بيض': 4, '3:c:x': 2 })).toEqual({ بيض: 0, 'c:x': 2 });
  });
  test('your items join their group, or a new "حاجات تانية" group at the end', () => {
    const data = withCustom([
      { id: 'c:1', name: 'مناديل', buy: '2 باكو', group: OTHER },
      { id: 'c:2', name: 'جمبري', buy: 'نص كيلو', group: 'بروتين' },
    ]);
    expect(data[0].items[data[0].items.length - 1]).toMatchObject({ id: 'c:2', name: 'جمبري', buy: 'نص كيلو', days: [] });
    expect(data[data.length - 1]).toMatchObject({ title: OTHER, items: [{ id: 'c:1', name: 'مناديل' }] });
    expect(isCustom('c:1')).toBe(true);
    expect(isCustom('بيض')).toBe(false);
    const trips = splitShopping(2, data, { 'c:1': 1 });
    expect(ids(trips[1])).toContain('c:1');
    expect(trips.flatMap(ids)).toHaveLength(items.length + 2);
  });
});

test('daysLabel', () => {
  expect(daysLabel([5, 6])).toBe('الجمعة – السبت');
  expect(daysLabel([5, 6], true)).toBe('جمعة – سبت');
  expect(daysLabel([2], true)).toBe('تلات');
});
