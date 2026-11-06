import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { HeaderBtn, Ring, T } from '../components/ui';
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
import { clean, milestone, runLabel } from '../lib/quit';
import { useNow } from '../lib/useNow';
import { NightCard } from '../components/QuitHero';
import { F, ThemeProvider, tint, useTheme, useWarm, type Theme } from '../theme';

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
 * أقسامك as tiles of different sizes: the gym (tall: next workout, this week, next meal), habits (done today, streak),
 * goals (dark: how far), your next goal step with a tick, and a verse of the day. Tap a tile to open its section.
 */
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

  const verse = SHORT[Math.abs(daysBetween('2026-01-01', today)) % SHORT.length];
  const blue = t.sec.gym;
  const pink = t.sec.habits;

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
          {/* The gym: tall, on the start side. */}
          <Tile t={t} bg={tint(blue, 0.18)} here={here === 'gym'} onPress={() => go('gym')} style={{ flex: 1 }} label="الجيم">
            <Ionicons name="barbell" size={44} color={blue} style={{ alignSelf: 'center', marginVertical: 12 }} />
            <T w="bold" style={{ fontSize: 22 }} numberOfLines={1} adjustsFontSizeToFit>{trained.has(today) ? 'اتمرنت ✓' : day?.titleAr ?? 'التمرين'}</T>
            <T style={{ fontSize: 12.5, color: t.mute }}>{trained.has(today) ? 'شغل حلو النهارده' : `التمرين الجاي · ${day?.exercises.length ?? 0} تمارين`}</T>
            <View style={s.ticks}>
              {Array.from({ length: target }, (_, i) => (
                <View key={i} style={[s.tick, { backgroundColor: i < weekDone ? t.fg : tint(blue, 0.25) }]} />
              ))}
            </View>
            <T style={{ fontSize: 12.5, color: t.mute }}>{`${weekDone} من ${target} الأسبوع ده`}</T>
            <View style={[s.rule, { backgroundColor: tint(t.fg, 0.08) }]} />
            <T style={{ fontSize: 12.5 }}>{meal ? `🍽 ${meal} ${MEAL_TIME[meal][training ? 'training' : 'rest']}` : '🍽 كمّلت وجبات النهارده ✓'}</T>
            <T style={{ fontSize: 12.5, color: t.mute }}>{`${eaten.length} من ${MEAL_ORDER.length} وجبات`}</T>
          </Tile>

          <View style={{ flex: 1, gap: 12 }}>
            <Tile t={t} bg={tint(pink, 0.16)} here={here === 'habits'} onPress={() => go('habits')} label="العادات">
              {habits.length ? (
                <>
                  <View style={{ flexDirection: 'row', direction: 'ltr', alignSelf: 'flex-start', alignItems: 'baseline', marginTop: 8 }}>
                    <T w="numBold" style={{ fontSize: 40, lineHeight: 48 }}>{String(done)}</T>
                    <T w="numBold" style={{ fontSize: 20, color: t.mute }}>{`/${due.length}`}</T>
                  </View>
                  <T style={{ fontSize: 12.5, color: t.mute }}>{streak > 1 ? `🔥 ${streak} يوم ورا بعض` : due.length && done === due.length ? 'كمّلت النهارده ✓' : 'النهارده'}</T>
                </>
              ) : (
                <T w="semi" style={{ fontSize: 15, marginTop: 10 }}>ابدأ أول عادة</T>
              )}
            </Tile>
            <Tile t={t} bg={t.fg} here={here === 'goals'} onPress={() => go('goals')} label="الأهداف" dark>
              {goal ? (
                <>
                  <T w="numBold" style={{ fontSize: 40, lineHeight: 50, color: t.bg, marginTop: 8 }}>{`${Math.floor(progress(goal) * 100)}%`}</T>
                  <T style={{ fontSize: 12.5, color: tint(t.bg, 0.7) }} numberOfLines={2}>{goal.name}</T>
                </>
              ) : (
                <T w="semi" style={{ fontSize: 15, marginTop: 10, color: t.bg }}>حدّد هدفك الكبير</T>
              )}
            </Tile>
          </View>
        </View>

        <Pressable onPress={() => go('quit')} accessibilityRole="button" accessibilityLabel="بطّل" style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.98 : 1 }] })}>
          <NightCard color={t.sec.quit} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderWidth: 2, borderColor: here === 'quit' ? t.sec.quit : 'transparent' }}>
            <View style={{ flex: 1, gap: 2 }}>
              <T style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.65)' }}>بطّل</T>
              <T w="bold" style={{ fontSize: 22, color: '#FFFFFF' }}>{quit ? `${runLabel(clean(quit, now).ms)} نضيف` : 'عادة عايز تبطّلها؟'}</T>
              <T style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.6)' }}>{quit ? (quits.length > 1 ? `${quits.length} عادات بتبطّلها` : 'كمّل، انت ماشي صح') : 'عداد نضيف وزرار للإلحاح'}</T>
            </View>
            {quit ? (
              <View style={{ borderRadius: 30, boxShadow: `0px 0px 14px ${t.sec.quit}88` }}>
                <Ring value={milestone(clean(quit, now).ms).share} size={60} stroke={6} color={t.sec.quit} track="rgba(255,255,255,0.12)">
                  <Ionicons name="hand-left" size={20} color="#FFFFFF" />
                </Ring>
              </View>
            ) : (
              <Ionicons name="hand-left" size={34} color={t.sec.quit} />
            )}
          </NightCard>
        </Pressable>

        {goal && next ? (
          <Pressable onPress={() => router.push(`/goals/${goal.id}`)} accessibilityRole="button" style={({ pressed }) => [s.card, { backgroundColor: t.card, opacity: pressed ? 0.85 : 1 }]}>
            <Ionicons name="flag" size={26} color={t.ok} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <T style={{ fontSize: 12.5, color: t.mute }}>خطوتك الجاية</T>
              <T w="bold" style={{ fontSize: 16, lineHeight: 25 }}>{next.task.title}</T>
            </View>
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
          </Pressable>
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

function Tile({ t, bg, here, onPress, label, dark, style, children }: { t: Theme; bg: string; here: boolean; onPress: () => void; label: string; dark?: boolean; style?: object; children: React.ReactNode }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [s.tile, { backgroundColor: bg, borderColor: here ? (dark ? t.ok : t.fg) : 'transparent', transform: [{ scale: pressed ? 0.97 : 1 }] }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <T style={{ fontSize: 13.5, color: dark ? tint(t.bg, 0.7) : t.mute, flex: 1 }}>{label}</T>
        {here ? <View style={[s.dot, { backgroundColor: dark ? t.ok : t.fg }]} /> : null}
      </View>
      {children}
    </Pressable>
  );
}

const s = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 40, gap: 12 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 4 },
  grid: { flexDirection: 'row', gap: 12 },
  tile: { borderRadius: 26, padding: 16, borderWidth: 2, flexGrow: 1 },
  ticks: { flexDirection: 'row', gap: 5, marginTop: 12, marginBottom: 6 },
  tick: { flex: 1, height: 26, borderRadius: 7 },
  rule: { height: 1, marginVertical: 10 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 24, padding: 16 },
  done: { width: 46, height: 46, borderRadius: 23, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
