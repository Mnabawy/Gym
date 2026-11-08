import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { HeaderBtn, T } from '../components/ui';
import { SafeAreaView } from 'react-native-safe-area-context';
import { dayFor, MONTHS_AR, PLAN_WEEKDAYS, WEEKDAYS_AR } from '../data/program';
import { MEAL_ORDER, MEAL_TIME } from '../data/nutrition';
import { VERSES } from '../data/verses';
import { useDataVersion } from '../lib/bus';
import { readGoals, saveGoal } from '../lib/goalStore';
import { nextTask, progress, toggleTask } from '../lib/goals';
import { habitStats, isDue, logKey } from '../lib/habits';
import { readHabitLog, readHabits } from '../lib/habitStore';
import { dateKey, weekdayOf } from '../lib/logic';
import { currentWorkout, isTrainingDay } from '../lib/schedule';
import { lastSection, openSection, type Section } from '../lib/section';
import { storage } from '../lib/storage';
import { addDays, daysBetween, weekStart } from '../lib/gaps';
import { tap } from '../lib/timer';
import { readQuits } from '../lib/quitStore';
import { readTasks } from '../lib/taskStore';
import { todayView } from '../lib/tasks';
import { clean, runLabel } from '../lib/quit';
import { useNow } from '../lib/useNow';
import { F, ThemeProvider, tint, useTheme, useWarm } from '../theme';

export default function Sections() {
  return (
    <ThemeProvider value={useWarm()}>
      <Hub />
    </ThemeProvider>
  );
}

/** Short verses only, so the card stays one or two lines; a new one each day. */
const SHORT = VERSES.filter((v) => v.text.join(' ').length <= 60);
const glueMarks = (line: string) => line.replace(/ ([ۖ-ۜ])/g, '$1');

/**
 * أقسامك: equal tiles (مهامي، الجيم، العادات، الأهداف، بطّل — the odd one out spans the row), each with its icon, name, one number and one line; tap to
 * open. Under them your next goal step with a tick, and a verse of the day.
 */
type IconName = React.ComponentProps<typeof Ionicons>['name'];

function Hub() {
  const t = useTheme();
  useDataVersion((s) => s.v);
  const today = dateKey();
  const here = lastSection();
  const go = (s: Section) => (s === here && router.canGoBack() ? router.back() : openSection(s));

  // Gym
  const trainedDays = storage.trainedDays();
  const trained = new Set(trainedDays.map((d) => d.date));
  const day = dayFor(currentWorkout(trainedDays, today).id);
  const from = weekStart(today);
  const weekDone = trainedDays.filter((d) => d.date >= from && d.date <= addDays(from, 6)).length;
  const target = PLAN_WEEKDAYS.length;
  const training = isTrainingDay(today, today, trained, storage.getMeta('restDay') || null);
  const eaten = storage.mealChecks(today);
  const meal = MEAL_ORDER.find((m) => !eaten.includes(m));

  // Habits
  const habits = readHabits();
  const log = readHabitLog();
  const due = habits.filter((h) => isDue(h, today));
  const done = due.filter((h) => log[logKey(h.id, today)] === 'done').length;
  const streak = Math.max(0, ...habits.map((h) => habitStats(h, log, today).streak));

  // Goals
  const goal = readGoals()[0];
  const next = goal ? nextTask(goal) : null;

  // Quitting: the habit with the longest clean run right now.
  const now = useNow(60000);
  const quits = readQuits();
  const quit = [...quits].sort((a, b) => clean(b, now).ms - clean(a, now).ms)[0];

  const quitMs = quit ? clean(quit, now).ms : 0;
  const tv = todayView(readTasks(), today);
  const tOpen = [...tv.overdue, ...tv.day];
  const tAll = tOpen.length + tv.done.length;
  const tiles: { key: Section; title: string; icon: IconName; color: string; stat: string; line: string; night?: boolean }[] = [
    { key: 'tasks', title: 'مهامي', icon: 'checkbox', color: t.sec.tasks, stat: tAll ? `${tv.done.length} من ${tAll}` : '—', line: tOpen[0] ? `الجاي: ${tOpen[0].title}${tv.overdue.length ? ` · ${tv.overdue.length} متأخرة` : ''}` : tAll ? 'خلّصت مهام النهارده ✓' : 'يومك فاضي' },
    { key: 'gym', title: 'الجيم', icon: 'barbell', color: t.sec.gym, stat: trained.has(today) ? 'اتمرنت ✓' : day?.titleAr ?? '—', line: `${weekDone} من ${target} تمارين الأسبوع ده${meal ? ` · ${meal} ${MEAL_TIME[meal][training ? 'training' : 'rest']}` : ''}` },
    { key: 'habits', title: 'العادات', icon: 'checkmark-done', color: t.sec.habits, stat: due.length ? `${done} من ${due.length}` : '—', line: !habits.length ? 'ابدأ أول عادة' : streak > 1 ? `النهارده · 🔥 ${streak} يوم` : 'عادات النهارده' },
    { key: 'goals', title: 'الأهداف', icon: 'flag', color: t.sec.goals, stat: goal ? `${Math.floor(progress(goal) * 100)}%` : '—', line: goal ? goal.name : 'حدّد هدفك الكبير' },
    { key: 'quit', title: 'بطّل', icon: 'hand-left', color: t.sec.quit, stat: quit ? runLabel(quitMs) : '—', line: quit ? (quits.length > 1 ? `نضيف · ${quits.length} عادات` : 'نضيف، كمّل') : 'عادة عايز تبطّلها؟', night: true },
  ];

  const verse = SHORT[Math.abs(daysBetween('2026-01-01', today)) % SHORT.length];
  
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.head}>
          <View style={{ flex: 1 }}>
            <T style={{ color: t.mute, fontSize: 13.5 }}>{`${WEEKDAYS_AR[weekdayOf(today)]} · ${+today.slice(8)} ${MONTHS_AR[+today.slice(5, 7) - 1]}`}</T>
            <T w="bold" style={{ fontSize: 32, lineHeight: 46 }}>أقسامك</T>
          </View>
          <HeaderBtn icon="close" label="اقفل" onPress={() => (router.canGoBack() ? router.back() : openSection(here))} />
        </View>

        <View style={s.grid}>
          {tiles.map((c) => (
            <Pressable
              key={c.key}
              onPress={() => go(c.key)}
              accessibilityRole="button"
              accessibilityLabel={`${c.title}: ${c.stat} ${c.line}`}
              style={({ pressed }) => [
                s.tile,
                {
                  backgroundColor: c.night ? '#17122A' : tint(c.color, 0.16),
                  borderColor: c.key === here ? c.color : 'transparent',
                  transform: [{ scale: pressed ? 0.96 : 1 }],
                },
              ]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={[s.icon, { backgroundColor: c.color }]}>
                  <Ionicons name={c.icon} size={24} color="#FFFFFF" />
                </View>
                {c.key === here ? (
                  <View style={[s.here, { backgroundColor: c.color }]}>
                    <T w="semi" style={{ fontSize: 11, color: '#FFFFFF' }}>انت هنا</T>
                  </View>
                ) : (
                  <Ionicons name="chevron-back" size={18} color={c.night ? 'rgba(255,255,255,0.5)' : t.mute} />
                )}
              </View>
              <T w="bold" style={{ fontSize: 19, marginTop: 10, color: c.night ? '#FFFFFF' : t.fg }}>{c.title}</T>
              <T w="bold" style={{ fontSize: 24, lineHeight: 34, color: c.night ? '#FFFFFF' : t.fg }} numberOfLines={1} adjustsFontSizeToFit>{c.stat}</T>
              <T style={{ fontSize: 12.5, lineHeight: 18, color: c.night ? 'rgba(255,255,255,0.65)' : t.mute }} numberOfLines={2}>{c.line}</T>
            </Pressable>
          ))}
        </View>

        {goal && next ? (
          <View style={[s.card, { backgroundColor: t.card }]}>
            <Pressable onPress={() => router.push(`/goals/${goal.id}`)} accessibilityRole="button" style={({ pressed }) => ({ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.7 : 1 })}>
              <Ionicons name="flag" size={26} color={t.sec.goals} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <T style={{ fontSize: 12.5, color: t.mute }}>خطوتك الجاية</T>
                <T w="bold" style={{ fontSize: 16, lineHeight: 25 }}>{next.task.title}</T>
              </View>
            </Pressable>
            <Pressable
              onPress={() => {
                tap();
                saveGoal(toggleTask(goal, next.task.id, today));
              }}
              hitSlop={8}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: false }}
              accessibilityLabel={`خلّصت: ${next.task.title}`}
              style={({ pressed }) => [s.done, { borderColor: t.fg, backgroundColor: pressed ? tint(t.fg, 0.08) : 'transparent' }]}>
              <Ionicons name="checkmark" size={22} color={t.fg} />
            </Pressable>
          </View>
        ) : null}

        {verse ? (
          <View style={[s.card, { backgroundColor: tint(t.sec.goals, 0.13), flexDirection: 'column', alignItems: 'stretch', gap: 4 }]}>
            <T style={{ fontSize: 12.5, color: t.mute }}>{`آية اليوم · ${verse.surah}`}</T>
            <T style={{ fontFamily: F.quran, fontSize: 21, lineHeight: 42, color: t.fg, writingDirection: 'rtl' }}>{`﴿ ${verse.text.map(glueMarks).join(' ۝ ')} ﴾`}</T>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 40, gap: 12 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { width: '47.5%', flexGrow: 1, minHeight: 168, borderRadius: 26, padding: 16, borderWidth: 2 },
  icon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  here: { borderRadius: 9, paddingHorizontal: 8, paddingVertical: 2 },
  ticks: { flexDirection: 'row', gap: 5, marginTop: 12, marginBottom: 6 },
  tick: { flex: 1, height: 26, borderRadius: 7 },
  rule: { height: 1, marginVertical: 10 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 24, padding: 16 },
  done: { width: 46, height: 46, borderRadius: 23, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
