// Small animation helpers. Everything respects the phone's "Reduce Motion" setting: values jump straight to the end.
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform } from 'react-native';

/** The native driver only exists on the phone (transform/opacity only). */
export const native = Platform.OS !== 'web';

export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((v) => live && setReduce(v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReduce);
    return () => {
      live = false;
      sub?.remove();
    };
  }, []);
  return reduce;
}

/** An Animated.Value that eases to `target` whenever it changes. `onNative` only for transform/opacity. */
export function useTween(target: number, duration = 280, onNative = false): Animated.Value {
  const reduce = useReducedMotion();
  const [v] = useState(() => new Animated.Value(target));
  useEffect(() => {
    if (reduce) {
      v.setValue(target);
      return;
    }
    const a = Animated.timing(v, { toValue: target, duration, easing: Easing.out(Easing.cubic), useNativeDriver: onNative && native });
    a.start();
    return () => a.stop();
  }, [target, duration, onNative, reduce, v]);
  return v;
}

/** A scale value that pops (shrinks a touch, springs back) each time `key` changes — not on first render. */
export function usePop(key: unknown, from = 0.86): Animated.Value {
  const reduce = useReducedMotion();
  const [v] = useState(() => new Animated.Value(1));
  const prev = useRef(key);
  useEffect(() => {
    if (prev.current === key) return;
    prev.current = key;
    if (reduce) return;
    v.setValue(from);
    const a = Animated.spring(v, { toValue: 1, friction: 4, tension: 170, useNativeDriver: native });
    a.start();
    return () => a.stop();
  }, [key, from, reduce, v]);
  return v;
}
