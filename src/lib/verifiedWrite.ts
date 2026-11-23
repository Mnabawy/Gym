// Writing a backup file so that a file with the final name is always a good one (iOS / Android). Used by the safety
// snapshots (safetyIO.ts) and the weekly automatic backup (autoBackup.ts).
//
// Protocol: write `<name>.tmp` → read it back and check it holds the same backup as the text (parseBackup on both, then
// dumpHash and the photos) → move an existing `<name>` aside to `<name>.old` → rename the .tmp to `<name>` → delete the
// .old. Any failure deletes the .tmp and puts the .old back, so an earlier file with that name is never lost.
import { Directory, File } from 'expo-file-system';
import { parseBackup } from './backup';
import { dumpHash, SafetyError, tmpName } from './safety';

const message = (e: unknown) => String((e as Error)?.message ?? e).slice(0, 120);
const safe = (f: () => void) => {
  try {
    f();
  } catch {}
};

/**
 * Whether `got` (read back from a file) holds the same backup as `want` (the text that was written). Compared after
 * parsing, since parseBackup drops rows it cannot read: a dump with such rows still verifies.
 */
export function sameBackup(want: string, got: string): boolean {
  const a = parseBackup(want);
  const b = parseBackup(got);
  if (!a.ok || !b.ok || dumpHash(a.data) !== dumpHash(b.data)) return false;
  return a.photos.length === b.photos.length && a.photos.every((p, i) => p.name === b.photos[i].name && p.data === b.photos[i].data);
}

/**
 * Saves a backup text as `dir/name`, verified (see the protocol at the top). Throws SafetyError `space`, `io` or `verify`
 * when no verified file was made; then `dir/name` is what it was before.
 */
export async function writeVerified(dir: Directory, name: string, text: string): Promise<void> {
  const tmp = new File(dir, tmpName(name));
  const old = `${name}.old`;
  let movedOld = false;
  try {
    if (tmp.exists) tmp.delete();
    tmp.create();
    tmp.writeSync(text);
    if (!sameBackup(text, await tmp.text())) throw new SafetyError('verify', 'the saved copy does not match the data');
    const final = new File(dir, name);
    if (final.exists) {
      const o = new File(dir, old);
      if (o.exists) o.delete();
      final.rename(old);
      movedOld = true;
    }
    tmp.rename(name);
  } catch (e) {
    safe(() => tmp.delete());
    if (movedOld) safe(() => new File(dir, old).rename(name));
    if (e instanceof SafetyError) throw e;
    throw new SafetyError(/ENOSPC|space/i.test(message(e)) ? 'space' : 'io', message(e));
  }
  if (movedOld) safe(() => new File(dir, old).delete());
}
