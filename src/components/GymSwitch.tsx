// A row of pages as one iOS segmented control at the top of each page: الجيم's التمرين · الأكل · المشتريات.
// t.segBar track, t.segOn on the open one. No animation.
import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { T } from './ui';
import { useTheme } from '../theme';
import { useBarHidden } from './tabSpace';

export type GymPage = 'workout' | 'food' | 'shop';

const GYM: { key: GymPage; label: string; path: Href }[] = [
  { key: 'workout', label: 'التمرين', path: '/workout' },
  { key: 'food', label: 'الأكل', path: '/food' },
  { key: 'shop', label: 'المشتريات', path: '/shop' },
];

export const GymSwitch = ({ value }: { value: GymPage }) => <PageSwitch pages={GYM} value={value} />;

/** Generic segmented control: any short row of choices (`Segmented`) — the page switches above use it to navigate. */
function PageSwitch<K extends string>({ pages, value }: { pages: { key: K; label: string; path: Href }[]; value: K }) {
  return (
    <Segmented
      options={pages.map((p) => [p.key, p.label] as const)}
      value={value}
      onChange={(k) => {
        useBarHidden.getState().set(false);
        router.navigate(pages.find((p) => p.key === k)!.path);
      }}
    />
  );
}

/** iOS segmented control: a tap on the open segment does nothing. */
export function Segmented<K extends string | number>({ options, value, onChange, small }: { options: readonly (readonly [K, string])[]; value: K | null; onChange: (k: K) => void; small?: boolean }) {
  const t = useTheme();
  return (
    <View style={[s.bar, { backgroundColor: t.segBar }]} accessibilityRole="tablist">
      {options.map(([k, label]) => {
        const on = k === value;
        return (
          <Pressable
            key={String(k)}
            onPress={() => {
              if (!on) onChange(k);
            }}
            hitSlop={{ top: 6, bottom: 6 }}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={[s.item, small ? s.small : null, on ? { backgroundColor: t.segOn, boxShadow: '0px 1px 3px rgba(0,0,0,0.12)' } : null]}>
            <T w={on ? 'semi' : 'medium'} style={{ fontSize: small ? 13 : 14, color: on ? t.fg : t.mute }} numberOfLines={1}>
              {label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', padding: 2, borderRadius: 9, gap: 2 },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', height: 32, borderRadius: 7, paddingHorizontal: 6 },
  small: { height: 30, flex: 0, paddingHorizontal: 12 },
});
