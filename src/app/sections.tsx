import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Ring, Screen, T } from '../components/ui';
import { dayFor, MONTHS_AR, PLAN_WEEKDAYS, WEEKDAYS_AR } from '../data/program';
import { useDataVersion } from '../lib/bus';
import { readGoals } from '../lib/goalStore';
import { current, fmtAmount, nextTask, progress } from '../lib/goals';
import { habitStats, isDue, logKey } from '../lib/habits';
import { readHabitLog, readHabits } from '../lib/habitStore';
import { dateKey, weekdayOf } from '../lib/logic';
import { currentWorkout } from '../lib/schedule';
import { lastSection, openSection, type Section } from '../lib/section';
import { storage } from '../lib/storage';
import { DRIVE_NAME } from '../lib/drive';
import { addDays, weekStart } from '../lib/gaps';
import { glow, ThemeProvider, tint, useTheme, useWarm, type Theme } from '../theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export default function Sections() {
  return (
    <ThemeProvider value={useWarm()}>
      <Hub />
    </ThemeProvider>
  );
}

/** أقسامك: the gym, habits and goals as glowing tiles, each with where you are today; tap one to open it. */
function Hub() {
  const t = useTheme();
  useDataVersion((s) => s.v);
  const today = dateKey();
  const here = lastSection();
  const name = storage.getMeta(DRIVE_NAME)?.split(' ')[0];

  const trained = storage.trainedDays();
  const day = dayFor(currentWorkout(trained, today).id);
  const from = weekStart(today);
  const weekDone = trained.filter((d) => d.date >= from && d.date <= addDays(from, 6)).length;
  const habits = readHabits();
  const log = readHabitLog();
  const due = habits.filter((h) => isDue(h, today));
  const done = due.filter((h) => log[logKey(h.id, today)] === 'done').length;
  const streak = Math.max(0, ...habits.map((h) => habitStats(h, log, today).streak));
  const goals = readGoals();
  const g = goals[0];
  const next = g ? nextTask(g) : null;
  const trainedToday = trained.some((d) => d.date === today);

  const tiles: { key: Section; title: string; icon: IconName; color: string; line: string; share: number; ring: string }[] = [
    {
      key: 'gym',
      title: 'الجيم',
      icon: 'barbell',
      color: t.sec.gym,
      line: trainedToday ? 'اتمرنت النهارده ✓' : day ? `التمرين الجاي: ${day.titleAr} · ${day.exercises.length} تمارين` : 'التمرين والأكل والمشتريات',
      share: weekDone / PLAN_WEEKDAYS.length,
      ring: `${weekDone}/${PLAN_WEEKDAYS.length}`,
    },
    {
      key: 'habits',
      title: 'العادات',
      icon: 'checkmark-done',
      color: t.sec.habits,
      line: !habits.length ? 'ابدأ أول عادة' : !due.length ? 'مفيش عادات عليك النهارده' : done === due.length ? `كمّلت النهارده ✓${streak > 1 ? ` · 🔥 ${streak} يوم` : ''}` : `فاضل ${due.length - done} النهارده${streak > 1 ? ` · 🔥 ${streak} يوم` : ''}`,
      share: due.length ? done / due.length : 0,
      ring: due.length ? `${done}/${due.length}` : '—',
    },
    {
      key: 'goals',
      title: 'الأهداف',
      icon: 'flag',
      color: t.sec.goals,
      line: g ? `${g.name} · ${fmtAmount(current(g), g.unit)}` : 'حدّد هدفك الكبير وامشي ليه خطوة خطوة',
      share: g ? progress(g) : 0,
      ring: g ? `${Math.floor(progress(g) * 100)}%` : '—',
    },
  ];

  const wd = weekdayOf(today);
  const bits = [
    trainedToday ? null : day ? `تمرين ${day.titleAr}` : null,
    due.length - done > 0 ? `${due.length - done} عادات` : null,
    next ? `«${next.task.title}»` : null,
  ].filter(Boolean);

  return (
    <Screen title="أقسامك" onBack={router.canGoBack() ? () => router.back() : undefined}>
      <View style={{ gap: 2, marginBottom: 2 }}>
        <T style={{ color: t.mute, fontSize: 13 }}>{`${WEEKDAYS_AR[wd]} ${+today.slice(8)} ${MONTHS_AR[+today.slice(5, 7) - 1]}`}</T>
        <T w="bold" style={{ fontSize: 26, lineHeight: 38 }}>{name ? `أهلًا يا ${name} 👋` : 'أهلًا بيك 👋'}</T>
      </View>
      {tiles.map((c) => (
        <Tile {...c} key={c.key} t={t} here={c.key === here} onPress={() => (c.key === here && router.canGoBack() ? router.back() : openSection(c.key))} />
      ))}
      {bits.length ? (
        <View style={[s.today, { borderColor: t.border, backgroundColor: tint(t.ok, 0.04) }]}>
          <Ionicons name="flash" size={16} color={t.neon ? t.okText : t.ok} />
          <T style={{ flex: 1, fontSize: 13, color: t.mute, lineHeight: 20 }}>{`النهارده: ${bits.join(' · ')}`}</T>
        </View>
      ) : null}
    </Screen>
  );
}

function Tile({ t, title, icon, color, line, share, ring, here, onPress }: { t: Theme; title: string; icon: IconName; color: string; line: string; share: number; ring: string; here: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}: ${line}`}
      style={({ pressed }) => [
        s.tile,
        { backgroundColor: t.card, borderColor: tint(color, here ? 0.9 : 0.55), boxShadow: `0px 0px ${here ? 22 : 14}px ${tint(color, here ? 0.4 : 0.22)}`, transform: [{ scale: pressed ? 0.98 : 1 }] },
      ]}>
      <View style={[s.icon, { backgroundColor: tint(color, 0.14), borderColor: tint(color, 0.6), boxShadow: glow(t, color, 12) }]}>
        <Ionicons name={icon} size={28} color={color} />
      </View>
      <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <T w="bold" style={{ fontSize: 20, lineHeight: 30 }}>{title}</T>
          {here ? (
            <View style={[s.here, { backgroundColor: color }]}>
              <T w="semi" style={{ fontSize: 11, color: '#FFFFFF' }}>انت هنا</T>
            </View>
          ) : null}
        </View>
        <T style={{ fontSize: 13, color: t.mute, lineHeight: 20 }} numberOfLines={2}>{line}</T>
      </View>
      <View style={{ borderRadius: 31, boxShadow: `0px 0px 12px ${tint(color, 0.35)}` }}>
        <Ring value={share} size={62} stroke={6} color={color} track={tint(color, 0.15)}>
          <T w="numBold" style={{ fontSize: 14, color }}>{ring}</T>
        </Ring>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  tile: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 24, borderWidth: 1.5, minHeight: 104 },
  icon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  here: { borderRadius: 9, paddingHorizontal: 8, paddingVertical: 1 },
  today: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderStyle: 'dashed', borderRadius: 18, padding: 14, marginTop: 4 },
});
