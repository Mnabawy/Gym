// Change counters so screens re-read storage after a write.
//
// Per area: every write through the tracked storage (src/lib/track.ts) bumps the area it touched — `sets`, `meals`,
// `shop`, or `meta:<key>` for a meta key — and `useData(...areas)` re-renders a component only when one of its areas
// changes. Restoring a backup, wiping the phone, a sync pull and `bumpAll` bump every area at once (`all`).
// `v` is the old global counter: it goes up on every area bump and every `bump()`, so a component still on
// `useDataVersion((s) => s.v)` keeps re-reading after any write, as before.
import { create } from 'zustand';

/** Area names. Meta keys are `meta:<key>` (`metaArea`). */
export const AREA = {
  sets: 'sets',
  meals: 'meals',
  shop: 'shop',
  /** The sync state (sync on/off, the change log, a sync finishing): the account page and the side menu's status line. */
  sync: 'sync',
  /** Progress photos (files, not storage). */
  photos: 'photos',
} as const;
export const metaArea = (key: string) => `meta:${key}`;

type Bus = {
  /** Any write: screens still on the global counter re-read storage. */
  v: number;
  /** Writes that exercise cards can't know about (clearing a day, changing the plan): cards remount and re-read. */
  cards: number;
  /** Every area at once (restore, wipe, sync pull, bumpAll). */
  all: number;
  /** One counter per area that has changed since the app started. */
  areas: Record<string, number>;
  /** A card's own write (a set ticked): everything else refreshes, the card keeps its state (and its animations). */
  bump: () => void;
  bumpAll: () => void;
};

/**
 * `v` already went up (a store's own `bump()`) in this tick: the flush of the writes that came with it doesn't raise it
 * again. Cleared a microtask later, so a bump never hides a write made later on its own.
 */
let vSince = false;
const markV = () => {
  if (!vSince) queueMicrotask(() => void (vSince = false));
  vSince = true;
};

export const useDataVersion = create<Bus>((set) => ({
  v: 0,
  cards: 0,
  all: 0,
  areas: {},
  bump: () => {
    markV();
    set((s) => ({ v: s.v + 1 }));
  },
  bumpAll: () => {
    markV();
    set((s) => ({ v: s.v + 1, cards: s.cards + 1, all: s.all + 1 }));
  },
}));

/** The version of a set of areas: it changes when any of them (or everything) changes. Counters only go up, so a sum does. */
export function versionOf(s: Pick<Bus, 'all' | 'areas'>, areas: readonly string[]): number {
  let n = s.all;
  for (const a of areas) n += s.areas[a] ?? 0;
  return n;
}

/** Re-renders when one of `areas` changes (or everything does); returns their version, for useMemo deps. */
export function useData(...areas: string[]): number {
  return useDataVersion((s) => versionOf(s, areas));
}

let pending: Set<string> | null = null;
let pendingAll = false;

/**
 * Applies the queued area bumps now (one store update). Called on its own a microtask after the first bump, so a write
 * made while a component renders never updates another one mid-render, and many writes in a row re-render once.
 */
export function flushAreas() {
  const keys = pending;
  const everything = pendingAll;
  const bumped = vSince;
  pending = null;
  pendingAll = false;
  vSince = false;
  if (!keys && !everything) return;
  // `v` (screens still on the global counter) goes up once per change: not again after a store's own bump(), and not
  // for sync bookkeeping alone (a sync writes its cursor and log several times; screens show data, not the sync state).
  const syncOnly = !everything && !!keys && [...keys].every((k) => k === AREA.sync);
  const bumpV = !bumped && !syncOnly;
  useDataVersion.setState((s) => {
    const areas = { ...s.areas };
    if (keys) for (const k of keys) areas[k] = (areas[k] ?? 0) + 1;
    return { v: bumpV ? s.v + 1 : s.v, areas, all: everything ? s.all + 1 : s.all };
  });
}

const schedule = () => {
  if (pending || pendingAll) return;
  queueMicrotask(flushAreas);
};

/** Notes that these areas changed (the tracked storage calls this on every write). */
export function bumpAreas(...areas: string[]) {
  if (!areas.length) return;
  schedule();
  pending ??= new Set();
  for (const a of areas) pending.add(a);
}

/** Notes that everything may have changed (storage replaced by a restore or a wipe). Exercise cards don't remount: `bumpAll` does that. */
export function bumpEverything() {
  schedule();
  pendingAll = true;
}
