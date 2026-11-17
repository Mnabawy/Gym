// The app's bottom tab bar (the sections): classic iOS look, no animation. Each tab is its icon with the name under
// it; the open tab is the app color with a filled icon, the rest grey outlines. Plain card-colored bar, hairline on top.
import * as Haptics from 'expo-haptics';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSettings } from '../lib/settings';
import { font, useTheme } from '../theme';

const ICON = 24;

/** Pass as `tabBar` on the sections' `Tabs`. Each screen sets `title` and `tabBarIcon` (drawn in the color it's given). */
export function TabBar({ state, descriptors, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const t = useTheme();
  const haptics = useSettings((x) => x.haptics);
  // Android draws edge to edge: the bar clears the system navigation bar itself. Phones with the gesture bar hidden
  // report no bottom inset, and their rounded corners would cut the outer tabs, so Android keeps 12pt.
  const bottom = Math.max(insets.bottom, Platform.OS === 'android' ? 12 : 8);
  return (
    <View role="tablist" style={[s.bar, { paddingBottom: bottom, backgroundColor: t.card, borderTopColor: t.line }]}>
      {state.routes.map((route, i) => {
        const focused = i === state.index;
        const { options } = descriptors[route.key];
        const color = focused ? t.okText : t.mute;
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
            {options.tabBarIcon?.({ focused, color, size: ICON })}
            {/* Line height leaves room for Arabic glyphs, which otherwise get clipped; shrinks to fit on narrow phones. */}
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
              maxFontSizeMultiplier={1.2}
              style={[s.label, font(focused ? 'semi' : 'medium'), { color }]}>
              {title}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', paddingTop: 6, paddingHorizontal: 4, borderTopWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, minHeight: 50, alignItems: 'center', justifyContent: 'center', gap: 2 },
  label: { fontSize: 11, lineHeight: 17, textAlign: 'center', paddingHorizontal: 2 },
});
