// The shape of the synced data, as a number all phones on one account agree on (synced meta `dataVersion`).
// Bump DATA_VERSION when a synced record gains a field (or a meaning) that an older build would mishandle. The first
// sync on a newer build writes it (the highest wins); an older build that pulls a higher one stops sending its changes
// (they stay on the phone, sent once the app is updated) and the account page says «حدّث التطبيق عشان تكمّل الحفظ».
// Pulls still apply. records.ts keeps unknown fields either way; this guards what a field list can't (new meanings).
// Pure — unit tested in __tests__/dataVersion.test.ts.

/**
 * This build's data version. Never lower it.
 * 2: the food and body logs, notes, exercise names and settings sync one record per row (`water/<date>`,
 *    `settings/<field>`…, cloudSync.ts SPLIT_META); a version-1 build would skip those rows and send whole values.
 */
export const DATA_VERSION = 2;
export const DATA_VERSION_KEY = 'dataVersion';

/** The stored version (a missing or broken value counts as 1: data written before versions existed). */
export function readDataVersion(raw: string | null | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

/** The account's data is newer than this build understands: don't send anything. */
export const dataTooNew = (raw: string | null | undefined, mine = DATA_VERSION) => readDataVersion(raw) > mine;

/** The value this build should write, or null when the stored one is already at least as high. */
export const versionToWrite = (raw: string | null | undefined, mine = DATA_VERSION): string | null => (readDataVersion(raw) < mine ? String(mine) : null);
