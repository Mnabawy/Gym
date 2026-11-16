// Opening the phone's database without a white screen. Only a CORRUPT gym.db (SQLITE_CORRUPT / SQLITE_NOTADB, "malformed",
// "not a database") is moved aside (renamed with the time, never deleted, so it can still be looked at) and a fresh one
// opened; meta `dbRecovered` notes what happened so the app can tell you to put a backup back. Any other error (disk full,
// busy / locked, can't open) leaves the file exactly where it is: the app runs on an in-memory database for this session
// (nothing is saved; `memory` in the note) and the next start opens the real file again. If even the fresh file fails,
// the moved files are put back under their own names before going in-memory. A note that can't be saved in the database
// (in-memory) is kept in a small marker file next to it (storage.ts) and carried into the database on the next start.
// Pure: storage.ts gives it the real expo-sqlite / expo-file-system calls; unit tested in __tests__/dbOpen.test.ts.

/** Meta key: JSON `DbRecovery`, set when the database was found broken at start. Phone-only (cloudSync `isLocalMeta`). */
export const DB_RECOVERED_KEY = 'dbRecovered';

export type DbRecovery = {
  /** When it happened (ms). */
  at: number;
  /** The name the broken file was moved to, or null if it was not moved (not corrupt, could not be moved, or put back). */
  file: string | null;
  /** Nothing is saved this session: the database could not be opened, so it runs in memory. */
  memory?: boolean;
  /** Why: 'corrupt' (the file is broken; missing on old notes = corrupt) or 'error' (disk full, busy...: the file is fine). */
  cause?: 'corrupt' | 'error';
  /** Carried over from an earlier in-memory session: what was logged then (at `at`) was not saved. */
  unsaved?: boolean;
  /** The error, short (for a bug report). */
  error: string;
};

export type OpenDeps<D> = {
  open: () => D;
  /** Creates tables and runs migrations; throws on a broken file. */
  setup: (db: D) => void;
  close: (db: D) => void;
  /** Renames the database file (and its -wal / -shm) to a name with `at`; returns the new name, or null when there was no file. */
  moveAside: (at: number) => string | null;
  /** Undoes `moveAside(at)`: drops the fresh file (and its -wal / -shm) and gives the moved ones their names back. */
  moveBack: (at: number) => void;
  openMemory: () => D;
  now?: () => number;
};

const message = (e: unknown) => String((e as Error)?.message ?? e).slice(0, 200);

/** The file itself is broken (not a full disk, a lock or a missing permission): only then is it moved aside. */
export function isCorrupt(e: unknown): boolean {
  const x = e as { message?: unknown; code?: unknown; errcode?: unknown; errstr?: unknown } | null | undefined;
  // node:sqlite / some drivers give the SQLite result code: 11 = SQLITE_CORRUPT, 26 = SQLITE_NOTADB (low byte of extended codes).
  const n = typeof x?.errcode === 'number' ? x.errcode : null;
  if (n != null && ((n & 0xff) === 11 || (n & 0xff) === 26)) return true;
  const text = [x?.message, x?.code, x?.errstr, typeof e === 'string' ? e : ''].map((v) => String(v ?? '')).join(' ');
  return /SQLITE_CORRUPT|SQLITE_NOTADB|malformed|not a database|error code (11|26)\b/i.test(text);
}

export function openWithRecovery<D>(o: OpenDeps<D>): { db: D; recovery: DbRecovery | null } {
  let db: D | undefined;
  try {
    db = o.open();
    o.setup(db);
    return { db, recovery: null };
  } catch (e) {
    const at = (o.now ?? Date.now)();
    const error = message(e);
    const memory = (file: string | null, cause: 'corrupt' | 'error') => {
      const mem = o.openMemory();
      o.setup(mem);
      return { db: mem, recovery: { at, file, error, memory: true, cause } };
    };
    if (!isCorrupt(e)) {
      // Disk full, busy, locked, no permission...: the data is fine, so it stays exactly where it is.
      if (db !== undefined) {
        try {
          o.close(db);
        } catch {}
      }
      return memory(null, 'error');
    }
    // Moved before it is closed: closing makes SQLite delete the -wal / -shm files under their old names, and the -wal may
    // hold the newest writes. (Renaming an open file is fine on iOS and Android.)
    let file: string | null = null;
    try {
      file = o.moveAside(at);
    } catch {}
    if (db !== undefined) {
      try {
        o.close(db);
      } catch {}
    }
    // Only a moved file is worth a second try: opening the same broken file again fails the same way.
    if (file) {
      let fresh: D | undefined;
      try {
        fresh = o.open();
        o.setup(fresh);
        return { db: fresh, recovery: { at, file, error, cause: 'corrupt' } };
      } catch {
        if (fresh !== undefined) {
          try {
            o.close(fresh);
          } catch {}
        }
        // Even a fresh file fails (e.g. the disk is full): put the old one back under its own name, so the next start
        // finds it there and not an empty gym.db with the real data hidden under a .broken name.
        try {
          o.moveBack(at);
          file = null;
        } catch {}
      }
    }
    return memory(file, 'corrupt');
  }
}

/** The renamed file for a broken database: `gym.db` → `gym.db.broken-<ms>` (its -wal / -shm get the same tail). */
export const brokenName = (name: string, at: number) => `${name}.broken-${at}`;

/** The marker file next to the database that keeps a note the database itself could not hold (in-memory session). */
export const markerName = (name: string) => `${name}.recovery.json`;

/** A note from an in-memory session, as it reads on the next start: that session's writes were not saved. */
export const carriedOver = (n: DbRecovery): DbRecovery => {
  const { memory: _m, ...rest } = n;
  return { ...rest, unsaved: true };
};

/** The note left by `openWithRecovery`, or null (none, or unreadable). */
export function parseDbRecovery(raw: string | null | undefined): DbRecovery | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as DbRecovery;
    return v && typeof v.at === 'number' ? v : null;
  } catch {
    return null;
  }
}
