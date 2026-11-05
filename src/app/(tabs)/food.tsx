import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { FOODS, MEAL_ORDER, MEAL_TIME, MEALS, SUPPLEMENTS, SWAPS, WEEK_MENU, type MealKey } from '../../data/nutrition';
import { WEEKDAY_LETTERS_AR } from '../../data/program';
import { Btn, Card, Check, DayChips, Progress, Ring, Screen, Sheet, T } from '../../components/ui';
import { MenuButton } from '../../components/SideMenu';
import { energyFor, targetsFor } from '../../lib/energy';
import { adherence, CUP_ML, dayKey, foodHistory, MEAL_PICKS_KEY, waterGoalMl, WATER_KEY } from '../../lib/journal';
import { readNumbers, writeEntry } from '../../lib/meta';
import { useSettings } from '../../lib/settings';
import { dateKey, mealMacros } from '../../lib/logic';
import { dateInWeek, isTrainingDay } from '../../lib/schedule';
import { storage } from '../../lib/storage';
import { useDataVersion } from '../../lib/bus';
import { tint, useTheme, type Theme } from '../../theme';

const l1 = (ml: number) => String(Math.round(ml / 100) / 10);
const typeColor = (t: Theme, ty: string) => (ty === 'p' ? t.protein : ty === 'c' ? t.carbs : ty === 'f' ? t.fat : t.veg);

export default function Food() {
  const t = useTheme();
  const now = new Date();
  const today = now.getDay();
  const date = dateKey(now);
  const [sel, setSel] = useState(today);
  const [showSwaps, setShowSwaps] = useState(false);
  const [swapMeal, setSwapMeal] = useState<MealKey | null>(null);
  const { bump } = useDataVersion();
  // Your own targets once the calorie calculator has your data (side menu → حساب السعرات), else the plan's.
  const body = useSettings((s) => s.body);
  const goal = targetsFor(body);
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
  // A meal can be swapped for another option of the same meal, for that date only (meta mealPicks).
  const selDate = isToday ? date : dateInWeek(sel, date);
  const picks = readNumbers(MEAL_PICKS_KEY);
  const pickOf = (m: MealKey) => {
    const i = picks[dayKey(selDate, m)];
    return i != null && MEALS.find((x) => x.meal === m)!.options[i] ? i : day.picks[m];
  };
  const meals = MEAL_ORDER.map((m) => {
    const opt = MEALS.find((x) => x.meal === m)!.options[pickOf(m)];
    return { meal: m, ...opt, mac: mealMacros(opt.items), swapped: pickOf(m) !== day.picks[m] };
  });
  const setPick = (m: MealKey, i: number) => {
    setSwapMeal(null);
    writeEntry(MEAL_PICKS_KEY, 'number', dayKey(selDate, m), i === day.picks[m] ? undefined : i, { dated: true });
  };

  // Water (today only): cups of 250 ml against the calculator's goal (or 3 L), +0.5 L on a training day.
  const waterMap = readNumbers(WATER_KEY);
  const waterMl = waterMap[date] ?? 0;
  const baseWater = energyFor(body)?.water ?? null;
  const waterGoal = waterGoalMl(baseWater, training(today));
  const addWater = (ml: number) => writeEntry(WATER_KEY, 'number', date, Math.max(0, waterMl + ml) || undefined, { dated: true });
  const history = foodHistory(storage.allMealChecks(), waterMap, date, 14);
  const adh = adherence(history, MEAL_ORDER.length, date);
  const waterDays = history.filter((d) => d.water >= waterGoalMl(baseWater, false)).length;
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
    { v: goal.kcal.toLocaleString('en-US'), u: 'سعر', l: goal.mine ? 'احتياجك' : 'في اليوم', c: t.ink, solid: true },
    { v: goal.protein, u: 'جم', l: 'بروتين', c: t.protein },
    { v: goal.carbs, u: 'جم', l: 'كارب', c: t.carbs },
    { v: goal.fat, u: 'جم', l: 'دهون', c: t.fat },
  ];

  return (
    <Screen
      title="الأكل"
      sub={goal.mine ? 'أهدافك من حساب السعرات' : '183 سم · 82 كجم · زيادة عضل'}
      dense
      action={<MenuButton />}>
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
        <Ring value={isToday ? Math.min(1, eaten.kcal / goal.kcal) : 0} size={46} stroke={4}>
          <T w="numBold" style={{ fontSize: 12, color: isToday ? t.okText : t.mute }}>{isToday ? `${Math.round((eaten.kcal / goal.kcal) * 100)}%` : '–'}</T>
        </Ring>
        <View style={{ flex: 1, gap: 1 }}>
          <T style={{ color: t.mute, fontSize: 12.5 }}>{`أكل اليوم ${Math.round(total.kcal)} سعر · ${Math.round(total.p)} جم بروتين`}</T>
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
            {isToday ? `كلت ${Math.round(eaten.kcal)} من ${goal.kcal.toLocaleString('en-US')} سعر · ${Math.round(eaten.p)} من ${goal.protein} جم بروتين` : 'التعليم على الوجبات بيشتغل في يوم النهارده بس.'}
          </T>
        </View>
      </Card>

      {isToday ? (
        <Card style={{ paddingVertical: 8, paddingHorizontal: 12, gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="water-outline" size={18} color={t.protein} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <T w="semi" style={{ fontSize: 13.5 }}>{`المية · \u2066${l1(waterMl)}\u2069 من \u2066${l1(waterGoal)}\u2069 لتر`}</T>
              <T style={{ fontSize: 11.5, color: t.mute }}>{waterMl >= waterGoal ? 'كمّلت مية النهارده ✓' : `فاضل ${Math.ceil((waterGoal - waterMl) / CUP_ML)} كوباية`}</T>
            </View>
            <Pressable onPress={() => addWater(-CUP_ML)} disabled={!waterMl} hitSlop={6} accessibilityRole="button" accessibilityLabel="شيل كوباية" style={({ pressed }) => [s.wbtn, { backgroundColor: t.soft, opacity: !waterMl ? 0.35 : pressed ? 0.7 : 1 }]}>
              <Ionicons name="remove" size={18} color={t.fg} />
            </Pressable>
            <Pressable onPress={() => addWater(CUP_ML)} hitSlop={6} accessibilityRole="button" accessibilityLabel="زوّد كوباية مية" style={({ pressed }) => [s.wadd, { backgroundColor: tint(t.protein, 0.15), opacity: pressed ? 0.7 : 1 }]}>
              <T w="semi" style={{ fontSize: 12.5, color: t.protein }} numberOfLines={1}>+ كوباية</T>
            </Pressable>
          </View>
          <Progress value={waterMl / waterGoal} color={t.protein} height={6} />
        </Card>
      ) : null}

      {meals.map((m) => {
        const on = isToday && checks.has(m.meal);
        return (
          <Card key={m.meal} style={{ paddingHorizontal: 12, paddingVertical: 8, gap: 4, opacity: on ? 0.7 : 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                <T w="bold" style={{ fontSize: 14, flexShrink: 1 }} numberOfLines={1}>{`${m.meal} · ${m.name}`}</T>
                <T style={{ color: t.mute, fontSize: 11.5 }} numberOfLines={1}>{isTraining ? MEAL_TIME[m.meal].training : MEAL_TIME[m.meal].rest}</T>
              </View>
              <Pressable
                onPress={() => setSwapMeal(m.meal)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={`بدّل ${m.meal}`}
                style={({ pressed }) => [s.swap, { backgroundColor: m.swapped ? t.warnSoft : t.soft, opacity: pressed ? 0.6 : 1 }]}>
                <Ionicons name="swap-horizontal" size={15} color={m.swapped ? t.warn : t.mute} />
              </Pressable>
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

      {history.length ? (
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
                  <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: d.water >= waterGoalMl(baseWater, false) ? t.protein : 'transparent' }} />
                  <T w="num" style={{ fontSize: 9, color: d.date === date ? t.fg : t.mute }}>{String(+d.date.slice(8))}</T>
                </View>
              );
            })}
          </View>
          <T style={{ fontSize: 11.5, color: t.mute }}>{`العمود = الوجبات اللي علّمت عليها · النقطة الزرقا = كمّلت المية (${waterDays} يوم)`}</T>
        </Card>
      ) : null}

      <Sheet
        visible={swapMeal != null}
        onClose={() => setSwapMeal(null)}
        title={swapMeal ? `بدّل ${swapMeal} · ${day.day}` : ''}
        sub="أي اختيار من نفس الوجبة بماكروز قريبة. التبديل لليوم ده بس، وقايمة المشتريات زي ما هي">
        {swapMeal
          ? (() => {
              const opts = MEALS.find((x) => x.meal === swapMeal)!.options;
              const base = mealMacros(opts[day.picks[swapMeal]].items);
              const cur = pickOf(swapMeal);
              return opts
                .map((o, i) => ({ o, i, mac: mealMacros(o.items) }))
                .sort((a, b) => Math.abs(a.mac.kcal - base.kcal) - Math.abs(b.mac.kcal - base.kcal))
                .map(({ o, i, mac }) => {
                  const on = i === cur;
                  const dk = Math.round(mac.kcal - base.kcal);
                  return (
                    <Pressable key={i} onPress={() => setPick(swapMeal, i)} accessibilityRole="button" accessibilityState={{ selected: on }} style={({ pressed }) => [s.opt, { backgroundColor: on ? t.okSoft : t.soft, opacity: pressed ? 0.7 : 1 }]}>
                      <View style={{ flex: 1, gap: 1 }}>
                        <T w="semi" style={{ fontSize: 14 }}>{`${o.name}${i === day.picks[swapMeal] ? ' · الأصلي' : ''}`}</T>
                        <T style={{ fontSize: 11.5, color: t.mute }} numberOfLines={2}>{o.items.join('، ')}</T>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <T w="num" style={{ fontSize: 12 }}>{`${Math.round(mac.kcal)} سعر`}</T>
                        <T w="num" style={{ fontSize: 11, color: t.protein }}>{`${Math.round(mac.p)} بروتين`}</T>
                        {dk ? <T w="num" style={{ fontSize: 10.5, color: t.mute }}>{`\u2066${dk > 0 ? '+' : ''}${dk}\u2069`}</T> : null}
                      </View>
                    </Pressable>
                  );
                });
            })()
          : null}
      </Sheet>

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
  wbtn: { width: 36, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  wadd: { height: 32, borderRadius: 10, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  swap: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, minHeight: 48 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
});
