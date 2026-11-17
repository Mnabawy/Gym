// Gym tab bar: the open tab is a dark pill with its icon and name (like the selected workout chip); the others show
// only their icon. Switching tabs springs the pill across: the old one shrinks back to an icon, the new one grows.
import * as Haptics from 'expo-haptics';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, View, type ColorValue } from 'react-native';
import Animated, { FadeIn, FadeOut, interpolate, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSettings } from '../lib/settings';
import { glow, useTheme, type Theme } from '../theme';
import { SPRING } from './Motion';
import { T } from './ui';

/** Pill height: a full 44pt touch target. */
const PILL = 44;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Icon = ((p: { focused: boolean; color: ColorValue; size: number }) => React.ReactNode) | undefined;

function Tab({ t, focused, title, icon, onPress, onLongPress }: { t: Theme; focused: boolean; title: string; icon: Icon; onPress: () => void; onLongPress: () => void }) {
  const p = useSharedValue(focused ? 1 : 0);
  const press = useSharedValue(1);
  useEffect(() => {
    p.set(withSpring(focused ? 1 : 0, SPRING));
  }, [focused, p]);

  // The open tab takes more of the row; the rest share what's left.
  const grow = useAnimatedStyle(() => ({ flexGrow: interpolate(p.value, [0, 1], [1, 2.6]), transform: [{ scale: press.value }] }));
  const pill = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ scaleX: interpolate(p.value, [0, 1], [0.55, 1]) }, { scaleY: interpolate(p.value, [0, 1], [0.8, 1]) }] }));
  const lift = useAnimatedStyle(() => ({ transform: [{ scale: interpolate(p.value, [0, 0.5, 1], [1, 1.12, 1]) }] }));

  return (
    <AnimatedPressable
      accessibilityRole="tab"
      accessibilityLabel={title}
      accessibilityState={{ selected: focused }}
      hitSlop={4}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => press.set(withSpring(0.94, SPRING))}
      onPressOut={() => press.set(withSpring(1, SPRING))}
      style={[s.tab, grow]}>
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          s.pill,
          { backgroundColor: t.ink },
          t.neon ? { borderWidth: 1, borderColor: t.ok, boxShadow: glow(t, t.ok, 12) } : null,
          pill,
        ]}
      />
      <Animated.View style={lift}>
        {icon?.({ focused, color: focused ? t.onInk : t.mute, size: 22 })}
      </Animated.View>
      {focused ? (
        <Animated.View entering={FadeIn.duration(200).delay(90)} exiting={FadeOut.duration(90)} style={s.labelBox}>
          <T w="semi" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ fontSize: 14, lineHeight: 22, color: t.onInk }}>
            {title}
          </T>
        </Animated.View>
      ) : null}
    </AnimatedPressable>
  );
}

/** Pass as `tabBar` on the gym `Tabs`. Each screen sets `title` and `tabBarIcon` (drawn white in the pill, grey outside it). */
export function TabBar({ state, descriptors, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const t = useTheme();
  const haptics = useSettings((x) => x.haptics);
  // Android draws edge to edge: the bar clears the system navigation bar itself. Phones with the gesture bar hidden
  // report no bottom inset, and their rounded corners would cut the outer tabs, so Android keeps 14pt.
  const bottom = Math.max(insets.bottom, Platform.OS === 'android' ? 14 : 8);
  return (
    <View role="tablist" style={[s.bar, { paddingBottom: bottom, backgroundColor: t.card, borderTopColor: t.line }]}>
      {state.routes.map((route, i) => {
        const focused = i === state.index;
        const { options } = descriptors[route.key];
        return (
          <Tab
            key={route.key}
            t={t}
            focused={focused}
            title={options.title ?? route.name}
            icon={options.tabBarIcon}
            onPress={() => {
              const e = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (focused || e.defaultPrevented) return;
              if (haptics && Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
              navigateToTab(route.key);
            }}
            onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}
          />
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', gap: 8, paddingTop: 8, paddingHorizontal: 12, borderTopWidth: StyleSheet.hairlineWidth },
  tab: { flexBasis: 0, height: PILL, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12 },
  pill: { borderRadius: PILL / 2 },
  labelBox: { flexShrink: 1 },
});
