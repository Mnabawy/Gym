// iOS-style swipe actions on a row or card. Hand-built on a pan gesture (react-native-gesture-handler v3 hooks +
// reanimated) instead of ReanimatedSwipeable: that one measures its action panels when the drag starts, which came
// out wrong on Android in RTL for the first swipe. Here the panels have a fixed width and sit at the row's edges.
// `start` actions sit under the start edge (right in RTL) and show when you drag the row toward the left; `end`
// actions sit under the end edge (left). Letting go past half the panel keeps it open; a long, full swipe runs the
// side's first action, like Mail. One row is open at a time; tapping the row closes it.
import React, { useRef } from 'react';
import { I18nManager, Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { GestureDetector, usePanGesture, useTapGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedReaction, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import Ionicons from '@expo/vector-icons/Ionicons';
import { T } from './ui';
import { tap } from '../lib/timer';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export type SwipeAction = {
  icon: IconName;
  label: string;
  /** Background of the action (iOS: red delete, green done, orange flag, blue/grey others). */
  color: string;
  onPress: () => void;
};

/** iOS system colors for actions (the same in light and dark, white text on top). */
export const ACTION = { red: '#FF3B30', green: '#34C759', orange: '#FF9500', blue: '#007AFF', purple: '#5856D6', grey: '#8E8E93', indigo: '#5E5CE6', teal: '#30B0C7' };

const W = 72; // one action's width
const FULL = 0.6; // share of the row's width past which letting go runs the first action
const SPRING = { damping: 24, stiffness: 300, mass: 0.8 };

// The page is RTL (forced on the phones; the web page is RTL too even though I18nManager says LTR there): the start
// edge is on the right, so revealing the start actions moves the row left (negative translateX).
const RTL = I18nManager.isRTL || Platform.OS === 'web';
const START_SIGN = RTL ? -1 : 1;

let closeOpen: (() => void) | null = null;
/** Remember the open row's close; closes the one open before it. */
function rememberOpen(close: () => void) {
  if (closeOpen && closeOpen !== close) closeOpen();
  closeOpen = close;
}
/** Starting to drag another row closes the open one. */
function closeOthers(close: () => void) {
  if (closeOpen && closeOpen !== close) {
    closeOpen();
    closeOpen = null;
  }
}

export function Swipe({ start, end, children, style, enabled = true }: { start?: SwipeAction[]; end?: SwipeAction[]; children: React.ReactNode; style?: StyleProp<ViewStyle>; enabled?: boolean }) {
  const nStart = start?.length ?? 0;
  const nEnd = end?.length ?? 0;
  const on = enabled && nStart + nEnd > 0;
  const x = useSharedValue(0); // the row's translateX
  const from = useSharedValue(0);
  const width = useSharedValue(0);
  const opened = useSharedValue(0); // 0 closed, else the open translateX
  const full = useRef(false);

  // Physical limits: start panel on one side, end panel on the other.
  const startW = nStart * W;
  const endW = nEnd * W;
  const minX = START_SIGN < 0 ? -startW : -endW; // most negative allowed when not full-swiping
  const maxX = START_SIGN < 0 ? endW : startW;
  const negActs = START_SIGN < 0 ? start : end; // actions shown when the row moves left (x < 0)
  const posActs = START_SIGN < 0 ? end : start;

  const close = () => {
    x.set(withSpring(0, SPRING));
    opened.set(0);
  };
  const setOpen = () => rememberOpen(close);
  const run = (side: 'neg' | 'pos') => {
    const a = (side === 'neg' ? negActs : posActs)?.[0];
    if (!a) return;
    a.onPress();
  };
  const onFull = (now: boolean) => {
    if (now !== full.current) {
      full.current = now;
      tap(); // a click under the finger when letting go will run the first action
    }
  };

  const pan = usePanGesture({
    enabled: on,
    activeOffsetX: [-12, 12],
    failOffsetY: [-10, 10],
    onActivate: () => {
      'worklet';
      from.value = x.value;
      scheduleOnRN(closeOthers, close);
    },
    onUpdate: (e) => {
      'worklet';
      let v = from.value + e.translationX;
      const lo = negActs?.length ? -Infinity : 0;
      const hi = posActs?.length ? Infinity : 0;
      v = Math.max(lo, Math.min(hi, v));
      // Rubber band past the panel, so a full swipe takes a deliberate pull.
      if (v < minX) v = minX + (v - minX) * 0.7;
      if (v > maxX) v = maxX + (v - maxX) * 0.7;
      x.value = v;
    },
    onDeactivate: (e) => {
      'worklet';
      const v = x.value;
      const w = width.value || 1;
      const fling = e.velocityX;
      if (v < 0 && negActs?.length) {
        if (-v > w * FULL) {
          x.value = withTiming(0, { duration: 220 });
          opened.value = 0;
          scheduleOnRN(run, 'neg');
        } else if (-v > (-minX) / 2 || fling < -600) {
          x.value = withSpring(minX, SPRING);
          opened.value = minX;
          scheduleOnRN(setOpen);
        } else {
          x.value = withSpring(0, SPRING);
          opened.value = 0;
        }
      } else if (v > 0 && posActs?.length) {
        if (v > w * FULL) {
          x.value = withTiming(0, { duration: 220 });
          opened.value = 0;
          scheduleOnRN(run, 'pos');
        } else if (v > maxX / 2 || fling > 600) {
          x.value = withSpring(maxX, SPRING);
          opened.value = maxX;
          scheduleOnRN(setOpen);
        } else {
          x.value = withSpring(0, SPRING);
          opened.value = 0;
        }
      } else {
        x.value = withSpring(0, SPRING);
        opened.value = 0;
      }
    },
  });
  // While a row is open, a tap on it just closes it (instead of opening/ticking what's under the finger).
  const tapClose = useTapGesture({
    enabled: on,
    onActivate: () => {
      'worklet';
      if (opened.value !== 0) {
        x.value = withSpring(0, SPRING);
        opened.value = 0;
      }
    },
  });

  useAnimatedReaction(
    () => width.value > 0 && Math.abs(x.value) > width.value * FULL,
    (now, prev) => {
      if (prev !== null && now !== prev) scheduleOnRN(onFull, now);
    },
  );

  const row = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }], pointerEvents: opened.value === 0 ? 'auto' : 'box-only' }));
  // Panels only show while the row is pulled their way (no sliver at rest).
  const negPanel = useAnimatedStyle(() => ({ opacity: x.value < -0.5 ? 1 : 0, width: Math.max(-x.value, 0) }));
  const posPanel = useAnimatedStyle(() => ({ opacity: x.value > 0.5 ? 1 : 0, width: Math.max(x.value, 0) }));

  if (!on) return <View style={style}>{children}</View>;

  const act = (a: SwipeAction) => () => {
    tap();
    close();
    setTimeout(a.onPress, 150); // let the row slide back first, so a removed row doesn't jump
  };
  // The layout is RTL everywhere (phones and web), so a row's flex-start is the physical right. Each panel covers
  // the row; its strip (as wide as the pull) sits at its physical edge, the first action outermost.
  const panel = (acts: SwipeAction[] | undefined, side: 'left' | 'right', st: ReturnType<typeof useAnimatedStyle>) =>
    acts?.length ? (
      <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { flexDirection: 'row', justifyContent: side === 'right' ? 'flex-start' : 'flex-end' }]}>
        <Animated.View style={[s.strip, { justifyContent: side === 'right' ? 'flex-start' : 'flex-end' }, st]}>
          {(side === 'right' ? acts : [...acts].reverse()).map((a) => (
            <Pressable key={a.label} onPress={act(a)} accessibilityRole="button" accessibilityLabel={a.label} style={({ pressed }) => [s.act, { backgroundColor: a.color, opacity: pressed ? 0.75 : 1 }, a === acts[0] ? { flexGrow: 1, minWidth: W } : { width: W }]}>
              <Ionicons name={a.icon} size={19} color="#FFFFFF" />
              <T w="medium" style={{ fontSize: 11.5, lineHeight: 15, color: '#FFFFFF' }} numberOfLines={1} adjustsFontSizeToFit>{a.label}</T>
            </Pressable>
          ))}
        </Animated.View>
      </View>
    ) : null;

  return (
    <View style={[s.wrap, style]} onLayout={(e) => width.set(e.nativeEvent.layout.width)}>
      {panel(posActs, 'left', posPanel)}
      {panel(negActs, 'right', negPanel)}
      <GestureDetector gesture={pan} touchAction="pan-y">
        <Animated.View style={row}>
          <GestureDetector gesture={tapClose} touchAction="pan-y">
            <View>{children}</View>
          </GestureDetector>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { overflow: 'hidden' },
  strip: { flexDirection: 'row', overflow: 'hidden', alignSelf: 'stretch' },
  act: { alignItems: 'center', justifyContent: 'center', gap: 1, paddingHorizontal: 4 },
});
