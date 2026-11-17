import React, { useState } from 'react';
import { Item } from '../../components/Motion';
import { MEAL_ORDER, SUPPLEMENTS, WEEK_MENU, type MealKey } from '../../data/nutrition';
import { WEEKDAY_LETTERS_AR } from '../../data/program';
import { Btn, DayChips, Screen } from '../../components/ui';
import { MenuButton } from '../../components/SideMenu';
import { DayCard, MacroTiles, WaterCard } from '../../components/food/FoodTop';
import { MealCard } from '../../components/food/MealCard';
import { AdherenceCard, ExtrasCard, FoodLegend, SuppsCard } from '../../components/food/FoodLog';
import { ExtraSheet, SwapSheet, type ExtraForm } from '../../components/food/FoodSheets';
import { SwapsInfo } from '../../components/food/SwapsInfo';
import { energyFor, targetsFor } from '../../lib/energy';
import { adherence, dayKey, EXTRAS_KEY, extrasTotal, foodHistory, MEAL_PICKS_KEY, parseExtras, SUPPS_KEY, waterDaysMet, waterGoalMl, WATER_KEY } from '../../lib/journal';
import { creatineDays, eatenTotal, mealsFor, pickOf, planTotal, swapOptions, WEEK_ORDER } from '../../lib/foodView';
import { readNumbers } from '../../lib/meta';
import * as food from '../../lib/foodStore';
import { showUndo } from '../../lib/undo';
import { useSettings } from '../../lib/settings';
import { parseNum } from '../../lib/logic';
import { weekdayOfKey } from '../../lib/rollover';
import { useToday } from '../../lib/useToday';
import { dateInWeek, isTrainingDay } from '../../lib/schedule';
import { storage } from '../../lib/storage';
import { AREA, metaArea, useData } from '../../lib/bus';
import { useTheme } from '../../theme';

export default function Food() {
  const t = useTheme();
  const date = useToday();
  const today = weekdayOfKey(date);
  // null = follow today (also past midnight); a day you picked yourself stays.
  const [picked, setSel] = useState<number | null>(null);
  const sel = picked ?? today;
  const [showSwaps, setShowSwaps] = useState(false);
  const [swapMeal, setSwapMeal] = useState<MealKey | null>(null);
  const [extraForm, setExtraForm] = useState<ExtraForm | null>(null);
  // Re-read storage after a write to what this tab shows: sets (training days), meals, and its meta keys.
  useData(AREA.sets, AREA.meals, metaArea(food.REST_DAY_KEY), metaArea(MEAL_PICKS_KEY), metaArea(WATER_KEY), metaArea(SUPPS_KEY), metaArea(EXTRAS_KEY));
  // Your own targets once the calorie calculator has your data (side menu → حساب السعرات), else the plan's.
  const body = useSettings((s) => s.body);
  const goal = targetsFor(body);
  const day = WEEK_MENU.find((d) => d.weekday === sel)!;
  const isToday = sel === today;
  // Training or rest comes from the workout log, not fixed weekdays (src/lib/schedule.ts). Re-read when v changes.
  const trained = new Set(storage.trainedDays().map((d) => d.date));
  const restDay = storage.getMeta(food.REST_DAY_KEY) || null;
  const training = (wd: number) => isTrainingDay(dateInWeek(wd, date), date, trained, restDay);
  const isTraining = training(sel);
  // Today, before you log anything, you can switch it between training and rest.
  const canSwitch = isToday && !trained.has(date);
  const switchToday = () => void food.setRestDay(date, isTraining);

  // A meal can be swapped for another option of the same meal, for that date only (meta mealPicks).
  const selDate = isToday ? date : dateInWeek(sel, date);
  // Today and earlier days of this week can be ticked (a day you forgot); later days only show the plan.
  const canLog = selDate <= date;
  const checks = new Set(storage.mealChecks(selDate)); // re-read when v changes
  const picks = readNumbers(MEAL_PICKS_KEY);
  const meals = mealsFor(day, picks, selDate);
  const setPick = (m: MealKey, i: number) => {
    setSwapMeal(null);
    food.setMealPick(selDate, m, i === day.picks[m] ? null : i);
  };

  // Water (today only): cups of 250 ml against the calculator's goal (or 3 L), +0.5 L on a training day.
  const waterMap = readNumbers(WATER_KEY);
  const waterMl = waterMap[selDate] ?? 0;
  const baseWater = energyFor(body)?.water ?? null;
  const waterGoal = waterGoalMl(baseWater, isTraining);
  const addWater = (ml: number) => void food.addWater(selDate, ml);
  // Supplements ticked per day (meta supps).
  const supps = readNumbers(SUPPS_KEY);
  const history = foodHistory(storage.allMealChecks(), waterMap, date, 14);
  const adh = adherence(history, MEAL_ORDER.length, date);
  // Each day against its own goal: a training day needs the extra 0.5 L.
  const waterGoalOn = (d: string) => waterGoalMl(baseWater, isTrainingDay(d, date, trained, restDay));
  const waterDays = waterDaysMet(history, waterGoalOn);
  const creatine = SUPPLEMENTS[0]?.name;
  // Food outside the plan counts toward what you ate.
  const extras = parseExtras(storage.getMeta(EXTRAS_KEY))[selDate] ?? [];
  const eaten = eatenTotal(meals, checks, canLog, extrasTotal(extras));
  const addExtra = () => {
    if (!extraForm) return;
    const kcal = parseNum(extraForm.kcal);
    if (kcal == null) return;
    setExtraForm(null);
    food.addExtra(selDate, { name: extraForm.name.trim() || 'أكل برة الخطة', kcal: Math.round(kcal), p: Math.round(parseNum(extraForm.p) ?? 0) });
  };
  const removeExtra = (i: number) => {
    const gone = extras[i];
    if (!gone) return;
    const undo = food.removeExtra(selDate, i, gone);
    if (undo) showUndo('اتمسح أكل', undo);
  };
  const tickMeal = (m: MealKey, on: boolean) => void food.tickMeal(selDate, m, on);
  const tickSupp = (name: string, on: boolean) => void food.tickSupp(selDate, name, on);

  const chips = WEEK_ORDER.map((wd) => {
    const d = WEEK_MENU.find((x) => x.weekday === wd)!;
    return {
      key: wd,
      label: d.day,
      short: WEEKDAY_LETTERS_AR[wd],
      colors: [training(wd) ? t.ok : t.line],
      details: [training(wd) ? { color: t.ok, label: 'يوم تمرين' } : { label: 'راحة' }],
    };
  });

  return (
    <Screen
      title="الأكل"
      sub={goal.mine ? 'أهدافك من حساب السعرات' : '183 سم · 82 كجم · زيادة عضل'}
      dense
      action={<MenuButton />}>
      <MacroTiles goal={goal} />
      <DayChips dense days={chips} value={sel} today={today} onChange={setSel} />
      <DayCard dayName={day.day} goal={goal} total={planTotal(meals)} eaten={eaten} canLog={canLog} isTraining={isTraining} canSwitch={canSwitch} onSwitch={switchToday} />
      {canLog ? <WaterCard ml={waterMl} goal={waterGoal} onAdd={addWater} /> : null}
      {meals.map((m) => (
        <Item key={m.meal}>
          <MealCard m={m} on={canLog && checks.has(m.meal)} canLog={canLog} isTraining={isTraining} onTick={tickMeal} onSwap={setSwapMeal} />
        </Item>
      ))}
      {canLog ? <ExtrasCard extras={extras} onRemove={removeExtra} onAdd={() => setExtraForm({ name: '', kcal: '', p: '' })} /> : null}
      {canLog ? <SuppsCard isOn={(name) => !!supps[dayKey(selDate, name)]} onTick={tickSupp} /> : null}
      <ExtraSheet form={extraForm} onChange={setExtraForm} onClose={() => setExtraForm(null)} onAdd={addExtra} />
      <FoodLegend />
      {history.length ? (
        <AdherenceCard history={history} adh={adh} today={date} waterGoalOn={waterGoalOn} waterDays={waterDays} creatine={creatine} creatineDays={creatineDays(history, supps, creatine)} />
      ) : null}
      <SwapSheet
        meal={swapMeal}
        dayName={day.day}
        options={swapMeal ? swapOptions(swapMeal, day, pickOf(picks, selDate, swapMeal, day)) : []}
        onClose={() => setSwapMeal(null)}
        onPick={setPick}
      />
      <Btn label={showSwaps ? 'اخفي البدائل والمكملات' : 'البدائل والمكملات'} onPress={() => setShowSwaps(!showSwaps)} />
      {showSwaps ? <SwapsInfo /> : null}
    </Screen>
  );
}
