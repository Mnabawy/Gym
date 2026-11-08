// iOS-style swipe actions on any row or card (react-native-gesture-handler's ReanimatedSwipeable).
// `start` actions sit under the row's start edge (right in RTL) and show when you drag the row toward the end;
// `end` actions sit under the end edge (left in RTL). A long, full swipe runs the first action of that side, like Mail.
// Only one row stays open at a time; tapping an action runs it and closes the row.
import React, { useRef } from 'react';
import { Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { useAnimatedReaction, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
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

let openRow: SwipeableMethods | null = null;

export function Swipe({ start, end, children, style, enabled = true }: { start?: SwipeAction[]; end?: SwipeAction[]; children: React.ReactNode; style?: StyleProp<ViewStyle>; enabled?: boolean }) {
  const ref = useRef<SwipeableMethods>(null);
  const width = useRef(0);
  const last = useRef(0); // the drag distance when the finger lets go
  const full = useRef(false);
  const has = (a?: SwipeAction[]) => !!a && a.length > 0;
  if (!enabled || (!has(start) && !has(end))) return <View style={style}>{children}</View>;

  const close = () => ref.current?.close();
  const run = (a: SwipeAction) => {
    tap();
    close();
    // Let the row slide back first, so a removed row doesn't jump.
    setTimeout(a.onPress, 120);
  };
  // App is RTL: the start edge is on the right (gesture-handler's "right actions"), the end edge on the left. On the
  // web I18nManager says LTR while the page is RTL, so gesture-handler's sides come out mirrored there.
  const flip = Platform.OS === 'web';
  const R = flip ? end : start;
  const L = flip ? start : end;
  const rightSide = flip ? 'end' : 'start';
  const leftSide = flip ? 'start' : 'end';
  const onDrag = (v: number) => {
    last.current = v;
    const now = !!width.current && Math.abs(v) > width.current * FULL;
    if (now !== full.current) {
      full.current = now;
      tap(); // a click under the finger when a full swipe will run the first action
    }
  };
  const panel = (acts: SwipeAction[], side: 'start' | 'end') =>
    function Actions(_p: SharedValue<number>, drag: SharedValue<number>) {
      return <Panel acts={acts} side={side} drag={drag} onDrag={onDrag} onRun={run} />;
    };
  return (
    <View style={style} onLayout={(e) => (width.current = e.nativeEvent.layout.width)}>
      <ReanimatedSwipeable
        ref={ref}
        friction={1.6}
        overshootFriction={8}
        rightThreshold={W / 2}
        leftThreshold={W / 2}
        renderRightActions={has(R) ? panel(R!, rightSide) : undefined}
        renderLeftActions={has(L) ? panel(L!, leftSide) : undefined}
        overshootRight={has(R)}
        overshootLeft={has(L)}
        onSwipeableWillOpen={(dir) => {
          // dir 'left' = the panel on the right opened.
          const acts = dir === 'left' ? R : L;
          if (acts?.length && width.current && Math.abs(last.current) > width.current * FULL) run(acts[0]);
        }}
        onSwipeableOpen={() => {
          if (openRow && openRow !== ref.current) openRow.close();
          openRow = ref.current;
        }}
        onSwipeableClose={() => {
          if (openRow === ref.current) openRow = null;
        }}>
        {children}
      </ReanimatedSwipeable>
    </View>
  );
}

function Panel({ acts, side, drag, onDrag, onRun }: { acts: SwipeAction[]; side: 'start' | 'end'; drag: SharedValue<number>; onDrag: (v: number) => void; onRun: (a: SwipeAction) => void }) {
  const total = acts.length * W;
  useAnimatedReaction(
    () => drag.value,
    (v) => scheduleOnRN(onDrag, v),
  );
  // Hidden at rest, so no sliver of color peeks out at the row's edge (sub-pixel rounding).
  const shown = useAnimatedStyle(() => ({ opacity: Math.abs(drag.value) > 1 ? 1 : 0 }));
  return (
    <Animated.View style={[s.panel, { width: total, flexDirection: side === 'start' ? 'row' : 'row-reverse' }, shown]}>
      {acts.map((a) => (
        <View key={a.label} style={{ backgroundColor: a.color, width: W }}>
          <Pressable onPress={() => onRun(a)} accessibilityRole="button" accessibilityLabel={a.label} style={({ pressed }) => [s.act, { opacity: pressed ? 0.7 : 1 }]}>
            <Ionicons name={a.icon} size={19} color="#FFFFFF" />
            <T w="medium" style={{ fontSize: 11.5, lineHeight: 15, color: '#FFFFFF' }} numberOfLines={1} adjustsFontSizeToFit>{a.label}</T>
          </Pressable>
        </View>
      ))}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  panel: { alignSelf: 'stretch', overflow: 'visible' },
  act: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 1, paddingHorizontal: 4 },
});
