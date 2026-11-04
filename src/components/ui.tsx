import React from 'react';
import { LayoutAnimation, Pressable, ScrollView, StyleSheet, Text, TextProps, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import Ionicons from '@expo/vector-icons/Ionicons';
import { F, tint, useTheme } from '../theme';
import { TAG_INFO } from '../data/rules';
import type { Tag } from '../data/program';

export function T({ style, w = 'body', ...p }: TextProps & { w?: keyof typeof F }) {
  const t = useTheme();
  return <Text {...p} style={[{ color: t.fg, fontFamily: F[w], fontSize: 15 }, style]} />;
}

export function Screen({ title, sub, children, footer, onBack }: { title: string; sub?: string; children: React.ReactNode; footer?: React.ReactNode; onBack?: () => void }) {
  const t = useTheme();
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={[s.head, onBack ? { paddingHorizontal: 52 } : null]}>
          {onBack ? (
            // RTL: back sits at the start (right) and points right.
            <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="رجوع" style={[s.back, { backgroundColor: t.card, boxShadow: t.shadow }]}>
              <Ionicons name="chevron-forward" size={22} color={t.fg} />
            </Pressable>
          ) : null}
          <T w="bold" style={{ fontSize: 19, lineHeight: 28, textAlign: 'center' }}>{title}</T>
          {sub ? <T style={{ color: t.mute, fontSize: 12.5, textAlign: 'center' }}>{sub}</T> : null}
        </View>
        {children}
      </ScrollView>
      {footer}
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const t = useTheme();
  return <View style={[{ backgroundColor: t.card, borderRadius: 16, boxShadow: t.shadow }, style]}>{children}</View>;
}

/** Small muted heading above a group of content. */
export function Label({ children, color }: { children: React.ReactNode; color?: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
      {color ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} /> : null}
      {/* flexGrow: on Android a shrink-wrapped Arabic label can measure a hair too narrow and lose its last word. */}
      <T w="medium" style={{ color: t.mute, fontSize: 13.5, flexGrow: 1, flexShrink: 1 }}>{children}</T>
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
        borderRadius: 999,
        paddingHorizontal: 9,
        paddingVertical: 1,
        backgroundColor: filled ? t.ink : 'transparent',
        borderWidth: filled ? 0 : 1.5,
        borderColor: t.ink,
        borderStyle: tag === 'drop' ? 'dashed' : 'solid',
      }}>
      <T w="semi" style={{ fontSize: 12, color: filled ? t.onInk : t.ink }}>{TAG_INFO[tag].label}</T>
    </View>
  );
}

/** Rounded pill: slate-navy when selected, soft grey otherwise. `color` adds a dot (muscle). */
export function Pill({ label, on, onPress, num, color }: { label: string; on: boolean; onPress: () => void; num?: boolean; color?: string }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      hitSlop={4}
      onPress={onPress}
      style={{ minHeight: 38, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, backgroundColor: on ? t.ink : t.soft }}>
      {color ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, borderWidth: on ? 1 : 0, borderColor: t.onInk }} /> : null}
      <T w={num ? 'num' : 'medium'} style={{ fontSize: 13, color: on ? t.onInk : t.fg }}>{label}</T>
    </Pressable>
  );
}

/** Tinted pill with a color dot (muscle or food type). */
export function ColorChip({ label, color, size = 13 }: { label: string; color: string; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: tint(color, 0.15), borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2 }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
      <T style={{ fontSize: size }}>{label}</T>
    </View>
  );
}
export const FoodChip = ColorChip;

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
            style={[on ? s.chipOn : s.chipOff, { backgroundColor: on ? t.ink : t.soft }]}>
            {on ? (
              <>
                <View style={s.chipHead}>
                  <T w="bold" style={{ fontSize: 14, color: t.onInk, flexShrink: 1 }} numberOfLines={1} adjustsFontSizeToFit>{d.label}</T>
                  {isToday ? <View style={[s.todayDot, { backgroundColor: t.ok, borderColor: t.onInk }]} /> : null}
                </View>
                {d.details.map((x, i) => (
                  <View key={i} style={s.legendRow}>
                    {x.color ? <View style={[s.legendDot, { backgroundColor: x.color }]} /> : null}
                    <T style={{ fontSize: 11, color: t.onInk, opacity: x.color ? 0.92 : 0.7, flexShrink: 1 }} numberOfLines={1} adjustsFontSizeToFit>{x.label}</T>
                  </View>
                ))}
              </>
            ) : (
              <>
                <T w="semi" style={{ fontSize: 15, lineHeight: 22, color: t.fg }}>{d.short}</T>
                <View style={[s.bar, { backgroundColor: t.line }]}>
                  {d.colors.map((c, i) => (
                    <View key={i} style={{ flex: 1, backgroundColor: c }} />
                  ))}
                </View>
                {isToday ? <View style={[s.todayDot, s.todayCorner, { backgroundColor: t.ok, borderColor: t.soft }]} /> : null}
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
      <View style={{ width: `${clamp01(value) * 100}%`, height: '100%', borderRadius: height / 2, backgroundColor: color ?? t.ok }} />
    </View>
  );
}

/** Circular progress; children render in the middle. */
export function Ring({ value, size = 60, stroke = 5, color, track, children }: { value: number; size?: number; stroke?: number; color?: string; track?: string; children?: React.ReactNode }) {
  const t = useTheme();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = clamp01(value);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track ?? t.soft} strokeWidth={stroke} fill="none" />
        {v > 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color ?? t.ok}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${c} ${c}`}
            strokeDashoffset={c * (1 - v)}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </Svg>
      {children}
    </View>
  );
}

export function Btn({ label, onPress, kind = 'ghost', style }: { label: string; onPress: () => void; kind?: 'ghost' | 'solid'; style?: ViewStyle }) {
  const t = useTheme();
  const solid = kind === 'solid';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        { minHeight: 48, paddingHorizontal: 18, borderRadius: 12, justifyContent: 'center', alignItems: 'center', opacity: pressed ? 0.8 : 1 },
        solid ? { backgroundColor: t.ok } : { borderWidth: 1.5, borderColor: t.ink },
        style,
      ]}>
      <T w="bold" style={{ fontSize: 15, color: solid ? '#FFFFFF' : t.ink }}>{label}</T>
    </Pressable>
  );
}

/** Check button used for sets and meals. */
export function Check({ on, onPress, label }: { on: boolean; onPress: () => void; label: string }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      style={{ width: 48, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.ok : t.soft }}>
      <T w="bold" style={{ color: on ? '#FFFFFF' : t.mute, fontSize: 18 }}>✓</T>
    </Pressable>
  );
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

const s = StyleSheet.create({
  scroll: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 140, gap: 12, maxWidth: 620, width: '100%', alignSelf: 'center' },
  head: { alignItems: 'center', justifyContent: 'center', paddingBottom: 4, minHeight: 44 },
  back: { position: 'absolute', start: 0, top: 0, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  // Inactive chips are 40pt wide + 2pt hitSlop each side = 44pt touch target; the selected chip takes the rest.
  chips: { flexDirection: 'row', gap: 4, minHeight: 72 }, // fits name + 2 legend lines, so the row doesn't jump between days
  chipOff: { width: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 6 },
  chipOn: { flex: 1, minWidth: 0, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 8, justifyContent: 'center', gap: 4 },
  chipHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  todayDot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1.5 },
  todayCorner: { position: 'absolute', top: 5, end: 5 },
  bar: { flexDirection: 'row', width: 20, height: 4, borderRadius: 2, overflow: 'hidden' },
});
