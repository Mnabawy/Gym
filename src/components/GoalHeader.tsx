// The header of a goal's page: round back and ••• buttons on a bar of their own, then the goal itself — its icon on
// a soft tile of its color, its name large, and one quiet line under it (its big goal, or «هدف كبير», or why).
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { T } from './ui';
import { parentOf, type Goal } from '../lib/goals';
import { readGoals } from '../lib/goalStore';
import { tint, useTheme } from '../theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function GoalHeader({ g, onMore }: { g: Goal; onMore: () => void }) {
  const t = useTheme();
  const u = g.umbrella ? null : parentOf(readGoals(), g);
  const round = (icon: IconName, label: string, onPress: () => void) => (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={6} style={({ pressed }) => [s.round, { backgroundColor: tint(t.fg, 0.06), opacity: pressed ? 0.5 : 1 }]}>
      <Ionicons name={icon} size={20} color={t.fg} />
    </Pressable>
  );
  return (
    <View style={s.wrap}>
      <View style={s.bar}>
        {round('chevron-forward', 'رجوع', () => router.back())}
        {round('ellipsis-horizontal', 'عدّل الهدف', onMore)}
      </View>
      <View style={s.head}>
        <View style={[s.icon, { backgroundColor: tint(g.color, 0.15) }]}>
          <Ionicons name={g.icon as IconName} size={26} color={g.color} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          {u ? (
            <Pressable onPress={() => router.push(`/goals/${u.id}`)} accessibilityRole="link" hitSlop={4} style={s.parent}>
              <T style={{ fontSize: 12.5, color: u.color }} numberOfLines={1}>{u.name}</T>
              <Ionicons name="chevron-back" size={12} color={u.color} />
            </Pressable>
          ) : g.umbrella ? (
            <T w="semi" style={{ fontSize: 12.5, color: g.color }}>هدف كبير</T>
          ) : null}
          <T w="bold" style={{ fontSize: 26, lineHeight: 34 }} numberOfLines={2}>{g.name}</T>
          {g.umbrella && g.why ? <T style={{ fontSize: 13, color: t.mute }} numberOfLines={1}>{g.why}</T> : null}
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 12, marginBottom: 6 },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  round: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 54, height: 54, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  parent: { flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-start' },
});
