import React from 'react';
import { LayoutAnimation, Pressable, ScrollView, StyleSheet, Text, TextProps, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { F, tint, useTheme } from '../theme';
import { TAG_INFO } from '../data/rules';
import type { Tag } from '../data/program';

export function T({ style, w = 'body', ...p }: TextProps & { w?: keyof typeof F }) {
  const t = useTheme();
  return <Text {...p} style={[{ color: t.fg, fontFamily: F[w], fontSize: 15 }, style]} />;
}

export function Screen({ title, sub, right, children, footer }: { title: string; sub?: string; right?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }) {
  const t = useTheme();
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.head}>
          <View style={{ flex: 1 }}>
            <T w="bold" style={{ fontSize: 24, lineHeight: 34 }}>{title}</T>
            {sub ? <T style={{ color: t.mute, fontSize: 13 }}>{sub}</T> : null}
          </View>
          {right}
        </View>
        {children}
      </ScrollView>
      {footer}
    </SafeAreaView>
  );
}

export function Card({ children, color, style }: { children: React.ReactNode; color?: string; style?: ViewStyle }) {
  const t = useTheme();
  return (
    <View
      style={[
        { backgroundColor: t.card, borderRadius: 14, borderWidth: 1, borderColor: t.line, overflow: 'hidden' },
        color ? { borderStartWidth: 5, borderStartColor: color } : null,
        style,
      ]}>
      {children}
    </View>
  );
}

export function TagBadge({ tag }: { tag: Tag }) {
  const t = useTheme();
  if (!tag) return null;
  const filled = tag === 'heavy';
  return (
    <View
      style={{
        borderRadius: 6,
        paddingHorizontal: 7,
        paddingVertical: 1,
        backgroundColor: filled ? t.ink : 'transparent',
        borderWidth: filled ? 0 : 1.5,
        borderColor: t.fg,
        borderStyle: tag === 'drop' ? 'dashed' : 'solid',
      }}>
      <T w="semi" style={{ fontSize: 12, color: filled ? t.onInk : t.fg }}>{TAG_INFO[tag].label}</T>
    </View>
  );
}

/** `short` is the one-letter name shown when the chip isn't selected; `details` is the color legend shown when it is. */
export type DayChip = { key: number; label: string; short: string; colors: string[]; details: { color?: string; label: string }[] };
export function DayChips({ days, value, today, onChange }: { days: DayChip[]; value: number; today: number; onChange: (k: number) => void }) {
  const t = useTheme();
  const pick = (k: number) => {
    if (k === value) return;
    LayoutAnimation.configureNext(LayoutAnimation.create(180, 'easeInEaseOut', 'opacity'));
    onChange(k);
  };
  return (
    <View style={s.chips}>
      {days.map((d) => {
        const on = d.key === value;
        const isToday = d.key === today;
        return (
          <Pressable
            key={d.key}
            accessibilityRole="button"
            accessibilityLabel={isToday ? `${d.label} · النهارده` : d.label}
            accessibilityState={{ selected: on }}
            hitSlop={2}
            onPress={() => pick(d.key)}
            style={[on ? s.chipOn : s.chipOff, { backgroundColor: on ? t.ink : t.card, borderColor: on ? t.ink : t.line }]}>
            {on ? (
              <>
                <View style={s.chipHead}>
                  <T w="bold" style={{ fontSize: 14, color: t.onInk, flexShrink: 1 }} numberOfLines={1} adjustsFontSizeToFit>{d.label}</T>
                  {isToday ? <View style={[s.todayDot, { backgroundColor: t.ok }]} /> : null}
                </View>
                {d.details.map((x, i) => (
                  <View key={i} style={s.legendRow}>
                    {x.color ? <View style={[s.legendDot, { backgroundColor: x.color }]} /> : null}
                    <T style={{ fontSize: 11, color: t.onInk, opacity: x.color ? 0.92 : 0.6, flexShrink: 1 }} numberOfLines={1} adjustsFontSizeToFit>{x.label}</T>
                  </View>
                ))}
              </>
            ) : (
              <>
                <T w="semi" style={{ fontSize: 15, lineHeight: 22, color: t.fg }}>{d.short}</T>
                <View style={[s.bar, { backgroundColor: t.soft }]}>
                  {d.colors.map((c, i) => (
                    <View key={i} style={{ flex: 1, backgroundColor: c }} />
                  ))}
                </View>
                {isToday ? <View style={[s.todayDot, s.todayCorner, { backgroundColor: t.ok }]} /> : null}
              </>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

export function Progress({ value, color, height = 6 }: { value: number; color?: string; height?: number }) {
  const t = useTheme();
  return (
    <View style={{ height, backgroundColor: t.soft, borderRadius: height / 2, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, height: '100%', backgroundColor: color ?? t.ok }} />
    </View>
  );
}

export function FoodChip({ label, color }: { label: string; color: string }) {
  return (
    <View style={{ backgroundColor: tint(color, 0.14), borderStartWidth: 3, borderStartColor: color, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
      <T style={{ fontSize: 13 }}>{label}</T>
    </View>
  );
}

export function Btn({ label, onPress, kind = 'ghost' }: { label: string; onPress: () => void; kind?: 'ghost' | 'solid' }) {
  const t = useTheme();
  const solid = kind === 'solid';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{ minHeight: 44, paddingHorizontal: 14, borderRadius: 10, justifyContent: 'center', alignItems: 'center', backgroundColor: solid ? t.ink : 'transparent', borderWidth: solid ? 0 : 1, borderColor: t.line }}>
      <T w="semi" style={{ fontSize: 14, color: solid ? t.onInk : t.mute }}>{label}</T>
    </Pressable>
  );
}

const s = StyleSheet.create({
  scroll: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 140, gap: 12, maxWidth: 620, width: '100%', alignSelf: 'center' },
  head: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  // Inactive chips are 40pt wide + 2pt hitSlop each side = 44pt touch target; the selected chip takes the rest.
  chips: { flexDirection: 'row', gap: 4, minHeight: 72 }, // fits name + 2 legend lines, so the row doesn't jump between days
  chipOff: { width: 40, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 6 },
  chipOn: { flex: 1, minWidth: 0, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, justifyContent: 'center', gap: 4 },
  chipHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  todayDot: { width: 6, height: 6, borderRadius: 3 },
  todayCorner: { position: 'absolute', top: 5, end: 5 },
  bar: { flexDirection: 'row', width: 20, height: 4, borderRadius: 2, overflow: 'hidden' },
});
