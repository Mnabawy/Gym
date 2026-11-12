import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { T } from './ui';
import { MONTHS_AR } from '../data/program';
import { addMonths, monthGrid, WEEK_START } from '../lib/tasks';
import { tint, useTheme } from '../theme';

/** One letter per weekday, by `Date.getDay()` (0 = Sunday). */
const SHORT = ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'];
const HEAD = Array.from({ length: 7 }, (_, i) => SHORT[(WEEK_START + i) % 7]);

/**
 * A month calendar (week from Saturday, right to left): arrows for the month, today ringed, the picked day filled,
 * and up to three dots under days that have tasks (`marks`: day → count).
 */
export function MonthCalendar({ value, onPick, today, marks, color }: { value: string | null; onPick: (date: string) => void; today: string; marks?: Record<string, number>; color?: string }) {
  const t = useTheme();
  const c = color ?? t.ok;
  const [ym, setYm] = useState((value ?? today).slice(0, 7));
  const weeks = monthGrid(ym);
  const thisMonth = ym === today.slice(0, 7);
  return (
    <View style={{ gap: 6 }}>
      <View style={s.head}>
        <Pressable onPress={() => setYm(addMonths(ym, -1))} hitSlop={8} accessibilityRole="button" accessibilityLabel="الشهر اللي فات" style={s.arrow}>
          <Ionicons name="chevron-forward" size={20} color={t.fg} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <T w="bold" style={{ fontSize: 16 }}>{`${MONTHS_AR[+ym.slice(5) - 1]} ${ym.slice(0, 4)}`}</T>
        </View>
        {!thisMonth ? (
          <Pressable onPress={() => setYm(today.slice(0, 7))} hitSlop={6} accessibilityRole="button" style={[s.todayBtn, { backgroundColor: t.soft }]}>
            <T w="semi" style={{ fontSize: 12 }}>الشهر ده</T>
          </Pressable>
        ) : null}
        <Pressable onPress={() => setYm(addMonths(ym, 1))} hitSlop={8} accessibilityRole="button" accessibilityLabel="الشهر الجاي" style={s.arrow}>
          <Ionicons name="chevron-back" size={20} color={t.fg} />
        </Pressable>
      </View>
      <View style={s.row}>
        {HEAD.map((d) => (
          <View key={d} style={s.cell}>
            <T style={{ fontSize: 12, color: t.mute }}>{d}</T>
          </View>
        ))}
      </View>
      {weeks.map((w, i) => (
        <View key={i} style={s.row}>
          {w.map((d, j) => {
            if (!d) return <View key={j} style={s.cell} />;
            const on = d === value;
            const isToday = d === today;
            const n = marks?.[d] ?? 0;
            const past = d < today;
            return (
              <Pressable key={d} onPress={() => onPick(d)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${+d.slice(8)} ${MONTHS_AR[+d.slice(5, 7) - 1]}${n ? `، ${n} مهام` : ''}`} style={s.cell}>
                {({ pressed }) => (
                  <View style={[s.day, { backgroundColor: on ? c : pressed ? t.soft : 'transparent', borderColor: isToday && !on ? c : 'transparent' }]}>
                    <T w={on || isToday ? 'numBold' : 'num'} style={{ fontSize: 15, color: on ? t.onOk : past ? t.mute : t.fg }}>{String(+d.slice(8))}</T>
                    <View style={s.dots}>
                      {Array.from({ length: Math.min(3, n) }, (_, k) => <View key={k} style={[s.dot, { backgroundColor: on ? t.onOk : tint(c, 0.85) }]} />)}
                    </View>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  arrow: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  todayBtn: { height: 30, borderRadius: 15, paddingHorizontal: 10, justifyContent: 'center' },
  row: { flexDirection: 'row' },
  cell: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 30 },
  day: { width: 42, height: 46, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', paddingTop: 2 },
  dots: { flexDirection: 'row', gap: 2, height: 5, marginTop: 1 },
  dot: { width: 4, height: 4, borderRadius: 2 },
});

/**
 * The same month, picking a stretch of days: the first tap is the start, the second the end (tapping before the
 * start swaps them), a third starts over. The days between are tinted, both ends filled; `marks` dots as above.
 */
export function RangeCalendar({ from, to, onChange, today, marks, color }: { from: string | null; to: string | null; onChange: (from: string | null, to: string | null) => void; today: string; marks?: Record<string, number>; color?: string }) {
  const t = useTheme();
  const c = color ?? t.ok;
  const [ym, setYm] = useState((from ?? today).slice(0, 7));
  const weeks = monthGrid(ym);
  const thisMonth = ym === today.slice(0, 7);
  const pick = (d: string) => {
    if (!from || to) onChange(d, null);
    else if (d < from) onChange(d, from);
    else onChange(from, d);
  };
  return (
    <View style={{ gap: 6 }}>
      <View style={s.head}>
        <Pressable onPress={() => setYm(addMonths(ym, -1))} hitSlop={8} accessibilityRole="button" accessibilityLabel="الشهر اللي فات" style={s.arrow}>
          <Ionicons name="chevron-forward" size={20} color={t.fg} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <T w="bold" style={{ fontSize: 16 }}>{`${MONTHS_AR[+ym.slice(5) - 1]} ${ym.slice(0, 4)}`}</T>
        </View>
        {!thisMonth ? (
          <Pressable onPress={() => setYm(today.slice(0, 7))} hitSlop={6} accessibilityRole="button" style={[s.todayBtn, { backgroundColor: t.soft }]}>
            <T w="semi" style={{ fontSize: 12 }}>الشهر ده</T>
          </Pressable>
        ) : null}
        <Pressable onPress={() => setYm(addMonths(ym, 1))} hitSlop={8} accessibilityRole="button" accessibilityLabel="الشهر الجاي" style={s.arrow}>
          <Ionicons name="chevron-back" size={20} color={t.fg} />
        </Pressable>
      </View>
      <View style={s.row}>
        {HEAD.map((d) => (
          <View key={d} style={s.cell}>
            <T style={{ fontSize: 12, color: t.mute }}>{d}</T>
          </View>
        ))}
      </View>
      {weeks.map((w, i) => (
        <View key={i} style={s.row}>
          {w.map((d, j) => {
            if (!d) return <View key={j} style={s.cell} />;
            const end = d === from || d === to;
            const inside = !!from && !!to && d > from && d < to;
            const isToday = d === today;
            const n = marks?.[d] ?? 0;
            return (
              <Pressable key={d} onPress={() => pick(d)} accessibilityRole="button" accessibilityState={{ selected: end || inside }} accessibilityLabel={`${+d.slice(8)} ${MONTHS_AR[+d.slice(5, 7) - 1]}${d === from ? '، أول الفترة' : d === to ? '، آخر الفترة' : ''}${n ? `، ${n} خطوات` : ''}`} style={[s.cell, inside ? { backgroundColor: tint(c, 0.14) } : null]}>
                {({ pressed }) => (
                  <View style={[s.day, { backgroundColor: end ? c : pressed ? t.soft : 'transparent', borderColor: isToday && !end ? c : 'transparent' }]}>
                    <T w={end || isToday ? 'numBold' : 'num'} style={{ fontSize: 15, color: end ? t.onOk : d < today ? t.mute : t.fg }}>{String(+d.slice(8))}</T>
                    <View style={s.dots}>
                      {Array.from({ length: Math.min(3, n) }, (_, k) => <View key={k} style={[s.dot, { backgroundColor: end ? t.onOk : tint(c, 0.85) }]} />)}
                    </View>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
