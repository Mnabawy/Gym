// The current time (ms) as state, refreshed every `every` ms — for live counters.
import { useEffect, useState } from 'react';

const clock = () => Date.now();

export function useNow(every: number): number {
  const [now, setNow] = useState(clock);
  useEffect(() => {
    const id = setInterval(() => setNow(clock()), every);
    return () => clearInterval(id);
  }, [every]);
  return now;
}
