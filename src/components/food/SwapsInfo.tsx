// The food tab's folded info: swap groups (any item for another in its group) and the supplements with their notes.
import React from 'react';
import { View } from 'react-native';
import { Card, T } from '../ui';
import { SUPPLEMENTS, SWAPS } from '../../data/nutrition';
import { useTheme } from '../../theme';

export function SwapsInfo() {
  const t = useTheme();
  return (
    <>
      {SWAPS.map((g, gi) => {
        const c = [t.protein, t.carbs, t.fat][gi];
        return (
          <Card key={g.title} style={{ paddingHorizontal: 12, paddingVertical: 8, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c }} />
              <T w="bold">{`${g.title} · ${g.unit}`}</T>
            </View>
            <T style={{ color: t.mute, fontSize: 12 }}>أي صنف هنا ينفع مكان أي صنف تاني في نفس المجموعة</T>
            {g.items.map((x) => (
              <T key={x} style={{ fontSize: 13.5 }}>{`• ${x}`}</T>
            ))}
          </Card>
        );
      })}
      <Card style={{ paddingHorizontal: 12, paddingVertical: 8, gap: 6 }}>
        <T w="bold">المكملات</T>
        {SUPPLEMENTS.map((s) => (
          <View key={s.name}>
            <T w="semi" style={{ fontSize: 14 }}>{s.name}</T>
            <T style={{ fontSize: 13 }}>{s.dose}</T>
            <T style={{ color: t.mute, fontSize: 12 }}>{s.note}</T>
          </View>
        ))}
      </Card>
    </>
  );
}
