// Reading and writing the JSON maps in storage meta (src/lib/journal.ts), with a data-version bump so screens re-read.
import { useDataVersion } from './bus';
import { parseMap } from './journal';
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

const bumpBus = (all?: boolean) => {
  const bus = useDataVersion.getState();
  if (all) bus.bumpAll();
  else bus.bump();
};

/**
 * Sets (or with `undefined`, removes) one entry. `all`: exercise cards remount too (a swap changes what they show).
 * Old dated entries (water, supplements, meal picks) are never dropped here: they sync one row per entry, and dropping
 * them would send deletes that wipe the same history on every other phone. They're small (a few rows a day).
 */
export function writeEntry<V extends string | number>(key: string, kind: 'string' | 'number', k: string, v: V | undefined, opts: { all?: boolean } = {}) {
  // The stored map as it is, so entries this build can't read (a newer build's) are kept: they sync one per row.
  const m: Record<string, unknown> = rawMap(storage.getMeta(key)) ?? {};
  if (v === undefined || v === '') delete m[k];
  else m[k] = v;
  storage.setMeta(key, JSON.stringify(m));
  bumpBus(opts.all);
}

/** Removes the entries whose keys `drop` picks (one write; nothing is written when none match). */
export function removeEntries(key: string, drop: (k: string) => boolean, opts: { all?: boolean } = {}) {
  const m = rawMap(storage.getMeta(key));
  if (!m) return;
  const gone = Object.keys(m).filter(drop);
  if (!gone.length) return;
  for (const k of gone) delete m[k];
  storage.setMeta(key, JSON.stringify(m));
  bumpBus(opts.all);
}
