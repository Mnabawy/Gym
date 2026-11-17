// One-time changes to the shape of saved meta values, run once per phone at start right after the database opens
// (storage.ts / storage.web.ts). Meta `metaVersion` (phone-only, cloudSync `isLocalMeta`) = how many have run; each one
// and its bump go in one storage transaction, and a failed one leaves the version as it was (it runs again on the next
// start; the app still starts). A migration writes through the tracked storage, so what it changes in synced keys is
// sent like any edit. The version is part of the phone's data, not its account: a backup carries it (an older file
// without it makes them run again after it's put back), wiping the phone clears it, so every migration must be safe to
// run again on data it already changed. To add one, append a function to META_MIGRATIONS; never edit or reorder one
// that shipped.
// Kept out of here on purpose: anything that must also fix data arriving later (a restored old backup, a pull from an
// older build), since these run only at start. So the settings `look` move (old red → blue) stays in parseSettings, the
// phone-only settings split (meta `device`) stays in settings.ts `load()` (it must also run right after a wipe, before a
// pull can bring another phone's fields), and `sync.split` stays in cloud.ts (it's part of a sync).
// Pure: tested in __tests__/storageContract.test.ts against both storages.

/** Meta key: how many META_MIGRATIONS have run on this phone's data (missing = 0). Phone-only. */
export const META_VERSION_KEY = 'metaVersion';

export type MetaStore = {
  getMeta(key: string): string | null;
  setMeta(key: string, value: string): void;
  transaction(f: () => void): void;
};

export type MetaMigration = (s: MetaStore) => void;

/** None yet: the existing one-off changes have to keep running on restored and pulled data (see above). */
export const META_MIGRATIONS: readonly MetaMigration[] = [];

export function readMetaVersion(raw: string | null | undefined): number {
  const n = Number(raw);
  return raw && Number.isInteger(n) && n > 0 ? n : 0;
}

/**
 * Runs the migrations past the stored version, in order, each with its bump in one transaction. Stops at the first
 * that throws and returns its error (not thrown: a broken migration must not keep the app from starting).
 */
export function runMetaMigrations(s: MetaStore, list: readonly MetaMigration[] = META_MIGRATIONS): { version: number; error: unknown } {
  let v = readMetaVersion(s.getMeta(META_VERSION_KEY));
  for (; v < list.length; v++) {
    const next = v + 1;
    try {
      s.transaction(() => {
        list[next - 1](s);
        s.setMeta(META_VERSION_KEY, String(next));
      });
    } catch (error) {
      return { version: v, error };
    }
  }
  return { version: v, error: null };
}
