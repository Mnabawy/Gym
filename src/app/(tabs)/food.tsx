import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { FOODS, MEAL_ORDER, MEAL_TIME, MEALS, SUPPLEMENTS, SWAPS, TARGETS, WEEK_MENU } from '../../data/nutrition';
import { Btn, Card, DayChips, FoodChip, Progress, Screen, T } from '../../components/ui';
import { dateKey, mealMacros } from '../../lib/logic';
import { storage } from '../../lib/storage';
import { useDataVersion } from '../../lib/bus';
import { useTheme, type Theme } from '../../theme';

const typeColor = (t: Theme, ty: string) => (ty === 'p' ? t.protein : ty === 'c' ? t.carbs : ty === 'f' ? t.fat : t.veg);

export default function Food() {
  const t = useTheme();
  const now = new Date();
  const today = now.getDay();
  const date = dateKey(now);
  const [sel, setSel] = useState(today);
  const [showSwaps, setShowSwaps] = useState(false);
  const { bump } = useDataVersion();
  const day = WEEK_MENU.find((d) => d.weekday === sel)!;
  const isToday = sel === today;

  const checks = new Set(storage.mealChecks(date)); // re-read when v changes
  const meals = MEAL_ORDER.map((m) => {
    const opt = MEALS.find((x) => x.meal === m)!.options[day.picks[m]];
    return { meal: m, ...opt, mac: mealMacros(opt.items) };
  });
  const total = meals.reduce((a, m) => ({ kcal: a.kcal + m.mac.kcal, p: a.p + m.mac.p }), { kcal: 0, p: 0 });
  const eaten = meals.filter((m) => isToday && checks.has(m.meal)).reduce((a, m) => ({ kcal: a.kcal + m.mac.kcal, p: a.p + m.mac.p }), { kcal: 0, p: 0 });

  const order = [6, 0, 1, 2, 3, 4, 5]; // Sat → Fri
  const chips = order.map((wd) => {
    const d = WEEK_MENU.find((x) => x.weekday === wd)!;
    return { key: wd, label: d.day, colors: [d.training ? t.ok : t.line] };
  });

  const tiles = [
    { v: TARGETS.kcal.toLocaleString('en-US'), u: 'سعر', l: 'في اليوم', c: t.ink, solid: true },
    { v: TARGETS.protein, u: 'جم', l: 'بروتين', c: t.protein },
    { v: TARGETS.carbs, u: 'جم', l: 'كارب', c: t.carbs },
    { v: TARGETS.fat, u: 'جم', l: 'دهون', c: t.fat },
  ];

  return (
    <Screen title="الأكل" sub="183 سم · 82 كجم · زيادة عضل">
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {tiles.map((x, i) => (
          <View key={i} style={{ flex: 1, minWidth: 0, borderRadius: 10, padding: 8, backgroundColor: x.solid ? t.ink : x.c + '22', borderTopWidth: 3, borderTopColor: x.c }}>
            <T w="numBold" style={{ fontSize: 17, color: x.solid ? t.onInk : t.fg }} numberOfLines={1}>{String(x.v)}</T>
            <T style={{ fontSize: 11, color: x.solid ? t.onInk : t.mute }}>{`${x.u} · ${x.l}`}</T>
          </View>
        ))}
      </View>

      <DayChips days={chips} value={sel} today={today} onChange={setSel} />

      <Card style={{ padding: 12, gap: 6 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <T w="bold">{`${day.day} · ${day.training ? 'يوم تمرين' : 'يوم راحة'}`}</T>
          <T w="numRegular" style={{ color: t.mute, fontSize: 13 }}>{`${Math.round(total.kcal)} سعر · ${Math.round(total.p)} جم بروتين`}</T>
        </View>
        {isToday ? (
          <>
            <T style={{ color: t.mute, fontSize: 12 }}>{`كلت لحد دلوقتي: ${Math.round(eaten.kcal)} سعر · ${Math.round(eaten.p)} جم بروتين`}</T>
            <Progress value={eaten.kcal / total.kcal} />
          </>
        ) : (
          <T style={{ color: t.mute, fontSize: 12 }}>التعليم على الوجبات بيشتغل في يوم النهارده بس.</T>
        )}
      </Card>

      {meals.map((m) => {
        const on = isToday && checks.has(m.meal);
        return (
          <Card key={m.meal} style={{ padding: 12, gap: 8, opacity: on ? 0.7 : 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <T w="bold" style={{ fontSize: 16 }}>{`${m.meal} · ${m.name}`}</T>
                <T style={{ color: t.mute, fontSize: 12 }}>{day.training ? MEAL_TIME[m.meal].training : MEAL_TIME[m.meal].rest}</T>
              </View>
              {isToday ? (
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`أكلت ${m.meal}`}
                  onPress={() => { storage.setMealCheck(date, m.meal, !on); bump(); }}
                  style={{ width: 48, height: 44, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.ok : t.card, borderColor: on ? t.ok : t.line }}>
                  <T w="bold" style={{ color: on ? '#fff' : t.mute, fontSize: 18 }}>✓</T>
                </Pressable>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
              {m.items.map((it) => (
                <FoodChip key={it} label={it} color={typeColor(t, FOODS[it]?.type ?? 'v')} />
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 14 }}>
              <T w="num" style={{ fontSize: 12.5 }}>{`${Math.round(m.mac.kcal)} سعر`}</T>
              <T w="num" style={{ fontSize: 12.5, color: t.protein }}>{`${Math.round(m.mac.p)} بروتين`}</T>
              <T w="num" style={{ fontSize: 12.5, color: t.carbsText }}>{`${Math.round(m.mac.c)} كارب`}</T>
              <T w="num" style={{ fontSize: 12.5, color: t.fat }}>{`${Math.round(m.mac.f)} دهون`}</T>
            </View>
          </Card>
        );
      })}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {[['بروتين', t.protein], ['كارب', t.carbs], ['دهون', t.fat], ['خضار', t.veg]].map(([l, c]) => (
          <View key={l} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: c }} />
            <T style={{ color: t.mute, fontSize: 12 }}>{l}</T>
          </View>
        ))}
      </View>

      <Btn label={showSwaps ? 'اخفي البدائل والمكملات' : 'البدائل والمكملات'} onPress={() => setShowSwaps(!showSwaps)} />
      {showSwaps ? (
        <>
          {SWAPS.map((g, gi) => {
            const c = [t.protein, t.carbs, t.fat][gi];
            return (
              <Card key={g.title} style={{ padding: 12, gap: 4, borderTopWidth: 3, borderTopColor: c }}>
                <T w="bold">{`${g.title} · ${g.unit}`}</T>
                <T style={{ color: t.mute, fontSize: 12 }}>أي صنف هنا ينفع مكان أي صنف تاني في نفس المجموعة</T>
                {g.items.map((x) => (
                  <T key={x} style={{ fontSize: 14 }}>{`• ${x}`}</T>
                ))}
              </Card>
            );
          })}
          <Card style={{ padding: 12, gap: 8 }}>
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
      ) : null}
    </Screen>
  );
}
