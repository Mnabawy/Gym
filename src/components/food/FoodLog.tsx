// The food tab's log cards: food outside the plan, supplements, the color legend and the last days' adherence.
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Item } from '../Motion';
import { Card, Check, T } from '../ui';
import { ACTION, Swipe } from '../Swipe';
import { MEAL_ORDER, SUPPLEMENTS } from '../../data/nutrition';
import type { DayFood, Extra } from '../../lib/journal';
import { tint, useTheme } from '../../theme';
import { fs } from './styles';

export function ExtrasCard({ extras, onRemove, onAdd }: { extras: readonly Extra[]; onRemove: (i: number) => void; onAdd: () => void }) {
  const t = useTheme();
  return (
    <Card style={{ paddingHorizontal: 12, paddingVertical: 8, gap: 4, overflow: 'hidden' }}>
      <T w="bold" style={{ fontSize: 14 }}>أكل برة الخطة</T>
      {extras.map((x, i) => (
        <Item key={i}>
          <Swipe style={fs.swipeRow} end={[{ icon: 'trash', label: 'امسح', color: ACTION.red, onPress: () => onRemove(i) }]}>
            <View style={[fs.item, fs.rowPad, { minHeight: 44, backgroundColor: t.card }, i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line } : null]}>
              <T style={{ flex: 1, fontSize: 13.5 }} numberOfLines={1}>{x.name}</T>
              <T w="num" style={{ fontSize: 11.5, color: t.mute }}>{`${x.kcal} سعر · ${x.p} بروتين`}</T>
              <Pressable onPress={() => onRemove(i)} hitSlop={{ top: 14, bottom: 14, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel={`امسح ${x.name}`}>
                <Ionicons name="close" size={16} color={t.bad} />
              </Pressable>
            </View>
          </Swipe>
        </Item>
      ))}
      <Pressable onPress={onAdd} hitSlop={{ top: 4, bottom: 4 }} accessibilityRole="button" style={({ pressed }) => ({ minHeight: 36, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
        <T w="semi" style={{ fontSize: 13, color: t.okText }}>+ سجّل حاجة كلتها</T>
      </Pressable>
    </Card>
  );
}

/** Supplements to tick for the day; `isOn(name)` = ticked. */
export function SuppsCard({ isOn, onTick }: { isOn: (name: string) => boolean; onTick: (name: string, on: boolean) => void }) {
  const t = useTheme();
  return (
    <Card style={{ paddingHorizontal: 12, paddingVertical: 8, gap: 2, overflow: 'hidden' }}>
      <T w="bold" style={{ fontSize: 14 }}>المكملات</T>
      {SUPPLEMENTS.map((x) => {
        const on = isOn(x.name);
        return (
          <Swipe
            key={x.name}
            style={fs.swipeRow}
            start={[on ? { icon: 'arrow-undo', label: 'رجّعها', color: ACTION.grey, onPress: () => onTick(x.name, false) } : { icon: 'checkmark', label: 'خدتها', color: ACTION.green, onPress: () => onTick(x.name, true) }]}>
            <View style={[fs.item, fs.rowPad, { minHeight: 44, backgroundColor: t.card }]}>
              <View style={{ flex: 1 }}>
                <T style={{ fontSize: 13.5 }}>{x.name}</T>
                <T style={{ fontSize: 11, color: t.mute }} numberOfLines={1}>{x.dose}</T>
              </View>
              <Check compact on={on} label={`خدت ${x.name}`} onPress={() => onTick(x.name, !on)} />
            </View>
          </Swipe>
        );
      })}
    </Card>
  );
}

/** What the item dots' colors mean. */
export function FoodLegend() {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {[['بروتين', t.protein], ['كارب', t.carbs], ['دهون', t.fat], ['خضار', t.veg]].map(([l, c]) => (
        <View key={l} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c }} />
          <T style={{ color: t.mute, fontSize: 12 }}>{l}</T>
        </View>
      ))}
    </View>
  );
}

/** The last days: meals ticked as bars, a blue dot when the water goal was met, creatine days. */
export function AdherenceCard({ history, adh, today, waterGoalOn, waterDays, creatine, creatineDays }: {
  history: readonly DayFood[];
  adh: number | null;
  today: string;
  waterGoalOn: (date: string) => number;
  waterDays: number;
  creatine: string | undefined;
  creatineDays: number;
}) {
  const t = useTheme();
  return (
    <Card style={{ paddingVertical: 10, paddingHorizontal: 12, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <T w="bold" style={{ fontSize: 14, flex: 1 }}>{`التزامك آخر ${history.length} يوم`}</T>
        {adh != null ? <T w="numBold" style={{ fontSize: 14, color: adh >= 0.8 ? t.okText : t.warn }}>{`${Math.round(adh * 100)}%`}</T> : null}
      </View>
      <View style={{ flexDirection: 'row', gap: 3, height: 56, alignItems: 'flex-end' }}>
        {history.map((d) => {
          const f = Math.min(1, d.meals / MEAL_ORDER.length);
          const full = d.meals >= MEAL_ORDER.length;
          return (
            <View key={d.date} style={{ flex: 1, alignItems: 'center', gap: 3 }} accessible accessibilityLabel={`${d.date}: ${d.meals} من ${MEAL_ORDER.length} وجبات`}>
              <View style={{ width: '100%', maxWidth: 16, height: 36, borderRadius: 4, backgroundColor: t.soft, justifyContent: 'flex-end', overflow: 'hidden' }}>
                <View style={{ height: `${f * 100}%`, backgroundColor: full ? t.ok : tint(t.ok, 0.5) }} />
              </View>
              <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: d.water >= waterGoalOn(d.date) ? t.protein : 'transparent' }} />
              <T w="num" style={{ fontSize: 9, color: d.date === today ? t.fg : t.mute }}>{String(+d.date.slice(8))}</T>
            </View>
          );
        })}
      </View>
      <T style={{ fontSize: 11.5, color: t.mute }}>{`العمود = الوجبات اللي علّمت عليها · النقطة الزرقا = كمّلت المية (${waterDays} يوم)${creatine ? ` · ${creatine}: ${creatineDays} من ${history.length} يوم` : ''}`}</T>
    </Card>
  );
}
