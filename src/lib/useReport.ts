import { useMemo } from 'react';
import { analyze } from './gaps';
import { dateKey } from './logic';
import { storage } from './storage';
import { useDataVersion } from './bus';

/** Gaps report for today, recomputed after every write. */
export function useReport() {
  const v = useDataVersion((s) => s.v);
  const today = dateKey();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => analyze(storage.allSets(), today), [v, today]);
}
