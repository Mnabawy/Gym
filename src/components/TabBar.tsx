// The app's bottom tab bar (the sections): a rounded capsule floating over the page, icons only, no animation. The
// page scrolls under it and shows through its see-through background. The open tab is its filled icon in the app color
// on a soft pill of that color; the rest are grey outlines. Each tab keeps its name for screen readers.
// Pages make room for it with useTabBarSpace() in ./tabSpace (Screen does: scroll padding and footer).
import * as Haptics from 'expo-haptics';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSettings } from '../lib/settings';
import { tint, useTheme } from '../theme';
import { BAR_H, useBarBottom } from './tabSpace';
import { useKeyboardShown } from './ui';

const ICON = 24;

/** Pass as `tabBar` on the sections' `Tabs`. Each screen sets `title` (read aloud) and `tabBarIcon` (drawn in the color it's given). */
export function TabBar({ state, descriptors, emitter, navigateToTab }: BottomTabBarProps) {
  const t = useTheme();
  const haptics = useSettings((x) => x.haptics);
  const bottom = useBarBottom();
  const kb = useKeyboardShown();
  // With the keyboard up the bar steps aside (the page's own input sits right above the keyboard).
  if (kb) return null;
  const dark = t.fg === '#FFFFFF';
  return (
    <View
      role="tablist"
      style={[
        s.bar,
        {
          bottom,
          backgroundColor: tint(dark ? '#2C2C2E' : '#FFFFFF', dark ? 0.84 : 0.86),
          borderColor: tint(t.line, dark ? 0.6 : 0.45),
          boxShadow: dark ? '0px 8px 24px rgba(0, 0, 0, 0.5)' : '0px 8px 24px rgba(0, 0, 0, 0.12)',
        },
      ]}>
      {state.routes.map((route, i) => {
        const focused = i === state.index;
        const { options } = descriptors[route.key];
        const title = options.title ?? route.name;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityLabel={title}
            accessibilityState={{ selected: focused }}
            onPress={() => {
              const e = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (focused || e.defaultPrevented) return;
              if (haptics && Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
              navigateToTab(route.key);
            }}
            onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}
            style={s.tab}>
            <View style={[s.pill, focused ? { backgroundColor: tint(t.ok, dark ? 0.28 : 0.14) } : null]}>
              {options.tabBarIcon?.({ focused, color: focused ? t.okText : t.mute, size: ICON })}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    position: 'absolute',
    start: 20,
    end: 20,
    height: BAR_H,
    borderRadius: BAR_H / 2,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  tab: { flex: 1, height: BAR_H, alignItems: 'center', justifyContent: 'center' },
  pill: { width: 58, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
});
