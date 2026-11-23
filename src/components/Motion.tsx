// iOS-style motion for lists and screens (react-native-reanimated layout animations). Reanimated follows the phone's
// "Reduce Motion" setting on its own (ReduceMotion.System): with it on, items just appear.
import React from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition, ZoomIn, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

/** Spring that settles like UIKit's default (no bounce to speak of). */
export const SPRING = { damping: 20, stiffness: 260, mass: 0.9 };

const enter = FadeInDown.duration(260);
const leave = FadeOut.duration(160);
const move = LinearTransition.springify().damping(SPRING.damping).stiffness(SPRING.stiffness);

/**
 * One item in a list: fades and slides in when it's added, fades out when it's removed, and the rest of the list
 * glides into place. `index` staggers the first appearance a little (capped, so long lists don't wait).
 */
export function Item({ children, style, index = 0 }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; index?: number }) {
  return (
    <Animated.View entering={enter.delay(Math.min(index, 8) * 28)} exiting={leave} layout={move} style={style}>
      {children}
    </Animated.View>
  );
}

/** A block that only fades in (page content, a section that opens). */
export function Fade({ children, style, delay = 0 }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; delay?: number }) {
  return (
    <Animated.View entering={FadeIn.duration(220).delay(delay)} exiting={leave} layout={move} style={style}>
      {children}
    </Animated.View>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Pressable that shrinks a little under your finger and springs back (cards, tiles, big buttons). */
export function Press({ style, scale = 0.97, onPressIn, onPressOut, ...p }: PressableProps & { style?: StyleProp<ViewStyle>; scale?: number }) {
  const s = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <AnimatedPressable
      {...p}
      onPressIn={(e) => {
        s.set(withSpring(scale, SPRING));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        s.set(withSpring(1, SPRING));
        onPressOut?.(e);
      }}
      style={[style, a]}
    />
  );
}

/** Wrap a number or a short label so it pops when it changes (counts, streaks). */
export function Pop({ value, children }: { value: unknown; children: React.ReactNode }) {
  return (
    <Animated.View key={String(value)} entering={ZoomIn.springify().damping(14)}>
      {children}
    </Animated.View>
  );
}
