import { useMemo } from 'react';
import { analyze } from './gaps';
import { dateKey } from './logic';
import { storage } from './storage';
import { useDataVersion } from './bus';
import { SWAPS_KEY, swappedSet } from './journal';
import { readStrings } from './meta';

/** Gaps report for today, recomputed after every write. */
export function useReport() {
  const v = useDataVersion((s) => s.v);
  const today = dateKey();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => analyze(storage.allSets(), today, 6, swappedSet(readStrings(SWAPS_KEY))), [v, today]);
}
