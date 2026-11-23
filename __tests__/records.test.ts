/// <reference types="jest" />
// Forward compatibility (src/lib/records.ts): an older build keeps what a newer one wrote, field by field and record by record.
import { keepExtra, keepUnread, keepUnreadMap } from '../src/lib/records';

describe('keepExtra', () => {
  test('keeps unknown fields in their place and drops known ones the parser left out', () => {
    const r = keepExtra({ a: 1, zz: 'new', b: 'bad', c: 3 }, new Set(['a', 'b', 'c']), { a: 1, c: 4 });
    expect(r).toEqual({ a: 1, zz: 'new', c: 4 });
    expect(Object.keys(r)).toEqual(['a', 'zz', 'c']);
  });
});

describe('records this build cannot read survive a write', () => {
  test('keepUnread keeps them after the record they followed; same id in the new list wins', () => {
    const raw = JSON.stringify([{ id: 'a', title: 'A' }, { id: 'x' }, { id: 'b', title: 'B' }, { id: 'y' }]);
    const one = (r: unknown) => ((r as { title?: string }).title ? r : null);
    expect(JSON.parse(keepUnread(raw, [{ id: 'b', title: 'B' }, { id: 'c', title: 'C' }], one))).toEqual([{ id: 'x' }, { id: 'b', title: 'B' }, { id: 'y' }, { id: 'c', title: 'C' }]);
    expect(JSON.parse(keepUnread(raw, [{ id: 'x', title: 'X' }], one))).toEqual([{ id: 'x', title: 'X' }, { id: 'y' }]);
    expect(keepUnread('broken', [], one)).toBe('[]');
  });

  test('keepUnreadMap keeps entries it cannot read unless the new map sets them', () => {
    const raw = JSON.stringify({ 'h|2026-11-01': 'done', 'h|2026-11-02': 'half', 'h|2026-11-03': 'later' });
    const ok = (_k: string, v: unknown) => v === 'done';
    expect(JSON.parse(keepUnreadMap(raw, { 'h|2026-11-03': 'done' }, ok))).toEqual({ 'h|2026-11-03': 'done', 'h|2026-11-02': 'half' });
  });
});

test('keepUnread keeps one copy of an unreadable id stored twice', () => {
  const raw = JSON.stringify([{ id: 'a', ok: true }, { id: 'x' }, { id: 'x' }]);
  const one = (r: unknown) => ((r as { ok?: boolean }).ok ? r : null);
  const out = JSON.parse(keepUnread(raw, [{ id: 'a', ok: true }], one));
  expect(out.filter((r: { id: string }) => r.id === 'x')).toHaveLength(1);
});
