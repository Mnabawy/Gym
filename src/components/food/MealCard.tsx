// One meal of the day on the food tab: swipe to tick or swap, its items with colored dots, its macros.
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Card, Check, T } from '../ui';
import { ACTION, Swipe } from '../Swipe';
import { FOODS, MEAL_TIME, type MealKey } from '../../data/nutrition';
import type { MealView } from '../../lib/foodView';
import { useTheme } from '../../theme';
import { fs, typeColor } from './styles';

export function MealCard({ m, on, canLog, isTraining, onTick, onSwap }: {
  m: MealView;
  /** Ticked as eaten (only on a day that can be logged). */
  on: boolean;
  canLog: boolean;
  isTraining: boolean;
  onTick: (meal: MealKey, on: boolean) => void;
  onSwap: (meal: MealKey) => void;
}) {
  const t = useTheme();
  return (
    <Swipe
      style={fs.swipeCard}
      start={canLog ? [on ? { icon: 'arrow-undo', label: 'رجّعها', color: ACTION.grey, onPress: () => onTick(m.meal, false) } : { icon: 'checkmark', label: 'أكلتها', color: ACTION.green, onPress: () => onTick(m.meal, true) }] : undefined}
      end={[{ icon: 'swap-horizontal', label: 'بدّل', color: ACTION.blue, onPress: () => onSwap(m.meal) }]}>
      {/* Page background under the card, so the faded (eaten) card still hides the actions. */}
      <View style={{ backgroundColor: t.bg }}>
        <Card style={{ paddingHorizontal: 12, paddingTop: 6, paddingBottom: 7, gap: 2, opacity: on ? 0.7 : 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {/* Full meal name (wraps if long), its time after it in small muted text. */}
            <T w="bold" style={{ flex: 1, fontSize: 14 }}>
              {`${m.meal} · ${m.name}  `}
              <T style={{ color: t.mute, fontSize: 11.5 }}>{isTraining ? MEAL_TIME[m.meal].training : MEAL_TIME[m.meal].rest}</T>
            </T>
            <Pressable
              onPress={() => onSwap(m.meal)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={`بدّل ${m.meal}`}
              style={({ pressed }) => [fs.swap, { backgroundColor: m.swapped ? t.warnSoft : t.soft, opacity: pressed ? 0.6 : 1 }]}>
              <Ionicons name="swap-horizontal" size={15} color={m.swapped ? t.warn : t.mute} />
            </Pressable>
            {canLog ? <Check compact on={on} label={`أكلت ${m.meal}`} onPress={() => onTick(m.meal, !on)} /> : null}
          </View>
          {/* The meal's items as a list: colored dot (protein / carbs / fat / veg), item, its calories. */}
          <View>
            {m.items.map((it, i) => (
              <View key={it} style={[fs.item, i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line } : null]}>
                <View style={[fs.dot, { backgroundColor: typeColor(t, FOODS[it]?.type ?? 'v') }]} />
                <T style={{ flex: 1, fontSize: 13 }} numberOfLines={1}>{it}</T>
                {FOODS[it] ? <T w="num" style={{ fontSize: 11.5, color: t.mute }}>{`${Math.round(FOODS[it].kcal)} سعر`}</T> : null}
              </View>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 1 }}>
            <T w="num" style={{ fontSize: 12 }}>{`${Math.round(m.mac.kcal)} سعر`}</T>
            <T w="num" style={{ fontSize: 12, color: t.protein }}>{`${Math.round(m.mac.p)} بروتين`}</T>
            <T w="num" style={{ fontSize: 12, color: t.carbsText }}>{`${Math.round(m.mac.c)} كارب`}</T>
            <T w="num" style={{ fontSize: 12, color: t.fat }}>{`${Math.round(m.mac.f)} دهون`}</T>
          </View>
        </Card>
      </View>
    </Swipe>
  );
}
