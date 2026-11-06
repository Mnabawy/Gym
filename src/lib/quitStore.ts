// Reading and writing quits in storage meta (src/lib/quit.ts), with a data-version bump so screens re-read.
import { useDataVersion } from './bus';
import { parseQuits, QUITS_KEY, type Quit, type Slip, type Urge } from './quit';
import { storage } from './storage';

export const readQuits = () => parseQuits(storage.getMeta(QUITS_KEY));

export function saveQuit(q: Quit) {
  const list = readQuits();
  const i = list.findIndex((x) => x.id === q.id);
  if (i >= 0) list[i] = q;
  else list.push(q);
  storage.setMeta(QUITS_KEY, JSON.stringify(list));
  useDataVersion.getState().bump();
}

export function deleteQuit(id: string) {
  storage.setMeta(QUITS_KEY, JSON.stringify(readQuits().filter((q) => q.id !== id)));
  useDataVersion.getState().bump();
}

export function addSlip(q: Quit, s: Slip) {
  saveQuit({ ...q, slips: [...q.slips, s].sort((a, b) => a.at - b.at) });
}

export function addUrge(q: Quit, u: Urge) {
  saveQuit({ ...q, urges: [...q.urges, u].sort((a, b) => a.at - b.at) });
}
