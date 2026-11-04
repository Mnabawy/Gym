import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { dayFor } from '../../data/program';
import { ExerciseCard } from '../../components/ExerciseCard';
import { WorkoutChips } from '../../components/WorkoutChips';
import { TimerBar } from '../../components/TimerBar';
import { router, useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { Btn, Card, HeaderBtn, Ring, Screen, T } from '../../components/ui';
import { dateKey } from '../../lib/logic';
import { after, currentWorkout } from '../../lib/schedule';
import { storage } from '../../lib/storage';
import { useSettings } from '../../lib/settings';
import { useDataVersion } from '../../lib/bus';
import { neon, ThemeProvider, useTheme } from '../../theme';

/** The workout tab can use the neon theme (settings → وضع النيون; docs/mockups/workout-neon.html); the rest of the app keeps its own. */
export default function Workout() {
  const on = useSettings((s) => s.neonMode);
  // Dark screen: light status bar while this tab is open, back to automatic when you leave it.
  useFocusEffect(
    useCallback(() => {
      if (!on) return;
      setStatusBarStyle('light');
      return () => setStatusBarStyle('auto');
    }, [on]),
  );
  return (
    <ThemeProvider value={on ? neon : null}>
      <WorkoutScreen />
    </ThemeProvider>
  );
}

function WorkoutScreen() {
  const t = useTheme();
  const date = dateKey();
  const [picked, setPicked] = useState<{ date: string; id: number } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const { cards, bump, bumpAll } = useDataVersion();

  // Workouts run in one sequence, not by weekday: open on the one after your last session (src/lib/schedule.ts).
  // Re-read on every render; the screen re-renders when the data version (v) changes.
  const cur = currentWorkout(storage.trainedDays(), date);
  const sel = picked?.date === date ? picked.id : cur.id; // a pick from yesterday doesn't stick
  const day = dayFor(sel)!;
  const pick = (id: number) => {
    setPicked({ date, id });
    setConfirm(false);
  };

  // Logging always goes to today's date, whichever workout is open.
  let done = 0, total = 0;
  for (const e of day.exercises) {
    total += e.sets;
    done += storage.setsFor(date, e.id).slice(0, e.sets).filter((x) => x.done).length;
  }

  // Rough session length: each set's work (~45 s) plus its rest.
  const minutes = Math.round(day.exercises.reduce((a, e) => a + e.sets * (e.restSec + 45), 0) / 60);
  const finished = cur.started && sel === cur.id && total > 0 && done >= total;

  return (
    <Screen
      title="تمرين النهارده"
      dense
      footer={<TimerBar />}
      actionWidth={104}
      action={
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <HeaderBtn icon="settings-outline" label="الإعدادات" onPress={() => router.push('/settings')} />
          <HeaderBtn icon="stats-chart-outline" label="التقدم" onPress={() => router.push('/progress')} />
        </View>
      }>
      <WorkoutChips dense value={sel} current={cur.id} onChange={pick} />

      <Card style={{ paddingVertical: 8, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Ring value={total ? done / total : 0} size={46} stroke={4}>
          <T w="numBold" style={{ fontSize: 12, color: t.okText }}>{`${total ? Math.round((done / total) * 100) : 0}%`}</T>
        </Ring>
        <View style={{ flex: 1, gap: 1 }}>
          <T w="bold" style={{ fontSize: 17 }}>{day.titleAr}</T>
          <T w="num" style={{ color: t.mute, fontSize: 12 }}>{`\u2066${done} / ${total}\u2069 مجموعة · \u2066${minutes}\u2069 د`}</T>
        </View>
      </Card>
      {finished ? (
        <View style={{ backgroundColor: t.okSoft, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12 }}>
          <T w="medium" style={{ color: t.okText, fontSize: 13 }}>{`خلصت ✓ · الجاي: ${dayFor(after(cur.id))?.titleAr}`}</T>
        </View>
      ) : null}
      {sel !== cur.id ? (
        <View style={{ backgroundColor: t.warnSoft, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12 }}>
          <T style={{ color: t.warn, fontSize: 13 }}>{`الدور على: ${dayFor(cur.id)?.titleAr}`}</T>
        </View>
      ) : null}
      {day.exercises.map((e, i) => (
        <ExerciseCard key={`${e.id}-${date}-${cards}`} ex={e} index={i} date={date} weekday={sel} onChange={bump} />
      ))}
      <View style={{ gap: 8, marginTop: 4 }}>
        {!confirm ? (
          <Btn label="امسح تسجيل النهارده" onPress={() => setConfirm(true)} />
        ) : (
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <T style={{ color: t.mute }}>متأكد؟</T>
            <Btn label="أيوه امسح" kind="solid" onPress={() => { storage.clearDay(date, day.exercises.map((e) => e.id)); setConfirm(false); bumpAll(); }} />
            <Btn label="لا" onPress={() => setConfirm(false)} />
          </View>
        )}
      </View>
    </Screen>
  );
}
