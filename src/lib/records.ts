// Forward compatibility for synced records (tasks, goals, quits, habits, the brain dump, focus sessions…): a phone on an
// older build must not throw away what a newer build wrote. Two rules, used by every parser and store of a
// `SPLIT_META` key (cloudSync.ts):
//   1. A record keeps the fields this build doesn't know (`keepExtra`): they ride along untouched on every write.
//   2. A record this build can't read at all is hidden, but stays in storage (`keepUnread` / `keepUnreadMap` on write).
// Without them an older build rebuilt each record from its own field list, wrote the result back, and sync sent every
// stripped record (and every dropped one, as a delete) to the other phone as a newer edit.
// Pure — unit tested in __tests__/records.test.ts.

export type Rec = Record<string, unknown>;
export const isRec = (x: unknown): x is Rec => !!x && typeof x === 'object' && !Array.isArray(x);
const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/**
 * The checked record `v` plus the fields of `raw` this build doesn't know (not in `known`), in `raw`'s key order so a
 * record nobody changed is written back byte for byte (sync compares JSON). A known field the parser left out (bad or
 * removed) stays out.
 */
export function keepExtra<T extends object>(raw: unknown, known: ReadonlySet<string>, v: T): T {
  if (!isRec(raw)) return v;
  const out: Rec = {};
  const val = v as unknown as Rec;
  for (const k of Object.keys(raw)) {
    if (has(val, k)) out[k] = val[k];
    else if (!known.has(k)) out[k] = raw[k];
  }
  for (const k of Object.keys(val)) if (!has(out, k)) out[k] = val[k];
  return out as T;
}

/** A JSON list (or [] when broken / not a list). */
function list(raw: string | null | undefined): unknown[] {
  try {
    const v: unknown = JSON.parse(raw || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** Parses a JSON list record by record (`one` = null for a record this build can't read); a repeated id is dropped. */
export function parseList<T extends { id: string }>(raw: string | null | undefined, one: (x: unknown) => T | null): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const x of list(raw)) {
    const r = one(x);
    if (!r || seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

const idOf = (x: unknown) => (isRec(x) && typeof x.id === 'string' ? x.id : null);

/**
 * The JSON to store for `next` (what the app wants saved): `next`, plus the records in the stored value `raw` that
 * this build can't read (`one` gives null), each kept after the record it followed there. One with the same id as a
 * record in `next` gives way to it.
 */
export function keepUnread(raw: string | null | undefined, next: readonly unknown[], one: (x: unknown) => unknown): string {
  const out = [...next];
  const ids = new Set(next.map(idOf).filter((x): x is string => x != null));
  const unreadIds = new Set<string>(); // an unreadable id kept once, so a split sync never gets two rows for one key
  let at = 0; // where the next unreadable record goes: after the last stored record that's still in `next`
  for (const x of list(raw)) {
    const id = idOf(x);
    if (id != null && ids.has(id)) {
      const i = out.findIndex((y) => idOf(y) === id);
      if (i >= 0) at = i + 1;
    } else if (one(x) == null) {
      if (id != null) {
        if (unreadIds.has(id)) continue;
        unreadIds.add(id);
      }
      out.splice(at, 0, x);
      at++;
    }
  }
  return JSON.stringify(out);
}

/** For a JSON map (`id|date` → value): `next` plus the stored entries this build can't read (`ok` false), unless `next` sets that key. */
export function keepUnreadMap(raw: string | null | undefined, next: Readonly<Record<string, unknown>>, ok: (k: string, v: unknown) => boolean): string {
  let old: unknown;
  try {
    old = JSON.parse(raw || 'null');
  } catch {
    old = null;
  }
  const out: Rec = { ...next };
  if (isRec(old)) for (const [k, v] of Object.entries(old)) if (v != null && !ok(k, v) && !has(out, k)) out[k] = v;
  return JSON.stringify(out);
}
