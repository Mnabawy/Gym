// التمرين · الأكل · المشتريات as one iOS segmented control at the top of each gym page (the bottom bar holds the
// sections). Same look as the tasks page's control: t.segBar track, t.segOn on the open one. No animation.
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { T } from './ui';
import { useTheme } from '../theme';

export type GymPage = 'workout' | 'food' | 'shop';

const PAGES: { key: GymPage; label: string; path: '/workout' | '/food' | '/shop' }[] = [
  { key: 'workout', label: 'التمرين', path: '/workout' },
  { key: 'food', label: 'الأكل', path: '/food' },
  { key: 'shop', label: 'المشتريات', path: '/shop' },
];

export function GymSwitch({ value }: { value: GymPage }) {
  const t = useTheme();
  return (
    <View style={[s.bar, { backgroundColor: t.segBar }]} accessibilityRole="tablist">
      {PAGES.map((p) => {
        const on = p.key === value;
        return (
          <Pressable
            key={p.key}
            onPress={() => (on ? null : router.navigate(p.path))}
            hitSlop={{ top: 6, bottom: 6 }}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={[s.item, on ? { backgroundColor: t.segOn, boxShadow: '0px 1px 3px rgba(0,0,0,0.12)' } : null]}>
            <T w={on ? 'semi' : 'medium'} style={{ fontSize: 14, color: on ? t.fg : t.mute }} numberOfLines={1}>
              {p.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', padding: 2, borderRadius: 9, gap: 2 },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', height: 32, borderRadius: 7 },
});
