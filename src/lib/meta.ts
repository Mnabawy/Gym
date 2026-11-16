// Reading and writing the JSON maps in storage meta (src/lib/journal.ts), with a data-version bump so screens re-read.
import { useDataVersion } from './bus';
import { dateKey } from './logic';
import { parseMap, prune } from './journal';
import { isRec } from './records';
import { storage } from './storage';

function rawMap(raw: string | null): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(raw || 'null');
    return isRec(v) ? { ...v } : null;
  } catch {
    return null;
  }
}

export const readStrings = (key: string) => parseMap<string>(storage.getMeta(key), 'string');
export const readNumbers = (key: string) => parseMap<number>(storage.getMeta(key), 'number');

/**
 * Sets (or with `undefined`, removes) one entry. `dated`: keys start with a date and old ones are dropped.
 * `all`: exercise cards remount too (a swap changes what they show).
 */
export function writeEntry<V extends string | number>(key: string, kind: 'string' | 'number', k: string, v: V | undefined, opts: { dated?: boolean; all?: boolean } = {}) {
  // The stored map as it is, so entries this build can't read (a newer build's) are kept: they sync one per row.
  let m: Record<string, unknown> = rawMap(storage.getMeta(key)) ?? {};
  if (v === undefined || v === '') delete m[k];
  else m[k] = v;
  if (opts.dated) m = prune(m, dateKey());
  storage.setMeta(key, JSON.stringify(m));
  const bus = useDataVersion.getState();
  if (opts.all) bus.bumpAll();
  else bus.bump();
}
