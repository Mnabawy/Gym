import React from 'react';
import { Item } from '../components/Motion';
import { Pressable, ScrollView, StyleSheet, useColorScheme, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { T } from '../components/ui';
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
import { readCfg, readFocus, readSessions } from '../lib/focusStore';
import { clock, countOn, minAr, minutesOn, PHASE_AR, remaining, running } from '../lib/focus';
import { todayView } from '../lib/tasks';
import { clean, runLabel } from '../lib/quit';
import { useNow } from '../lib/useNow';
import { F } from '../theme';

/** Short verses only, so the card stays one or two lines; a new one each day. */
const SHORT = VERSES.filter((v) => v.text.join(' ').length <= 60);
const glueMarks = (line: string) => line.replace(/ ([ۖ-ۜ])/g, '$1');

/**
 * أقسامك — the hub, in the look of Apple's own apps: grey grouped background, white inset lists, black text,
 * grey secondary text and one tint (system blue) for what you can tap. No section colors here on purpose.
 * Top: date + large title, then a "today" card (tasks, habits, workout), the sections as one list (icon, name,
 * one line, a number, chevron; ✓ on the one you came from), your next goal step with a round tick, and a verse.
 */
type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** iOS system colors (UIColor semantic colors), light and dark. */
const IOS = {
  light: {
    bg: '#F2F2F7', card: '#FFFFFF', label: '#000000', secondary: 'rgba(60,60,67,0.6)', tertiary: 'rgba(60,60,67,0.3)',
    sep: 'rgba(60,60,67,0.29)', fill: 'rgba(118,118,128,0.12)', press: '#D1D1D6', tint: '#007AFF',
  },
  dark: {
    bg: '#000000', card: '#1C1C1E', label: '#FFFFFF', secondary: 'rgba(235,235,245,0.6)', tertiary: 'rgba(235,235,245,0.3)',
    sep: 'rgba(84,84,88,0.65)', fill: 'rgba(118,118,128,0.24)', press: '#3A3A3C', tint: '#0A84FF',
  },
};
type Ios = typeof IOS.light;

export default function Sections() {
  const c = useColorScheme() === 'dark' ? IOS.dark : IOS.light;
  useDataVersion((s) => s.v);
  const today = dateKey();
  const here = lastSection();
  const go = (s: Section) => (s === here && router.canGoBack() ? router.back() : openSection(s));
  const close = () => (router.canGoBack() ? router.back() : openSection(here));

  // Gym
  const trainedDays = storage.trainedDays();
  const trained = new Set(trainedDays.map((d) => d.date));
  const day = dayFor(currentWorkout(trainedDays, today).id);
  const from = weekStart(today);
  const weekDone = trainedDays.filter((d) => d.date >= from && d.date <= addDays(from, 6)).length;
  const target = PLAN_WEEKDAYS.length;
  const restDay = storage.getMeta('restDay') || null;
  const training = isTrainingDay(today, today, trained, restDay);
  const eaten = storage.mealChecks(today);
  const meal = MEAL_ORDER.find((m) => !eaten.includes(m));

  // Habits
  const habits = readHabits();
  const log = readHabitLog();
  const due = habits.filter((h) => isDue(h, today));
  const done = due.filter((h) => log[logKey(h.id, today)] === 'done').length;
  const streak = Math.max(0, ...habits.map((h) => habitStats(h, log, today).streak));

  // Goals
  const goal = readGoals().find((g) => !g.umbrella && nextTask(g)) ?? readGoals().find((g) => !g.umbrella);
  const next = goal ? nextTask(goal) : null;

  // Quitting: the one with the longest clean run right now.
  const now = useNow(60000);
  const quits = readQuits();
  const quit = [...quits].sort((a, b) => clean(b, now).ms - clean(a, now).ms)[0];
  const quitMs = quit ? clean(quit, now).ms : 0;

  // Tasks, focus
  const tv = todayView(readTasks(), today);
  const tOpen = [...tv.overdue, ...tv.day];
  const tAll = tOpen.length + tv.done.length;
  const fs = readSessions();
  const fNow = readFocus();
  const fMin = minutesOn(fs, today);
  const fLine = running(fNow) ? `${PHASE_AR[fNow.phase]} شغال · ${clock(remaining(fNow, readCfg(), now))}` : fMin ? `${countOn(fs, today)} جلسات النهارده` : 'ركّز 25 دقيقة';

  const rows: { key: Section; title: string; icon: IconName; value: string; line: string }[] = [
    { key: 'gym', title: 'الجيم', icon: 'barbell-outline', value: `${weekDone}/${target}`, line: trained.has(today) ? 'اتمرنت النهارده ✓' : `${day?.titleAr ?? 'التمرين'}${meal ? ` · ${meal} ${MEAL_TIME[meal][training ? 'training' : 'rest']}` : ''}` },
    { key: 'tasks', title: 'مهامي', icon: 'checkbox-outline', value: tAll ? `${tv.done.length}/${tAll}` : '', line: tOpen[0] ? `الجاي: ${tOpen[0].title}${tv.overdue.length ? ` · ${tv.overdue.length} متأخرة` : ''}` : tAll ? 'خلّصت مهام النهارده' : 'يومك فاضي' },
    { key: 'habits', title: 'العادات', icon: 'repeat-outline', value: due.length ? `${done}/${due.length}` : '', line: !habits.length ? 'ابدأ أول عادة' : streak > 1 ? `أطول سلسلة ${streak} يوم` : 'عادات النهارده' },
    { key: 'goals', title: 'الأهداف', icon: 'flag-outline', value: goal ? `${Math.floor(progress(goal) * 100)}%` : '', line: goal ? goal.name : 'حدّد هدفك الكبير' },
    { key: 'focus', title: 'بومودورو', icon: 'timer-outline', value: fMin ? minAr(fMin) : '', line: fLine },
    { key: 'quit', title: 'بطّل', icon: 'hand-left-outline', value: quit ? runLabel(quitMs) : '', line: quit ? (quits.length > 1 ? `نضيف · ${quits.length} عادات` : 'نضيف، كمّل') : 'عادة عايز تبطّلها؟' },
  ];

  const stats = [
    { label: 'المهام', value: tAll ? `${tv.done.length}/${tAll}` : '—' },
    { label: 'العادات', value: due.length ? `${done}/${due.length}` : '—' },
    { label: 'التمرين', value: trained.has(today) ? '✓' : training ? 'لسه' : 'راحة' },
  ];

  const verse = SHORT[Math.abs(daysBetween('2026-01-01', today)) % SHORT.length];
  const hair = StyleSheet.hairlineWidth;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={s.bar}>
        <Pressable onPress={close} hitSlop={8} accessibilityRole="button" accessibilityLabel="اقفل" style={({ pressed }) => [s.barBtn, { opacity: pressed ? 0.4 : 1 }]}>
          <T w="semi" style={{ fontSize: 17, color: c.tint }}>تم</T>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={s.scroll}>
        <T w="semi" style={{ fontSize: 13, color: c.secondary, marginStart: 4 }}>{`${WEEKDAYS_AR[weekdayOf(today)]}، ${+today.slice(8)} ${MONTHS_AR[+today.slice(5, 7) - 1]}`}</T>
        <T w="bold" style={{ fontSize: 34, lineHeight: 46, color: c.label, marginStart: 4, marginBottom: 10 }}>أقسامك</T>

        {/* The sections as small cards, three to a row, at the top. */}
        <View style={s.grid}>
          {rows.map((r, i) => {
            const cur = r.key === here;
            return (
              <Item key={r.key} index={i} style={s.cell}>
                <Pressable
                  onPress={() => go(r.key)}
                  accessibilityRole="button"
                  accessibilityLabel={`${r.title}${r.value ? `، ${r.value}` : ''}، ${r.line}`}
                  accessibilityState={{ selected: cur }}
                  style={({ pressed }) => [s.tile, { backgroundColor: pressed ? c.press : c.card, borderColor: cur ? c.tint : 'transparent' }]}>
                  <View style={[s.tileIcon, { backgroundColor: cur ? c.tint : c.fill }]}>
                    <Ionicons name={r.icon} size={20} color={cur ? '#FFFFFF' : c.label} />
                  </View>
                  <T w="semi" style={{ fontSize: 14, color: c.label }} numberOfLines={1}>{r.title}</T>
                  <T w="numRegular" style={{ fontSize: 12, color: c.secondary }} numberOfLines={1}>{r.value || '\u00A0'}</T>
                </Pressable>
              </Item>
            );
          })}
        </View>

        <View style={[s.group, s.stats, { backgroundColor: c.card, marginTop: 14 }]}>
          {stats.map((x, i) => (
            <React.Fragment key={x.label}>
              {i > 0 ? <View style={{ width: hair, alignSelf: 'stretch', backgroundColor: c.sep }} /> : null}
              <View style={s.stat}>
                <T w="numBold" style={{ fontSize: 26, lineHeight: 34, color: c.label }} numberOfLines={1} adjustsFontSizeToFit>{x.value}</T>
                <T style={{ fontSize: 13, color: c.secondary }}>{x.label}</T>
              </View>
            </React.Fragment>
          ))}
        </View>

        {/* One calendar for everything (gym, habits, goals, quitting). */}
        <Pressable onPress={() => router.push('/calendar')} accessibilityRole="button" style={({ pressed }) => [s.group, s.row, { backgroundColor: pressed ? c.press : c.card, marginTop: 10 }]}>
          <View style={[s.icon, { backgroundColor: c.fill }]}>
            <Ionicons name="calendar-outline" size={18} color={c.label} />
          </View>
          <View style={s.rowBody}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <T style={{ fontSize: 17, lineHeight: 24, color: c.label }}>التقويم</T>
              <T style={{ fontSize: 13, lineHeight: 18, color: c.secondary }} numberOfLines={1}>الجيم والعادات والأهداف وبطّل على شهر واحد</T>
            </View>
            <Ionicons name="chevron-back" size={18} color={c.tertiary} />
          </View>
        </Pressable>

        {goal && next ? (
          <>
            <Header c={c} text="خطوتك الجاية" />
            <View style={[s.group, s.row, { backgroundColor: c.card }]}>
              <Pressable
                onPress={() => {
                  tap();
                  saveGoal(toggleTask(goal, next.task.id, today));
                }}
                hitSlop={10}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: false }}
                accessibilityLabel={`خلّصت: ${next.task.title}`}
                style={({ pressed }) => [s.tick, { borderColor: pressed ? c.tint : c.tertiary }]}
              />
              <Pressable
                onPress={() => router.push(`/goals/${goal.id}`)}
                accessibilityRole="button"
                style={({ pressed }) => [s.rowBody, { opacity: pressed ? 0.5 : 1 }]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T style={{ fontSize: 17, lineHeight: 24, color: c.label }}>{next.task.title}</T>
                  <T style={{ fontSize: 13, lineHeight: 18, color: c.secondary }} numberOfLines={1}>{goal.name}</T>
                </View>
                <Ionicons name="chevron-back" size={18} color={c.tertiary} />
              </Pressable>
            </View>
          </>
        ) : null}

        {verse ? (
          <>
            <Header c={c} text={`آية اليوم · ${verse.surah}`} />
            <View style={[s.group, { backgroundColor: c.card, paddingHorizontal: 16, paddingVertical: 14 }]}>
              <T style={{ fontFamily: F.quran, fontSize: 21, lineHeight: 42, color: c.label, textAlign: 'center', writingDirection: 'rtl' }}>{`﴿ ${verse.text.map(glueMarks).join(' ۝ ')} ﴾`}</T>
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({ c, text }: { c: Ios; text: string }) {
  return <T style={{ fontSize: 13, color: c.secondary, marginTop: 24, marginBottom: 7, marginStart: 16 }}>{text}</T>;
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 8, height: 44 },
  barBtn: { minWidth: 44, height: 44, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: 16, paddingBottom: 40 },
  group: { borderRadius: 10, overflow: 'hidden' },
  stats: { flexDirection: 'row', paddingVertical: 14 },
  stat: { flex: 1, alignItems: 'center', gap: 2, paddingHorizontal: 6 },
  row: { flexDirection: 'row', alignItems: 'center', paddingStart: 16, minHeight: 60 },
  icon: { width: 30, height: 30, borderRadius: 7, alignItems: 'center', justifyContent: 'center', marginEnd: 12 },
  rowBody: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'stretch', paddingVertical: 10, paddingEnd: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  cell: { width: '31.5%' },
  tile: { alignItems: 'center', justifyContent: 'center', gap: 3, height: 100, paddingHorizontal: 6, borderRadius: 12, borderWidth: 1.5 },
  tileIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 3 },
  tick: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, marginEnd: 14 },
});
