// The food tab's top: daily target tiles, the day's summary card and the water card.
import React from 'react';
import { Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Card, Progress, Ring, T } from '../ui';
import { CUP_ML } from '../../lib/journal';
import { l1, waterLeftCups, type KcalP } from '../../lib/foodView';
import { tint, useTheme } from '../../theme';
import { fs } from './styles';

export type Goal = { kcal: number; protein: number; carbs: number; fat: number; mine: boolean };

export function MacroTiles({ goal }: { goal: Goal }) {
  const t = useTheme();
  const tiles = [
    { v: goal.kcal.toLocaleString('en-US'), u: 'سعر', l: goal.mine ? 'احتياجك' : 'في اليوم', c: t.ink, solid: true },
    { v: goal.protein, u: 'جم', l: 'بروتين', c: t.protein },
    { v: goal.carbs, u: 'جم', l: 'كارب', c: t.carbs },
    { v: goal.fat, u: 'جم', l: 'دهون', c: t.fat },
  ];
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {tiles.map((x, i) => (
        <View key={i} style={{ flex: 1, minWidth: 0, borderRadius: 12, paddingVertical: 6, paddingHorizontal: 9, backgroundColor: x.solid ? t.ink : tint(x.c, 0.15) }}>
          <T w="numBold" style={{ fontSize: 15, color: x.solid ? t.onInk : t.fg }} numberOfLines={1}>{String(x.v)}</T>
          <T style={{ fontSize: 11, color: x.solid ? t.onInk : t.mute }}>{`${x.u} · ${x.l}`}</T>
        </View>
      ))}
    </View>
  );
}

/** The picked day: calories ring, the plan's total, training/rest (a switch today before you log), what you ate. */
export function DayCard({ dayName, goal, total, eaten, canLog, isTraining, canSwitch, onSwitch }: {
  dayName: string;
  goal: Goal;
  total: KcalP;
  eaten: KcalP;
  canLog: boolean;
  isTraining: boolean;
  canSwitch: boolean;
  onSwitch: () => void;
}) {
  const t = useTheme();
  return (
    <Card style={{ paddingVertical: 8, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Ring value={canLog ? Math.min(1, eaten.kcal / goal.kcal) : 0} size={46} stroke={4}>
        <T w="numBold" style={{ fontSize: 12, color: canLog ? t.okText : t.mute }}>{canLog ? `${Math.round((eaten.kcal / goal.kcal) * 100)}%` : '–'}</T>
      </Ring>
      <View style={{ flex: 1, gap: 1 }}>
        <T style={{ color: t.mute, fontSize: 12.5 }}>{`أكل اليوم ${Math.round(total.kcal)} سعر · ${Math.round(total.p)} جم بروتين`}</T>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <T w="bold" style={{ fontSize: 16 }}>{dayName}</T>
          {canSwitch ? (
            <Pressable
              onPress={onSwitch}
              hitSlop={10}
              accessibilityRole="switch"
              accessibilityState={{ checked: isTraining }}
              accessibilityLabel={isTraining ? 'النهارده يوم تمرين، دوس تخليه يوم راحة' : 'النهارده يوم راحة، دوس تخليه يوم تمرين'}
              style={({ pressed }) => [fs.pill, { backgroundColor: isTraining ? t.okSoft : t.soft, opacity: pressed ? 0.7 : 1 }]}>
              <T w="semi" style={{ fontSize: 12, color: isTraining ? t.okText : t.mute }}>{isTraining ? 'يوم تمرين' : 'يوم راحة'}</T>
              <Ionicons name="swap-horizontal" size={12} color={isTraining ? t.okText : t.mute} />
            </Pressable>
          ) : (
            <T w="semi" style={{ fontSize: 12, color: isTraining ? t.okText : t.mute }}>{isTraining ? 'يوم تمرين' : 'يوم راحة'}</T>
          )}
        </View>
        <T style={{ color: t.mute, fontSize: 12 }}>
          {canLog ? `كلت ${Math.round(eaten.kcal)} من ${goal.kcal.toLocaleString('en-US')} سعر · ${Math.round(eaten.p)} من ${goal.protein} جم بروتين` : 'اليوم ده لسه مجاش. تقدر تعلّم على النهارده والأيام اللي فاتت.'}
        </T>
      </View>
    </Card>
  );
}

/** Water: cups of 250 ml against the day's goal. */
export function WaterCard({ ml, goal, onAdd }: { ml: number; goal: number; onAdd: (ml: number) => void }) {
  const t = useTheme();
  return (
    <Card style={{ paddingVertical: 8, paddingHorizontal: 12, gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="water-outline" size={18} color={t.protein} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <T w="semi" style={{ fontSize: 13.5 }}>{`المية · \u2066${l1(ml)}\u2069 من \u2066${l1(goal)}\u2069 لتر`}</T>
          <T style={{ fontSize: 11.5, color: t.mute }}>{ml >= goal ? 'كمّلت المية ✓' : `فاضل ${waterLeftCups(ml, goal)} كوباية`}</T>
        </View>
        <Pressable onPress={() => onAdd(-CUP_ML)} disabled={!ml} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }} accessibilityRole="button" accessibilityLabel="شيل كوباية" style={({ pressed }) => [fs.wbtn, { backgroundColor: t.soft, opacity: !ml ? 0.35 : pressed ? 0.7 : 1 }]}>
          <Ionicons name="remove" size={18} color={t.fg} />
        </Pressable>
        <Pressable onPress={() => onAdd(CUP_ML)} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }} accessibilityRole="button" accessibilityLabel="زوّد كوباية مية" style={({ pressed }) => [fs.wadd, { backgroundColor: tint(t.protein, 0.15), opacity: pressed ? 0.7 : 1 }]}>
          <T w="semi" style={{ fontSize: 12.5, color: t.protein }} numberOfLines={1}>+ كوباية</T>
        </Pressable>
      </View>
      <Progress value={ml / goal} color={t.protein} height={6} />
    </Card>
  );
}
