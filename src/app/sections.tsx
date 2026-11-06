import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Screen, T } from '../components/ui';
import { dayFor } from '../data/program';
import { useDataVersion } from '../lib/bus';
import { readGoals } from '../lib/goalStore';
import { current, fmtAmount, nextTask, progress } from '../lib/goals';
import { isDue, logKey } from '../lib/habits';
import { readHabitLog, readHabits } from '../lib/habitStore';
import { dateKey } from '../lib/logic';
import { currentWorkout } from '../lib/schedule';
import { lastSection, openSection, type Section } from '../lib/section';
import { storage } from '../lib/storage';
import { DRIVE_NAME } from '../lib/drive';
import { tint, useTheme } from '../theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** أقسامك: the gym, habits and goals, each with a line on where you are today. Opens the one you tap. */
export default function Sections() {
  const t = useTheme();
  useDataVersion((s) => s.v);
  const today = dateKey();
  const here = lastSection();
  const name = storage.getMeta(DRIVE_NAME)?.split(' ')[0];

  const day = dayFor(currentWorkout(storage.trainedDays(), today).id);
  const habits = readHabits();
  const log = readHabitLog();
  const due = habits.filter((h) => isDue(h, today));
  const done = due.filter((h) => log[logKey(h.id, today)] === 'done').length;
  const goals = readGoals();
  const g = goals[0];
  const next = g ? nextTask(g) : null;

  const cards: { key: Section; title: string; icon: IconName; color: string; line: string; sub?: string; share?: number; badge?: string }[] = [
    { key: 'gym', title: 'الجيم', icon: 'barbell', color: '#0072B2', line: day ? `التمرين الجاي: ${day.titleAr}` : 'التمرين والأكل والمشتريات', sub: 'التمرين · الأكل · المشتريات' },
    {
      key: 'habits',
      title: 'العادات',
      icon: 'checkmark-circle',
      color: '#CC79A7',
      line: !habits.length ? 'ابدأ أول عادة' : !due.length ? 'مفيش عادات عليك النهارده' : done === due.length ? 'كمّلت عادات النهارده ✓' : `${done} من ${due.length} النهارده`,
      share: due.length ? done / due.length : undefined,
    },
    {
      key: 'goals',
      title: 'الأهداف',
      icon: 'flag',
      color: '#009E73',
      line: g ? g.name : 'حدّد هدفك الكبير وامشي ليه خطوة خطوة',
      badge: g ? `${Math.floor(progress(g) * 100)}%` : undefined,
      sub: g ? `${fmtAmount(current(g), g.unit)} من ${fmtAmount(g.target, g.unit)}${next ? ` · الجاي: ${next.task.title}` : ''}` : undefined,
      share: g ? progress(g) : undefined,
    },
  ];

  return (
    <Screen title={name ? `أهلًا يا ${name}` : 'أقسامك'} sub="اختار القسم اللي عايز تدخله" onBack={router.canGoBack() ? () => router.back() : undefined}>
      {cards.map((c) => {
        const on = c.key === here;
        return (
          <Pressable
            key={c.key}
            onPress={() => (on && router.canGoBack() ? router.back() : openSection(c.key))}
            accessibilityRole="button"
            accessibilityLabel={`${c.title}: ${c.line}`}
            style={({ pressed }) => [s.card, { backgroundColor: t.card, boxShadow: t.shadow, borderColor: on ? c.color : t.neon ? t.border : 'transparent', opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
            <View style={[s.icon, { backgroundColor: tint(c.color, 0.15) }]}>
              <Ionicons name={c.icon} size={30} color={c.color} />
            </View>
            <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <T w="bold" style={{ fontSize: 20 }}>{c.title}</T>
                {on ? (
                  <View style={[s.here, { backgroundColor: tint(c.color, 0.15) }]}>
                    <T w="semi" style={{ fontSize: 11, color: c.color }}>انت هنا</T>
                  </View>
                ) : null}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <T w="semi" style={{ fontSize: 14, flex: 1 }} numberOfLines={2}>{c.line}</T>
                {c.badge ? <T w="numBold" style={{ fontSize: 15, color: c.color }}>{c.badge}</T> : null}
              </View>
              {c.sub ? <T style={{ fontSize: 12.5, color: t.mute }} numberOfLines={1}>{c.sub}</T> : null}
              {c.share != null ? (
                <View style={[s.bar, { backgroundColor: tint(c.color, 0.15) }]}>
                  <View style={{ width: `${Math.round(c.share * 100)}%`, height: '100%', borderRadius: 3, backgroundColor: c.color }} />
                </View>
              ) : null}
            </View>
            <Ionicons name="chevron-back" size={20} color={t.mute} />
          </Pressable>
        );
      })}
    </Screen>
  );
}

const s = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 22, borderWidth: 2, minHeight: 118 },
  icon: { width: 60, height: 60, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  here: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  bar: { height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 4 },
});
