import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { FOODS, MEAL_ORDER, MEAL_TIME, MEALS, SUPPLEMENTS, SWAPS, TARGETS, WEEK_MENU } from '../../data/nutrition';
import { WEEKDAY_LETTERS_AR } from '../../data/program';
import { router } from 'expo-router';
import { Btn, Card, Check, DayChips, HeaderBtn, Ring, Screen, T } from '../../components/ui';
import { dateKey, mealMacros } from '../../lib/logic';
import { dateInWeek, isTrainingDay } from '../../lib/schedule';
import { storage } from '../../lib/storage';
import { useDataVersion } from '../../lib/bus';
import { tint, useTheme, type Theme } from '../../theme';

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
  // Training or rest comes from the workout log, not fixed weekdays (src/lib/schedule.ts). Re-read when v changes.
  const trained = new Set(storage.trainedDays().map((d) => d.date));
  const restDay = storage.getMeta('restDay') || null;
  const training = (wd: number) => isTrainingDay(dateInWeek(wd, date), date, trained, restDay);
  const isTraining = training(sel);
  // Today, before you log anything, you can switch it between training and rest.
  const canSwitch = isToday && !trained.has(date);
  const switchToday = () => {
    storage.setMeta('restDay', isTraining ? date : '');
    bump();
  };

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
    return {
      key: wd,
      label: d.day,
      short: WEEKDAY_LETTERS_AR[wd],
      colors: [training(wd) ? t.ok : t.line],
      details: [training(wd) ? { color: t.ok, label: 'يوم تمرين' } : { label: 'راحة' }],
    };
  });

  const tiles = [
    { v: TARGETS.kcal.toLocaleString('en-US'), u: 'سعر', l: 'في اليوم', c: t.ink, solid: true },
    { v: TARGETS.protein, u: 'جم', l: 'بروتين', c: t.protein },
    { v: TARGETS.carbs, u: 'جم', l: 'كارب', c: t.carbs },
    { v: TARGETS.fat, u: 'جم', l: 'دهون', c: t.fat },
  ];

  return (
    <Screen
      title="الأكل"
      sub="183 سم · 82 كجم · زيادة عضل"
      dense
      action={<HeaderBtn icon="calculator-outline" label="احسب احتياجك من السعرات" onPress={() => router.push('/calories')} />}>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {tiles.map((x, i) => (
          <View key={i} style={{ flex: 1, minWidth: 0, borderRadius: 12, paddingVertical: 6, paddingHorizontal: 9, backgroundColor: x.solid ? t.ink : tint(x.c, 0.15) }}>
            <T w="numBold" style={{ fontSize: 15, color: x.solid ? t.onInk : t.fg }} numberOfLines={1}>{String(x.v)}</T>
            <T style={{ fontSize: 11, color: x.solid ? t.onInk : t.mute }}>{`${x.u} · ${x.l}`}</T>
          </View>
        ))}
      </View>

      <DayChips dense days={chips} value={sel} today={today} onChange={setSel} />

      <Card style={{ paddingVertical: 8, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Ring value={isToday ? eaten.kcal / total.kcal : 0} size={46} stroke={4}>
          <T w="numBold" style={{ fontSize: 12, color: isToday ? t.okText : t.mute }}>{isToday ? `${Math.round((eaten.kcal / total.kcal) * 100)}%` : '–'}</T>
        </Ring>
        <View style={{ flex: 1, gap: 1 }}>
          <T style={{ color: t.mute, fontSize: 12.5 }}>{`${Math.round(total.kcal)} سعر · ${Math.round(total.p)} جم بروتين`}</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <T w="bold" style={{ fontSize: 16 }}>{day.day}</T>
            {canSwitch ? (
              <Pressable
                onPress={switchToday}
                hitSlop={10}
                accessibilityRole="switch"
                accessibilityState={{ checked: isTraining }}
                accessibilityLabel={isTraining ? 'النهارده يوم تمرين، دوس تخليه يوم راحة' : 'النهارده يوم راحة، دوس تخليه يوم تمرين'}
                style={({ pressed }) => [s.pill, { backgroundColor: isTraining ? t.okSoft : t.soft, opacity: pressed ? 0.7 : 1 }]}>
                <T w="semi" style={{ fontSize: 12, color: isTraining ? t.okText : t.mute }}>{isTraining ? 'يوم تمرين' : 'يوم راحة'}</T>
                <Ionicons name="swap-horizontal" size={12} color={isTraining ? t.okText : t.mute} />
              </Pressable>
            ) : (
              <T w="semi" style={{ fontSize: 12, color: isTraining ? t.okText : t.mute }}>{isTraining ? 'يوم تمرين' : 'يوم راحة'}</T>
            )}
          </View>
          <T style={{ color: t.mute, fontSize: 12 }}>
            {isToday ? `كلت لحد دلوقتي: ${Math.round(eaten.kcal)} سعر · ${Math.round(eaten.p)} جم بروتين` : 'التعليم على الوجبات بيشتغل في يوم النهارده بس.'}
          </T>
        </View>
      </Card>

      {meals.map((m) => {
        const on = isToday && checks.has(m.meal);
        return (
          <Card key={m.meal} style={{ paddingHorizontal: 12, paddingVertical: 8, gap: 4, opacity: on ? 0.7 : 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                <T w="bold" style={{ fontSize: 14, flexShrink: 1 }} numberOfLines={1}>{`${m.meal} · ${m.name}`}</T>
                <T style={{ color: t.mute, fontSize: 11.5 }} numberOfLines={1}>{isTraining ? MEAL_TIME[m.meal].training : MEAL_TIME[m.meal].rest}</T>
              </View>
              {isToday ? <Check compact on={on} label={`أكلت ${m.meal}`} onPress={() => { storage.setMealCheck(date, m.meal, !on); bump(); }} /> : null}
            </View>
            {/* The meal's items as a list: colored dot (protein / carbs / fat / veg), item, its calories. */}
            <View>
              {m.items.map((it, i) => (
                <View key={it} style={[s.item, i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line } : null]}>
                  <View style={[s.dot, { backgroundColor: typeColor(t, FOODS[it]?.type ?? 'v') }]} />
                  <T style={{ flex: 1, fontSize: 13.5 }} numberOfLines={1}>{it}</T>
                  {FOODS[it] ? <T w="num" style={{ fontSize: 11.5, color: t.mute }}>{`${Math.round(FOODS[it].kcal)} سعر`}</T> : null}
                </View>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <T w="num" style={{ fontSize: 12 }}>{`${Math.round(m.mac.kcal)} سعر`}</T>
              <T w="num" style={{ fontSize: 12, color: t.protein }}>{`${Math.round(m.mac.p)} بروتين`}</T>
              <T w="num" style={{ fontSize: 12, color: t.carbsText }}>{`${Math.round(m.mac.c)} كارب`}</T>
              <T w="num" style={{ fontSize: 12, color: t.fat }}>{`${Math.round(m.mac.f)} دهون`}</T>
            </View>
          </Card>
        );
      })}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {[['بروتين', t.protein], ['كارب', t.carbs], ['دهون', t.fat], ['خضار', t.veg]].map(([l, c]) => (
          <View key={l} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c }} />
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
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  item: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
});
