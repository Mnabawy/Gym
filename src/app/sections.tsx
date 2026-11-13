// The home page: the app opens here (see the tabs layout). Only the sections as cards — الجيم، مهامي، العادات،
// الأهداف، بطّل — and التقويم, each with one number and one line; a moon in the bar opens مواقيت الصلاة.
// Apple look: grey grouped background, white cards, one tint (system blue), no section colors.
import React, { useEffect } from 'react';
import { Item } from '../components/Motion';
import { Pressable, ScrollView, StyleSheet, useColorScheme, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { T } from '../components/ui';
import { MenuButton } from '../components/SideMenu';
import { SafeAreaView } from 'react-native-safe-area-context';
import { dayFor, PLAN_WEEKDAYS } from '../data/program';
import { useDataVersion } from '../lib/bus';
import { readGoals } from '../lib/goalStore';
import { kidsOf, nextTask, progress, umbrellaProgress } from '../lib/goals';
import { habitStats, isDue, logKey } from '../lib/habits';
import { CALENDAR_OFF, HABITS_OFF } from '../lib/hidden';
import { readHabitLog, readHabits } from '../lib/habitStore';
import { dateKey } from '../lib/logic';
import { currentWorkout } from '../lib/schedule';
import { hubSeen, lastSection, openSection, type Section } from '../lib/section';
import { storage } from '../lib/storage';
import { addDays, weekStart } from '../lib/gaps';
import { readQuits } from '../lib/quitStore';
import { readTasks } from '../lib/taskStore';
import { todayView } from '../lib/tasks';
import { clean, runLabel } from '../lib/quit';
import { useNow } from '../lib/useNow';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** iOS system colors (UIColor semantic colors), light and dark. */
const IOS = {
  light: { bg: '#F2F2F7', card: '#FFFFFF', label: '#000000', secondary: 'rgba(60,60,67,0.6)', fill: 'rgba(118,118,128,0.12)', press: '#D1D1D6', tint: '#007AFF' },
  dark: { bg: '#000000', card: '#1C1C1E', label: '#FFFFFF', secondary: 'rgba(235,235,245,0.6)', fill: 'rgba(118,118,128,0.24)', press: '#3A3A3C', tint: '#0A84FF' },
};

export default function Sections() {
  const c = useColorScheme() === 'dark' ? IOS.dark : IOS.light;
  useDataVersion((s) => s.v);
  // The app has shown its home page: from now on the tabs open the gym instead of coming back here.
  useEffect(hubSeen, []);
  const today = dateKey();
  const here = lastSection();
  const go = (s: Section) => (s === here && router.canGoBack() ? router.back() : openSection(s));

  // Gym
  const trainedDays = storage.trainedDays();
  const day = dayFor(currentWorkout(trainedDays, today).id);
  const from = weekStart(today);
  const weekDone = trainedDays.filter((d) => d.date >= from && d.date <= addDays(from, 6)).length;
  const trainedToday = trainedDays.some((d) => d.date === today);

  // Habits
  const habits = readHabits();
  const log = readHabitLog();
  const due = habits.filter((h) => isDue(h, today));
  const done = due.filter((h) => log[logKey(h.id, today)] === 'done').length;
  const streak = Math.max(0, ...habits.map((h) => habitStats(h, log, today).streak));

  // Goals: the big goal if there is one, else the first goal.
  const goals = readGoals();
  const goal = goals.find((g) => g.umbrella) ?? goals.find((g) => !g.later) ?? goals[0];
  const goalShare = goal ? (goal.umbrella ? umbrellaProgress(goal, kidsOf(goals, goal.id)) : progress(goal)) : 0;
  const step = goals.filter((g) => !g.umbrella && !g.later).map(nextTask).find(Boolean);

  // Quitting: the one with the longest clean run right now.
  const now = useNow(60000);
  const quits = readQuits();
  const quit = [...quits].sort((a, b) => clean(b, now).ms - clean(a, now).ms)[0];

  // Tasks
  const tv = todayView(readTasks(), today);
  const tOpen = [...tv.overdue, ...tv.day];
  const tAll = tOpen.length + tv.done.length;

  const cards: { key: string; title: string; icon: IconName; value: string; line: string; onPress: () => void; current?: boolean }[] = [
    { key: 'gym', title: 'الجيم', icon: 'barbell-outline', value: `${weekDone}/${PLAN_WEEKDAYS.length}`, line: trainedToday ? 'اتمرنت النهارده ✓' : day?.titleAr ?? 'التمرين' },
    { key: 'tasks', title: 'مهامي', icon: 'checkbox-outline', value: tAll ? `${tv.done.length}/${tAll}` : '', line: tOpen[0] ? tOpen[0].title : tAll ? 'خلّصت مهام النهارده ✓' : 'يومك فاضي' },
    { key: 'habits', title: 'العادات', icon: 'repeat-outline', value: due.length ? `${done}/${due.length}` : '', line: !habits.length ? 'ابدأ أول عادة' : due.length && done === due.length ? 'كمّلت عادات النهارده ✓' : streak > 1 ? `🔥 ${streak} يوم` : 'عادات النهارده' },
    { key: 'goals', title: 'الأهداف', icon: 'flag-outline', value: goal ? `${Math.floor(goalShare * 100)}%` : '', line: step ? step.task.title : goal ? goal.name : 'حدّد هدفك' },
    { key: 'quit', title: 'بطّل', icon: 'hand-left-outline', value: quit ? runLabel(clean(quit, now).ms) : '', line: quit ? 'نضيف، كمّل' : 'عادة عايز تبطّلها؟' },
  ]
    .filter((x) => !(HABITS_OFF && x.key === 'habits'))
    .map((x) => ({ ...x, icon: x.icon as IconName, onPress: () => go(x.key as Section), current: x.key === here }));
  if (!CALENDAR_OFF) cards.push({ key: 'calendar', title: 'التقويم', icon: 'calendar-outline', value: '', line: 'كل حاجة على شهر واحد', onPress: () => router.push('/calendar') });

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={s.bar}>
        <T w="bold" style={{ fontSize: 30, lineHeight: 40, color: c.label }}>Brainy</T>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Pressable onPress={() => router.push('/prayer')} hitSlop={8} accessibilityRole="button" accessibilityLabel="مواقيت الصلاة" style={({ pressed }) => [s.barBtn, { opacity: pressed ? 0.4 : 1 }]}>
            <Ionicons name="moon-outline" size={23} color={c.tint} />
          </Pressable>
          <MenuButton hub color={c.tint} />
        </View>
      </View>
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.grid}>
          {cards.map((r, i) => (
            <Item key={r.key} index={i} style={s.cell}>
              <Pressable
                onPress={r.onPress}
                accessibilityRole="button"
                accessibilityLabel={`${r.title}${r.value ? `، ${r.value}` : ''}، ${r.line}`}
                style={({ pressed }) => [s.card, { backgroundColor: pressed ? c.press : c.card }]}>
                <View style={s.top}>
                  <View style={[s.icon, { backgroundColor: r.current ? c.tint : c.fill }]}>
                    <Ionicons name={r.icon} size={20} color={r.current ? '#FFFFFF' : c.label} />
                  </View>
                  <T w="numBold" style={{ fontSize: 17, color: c.label }} numberOfLines={1}>{r.value}</T>
                </View>
                <T w="semi" style={{ fontSize: 17, color: c.label }} numberOfLines={1}>{r.title}</T>
                <T style={{ fontSize: 13, color: c.secondary }} numberOfLines={1}>{r.line}</T>
              </Pressable>
            </Item>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, minHeight: 52 },
  barBtn: { minWidth: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  cell: { width: '48.5%' },
  card: { borderRadius: 14, padding: 14, gap: 3, minHeight: 118 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  icon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
