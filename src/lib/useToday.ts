import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { dateKey } from './logic';
import { msUntilMidnight } from './rollover';
import { useSettings } from './settings';

/** Today's date key. Updates when the app comes to the front and at the next midnight, so a screen left open overnight saves under the new day. The plan is re-applied on rollover so an ended light week stops halving sets. */
export function useToday(): string {
  const [today, setToday] = useState(dateKey());
  const last = useRef(today);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const check = () => {
      const now = dateKey();
      if (now !== last.current) {
        last.current = now;
        useSettings.getState().refreshPlan();
        setToday(now);
      }
    };
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { check(); arm(); }, msUntilMidnight() + 500);
    };
    arm();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') { check(); arm(); }
    });
    return () => { clearTimeout(timer); sub.remove(); };
  }, []);
  return today;
}
