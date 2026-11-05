import React, { useCallback, useState } from 'react';
import { LayoutAnimation, Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { dayFor, exerciseById } from '../../data/program';
import { ExerciseRow } from '../../components/ExerciseRow';
import { WorkoutChips } from '../../components/WorkoutChips';
import { TimerBar } from '../../components/TimerBar';
import { router, useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { Btn, Card, Ring, Screen, T } from '../../components/ui';
import { MenuButton } from '../../components/SideMenu';
import { dateKey } from '../../lib/logic';
import { after, currentWorkout } from '../../lib/schedule';
import { storage } from '../../lib/storage';
import { useSettings } from '../../lib/settings';
import { useDataVersion } from '../../lib/bus';
import { BACKUP_STALE_DAYS, LAST_BACKUP_KEY } from '../../lib/backup';
import { daysBetween } from '../../lib/gaps';
import { SWAPS_KEY, swappedSet } from '../../lib/journal';
import { readStrings } from '../../lib/meta';
import { sessionSummary } from '../../lib/summary';
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
  // Which exercise is open: the one you tapped, else the first one not finished (it moves on by itself as you tick).
  const [tapped, setTapped] = useState<string | null>(null);
  const pick = (id: number) => {
    setPicked({ date, id });
    setTapped(null);
    setConfirm(false);
  };
  const openOne = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.create(180, 'easeInEaseOut', 'opacity'));
    setTapped(id);
  };

  // Logging always goes to today's date, whichever workout is open.
  let done = 0, total = 0;
  const doneBy: Record<string, number> = {};
  for (const e of day.exercises) {
    total += e.sets;
    doneBy[e.id] = storage.setsFor(date, e.id).slice(0, e.sets).filter((x) => x.done).length;
    done += doneBy[e.id];
  }
  const openId = tapped && day.exercises.some((e) => e.id === tapped) ? tapped : day.exercises.find((e) => doneBy[e.id] < e.sets)?.id;
  // Finished exercises go to the bottom (as one-line summaries), each keeping its number.
  const order = [...day.exercises.filter((e) => doneBy[e.id] < e.sets), ...day.exercises.filter((e) => doneBy[e.id] >= e.sets)];

  // Rough session length: each set's work (~45 s) plus its rest.
  const minutes = Math.round(day.exercises.reduce((a, e) => a + e.sets * (e.restSec + 45), 0) / 60);
  const finished = cur.started && sel === cur.id && total > 0 && done >= total;

  return (
    <Screen
      title="تمرين النهارده"
      dense
      footer={<TimerBar />}
      action={<MenuButton />}>
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
      {finished ? <DoneCard date={date} weekday={sel} next={dayFor(after(cur.id))?.titleAr ?? ''} /> : null}
      {sel !== cur.id ? (
        <View style={{ backgroundColor: t.warnSoft, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12 }}>
          <T style={{ color: t.warn, fontSize: 13 }}>{`الدور على: ${dayFor(cur.id)?.titleAr}`}</T>
        </View>
      ) : null}
      <Card style={{ overflow: 'hidden' }}>
        {order.map((e, pos) => (
          <ExerciseRow
            key={`${e.id}-${date}-${cards}`}
            ex={e}
            index={day.exercises.indexOf(e)}
            date={date}
            weekday={sel}
            first={pos === 0}
            open={e.id === openId}
            onOpen={() => openOne(e.id)}
            onChange={(fin) => {
              // Last set ticked on the line: it drops to the bottom as a summary and the next exercise opens.
              if (fin) {
                LayoutAnimation.configureNext(LayoutAnimation.create(220, 'easeInEaseOut', 'opacity'));
                setTapped(null);
              }
              bump();
            }}
          />
        ))}
      </Card>
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

/** After the last set of the day: what you did, how it compares with last time, new records, and a backup nudge. */
function DoneCard({ date, weekday, next }: { date: string; weekday: number; next: string }) {
  const t = useTheme();
  const sum = sessionSummary(storage.allSets(), date, weekday, swappedSet(readStrings(SWAPS_KEY)));
  const lastBackup = storage.getMeta(LAST_BACKUP_KEY);
  const since = lastBackup ? daysBetween(lastBackup, date) : null;
  const nudge = since == null || since >= BACKUP_STALE_DAYS;
  const pct = sum.change != null ? Math.round(sum.change * 100) : null;
  const tiles = [
    { v: String(sum.sets), l: 'مجموعة' },
    { v: String(sum.reps), l: 'تكرار' },
    { v: sum.volume.toLocaleString('en-US'), l: 'كجم حجم' },
  ];
  return (
    <Card style={{ paddingVertical: 10, paddingHorizontal: 12, gap: 8, borderWidth: 1, borderColor: t.ok }}>
      <T w="bold" style={{ color: t.okText, fontSize: 15 }}>{`خلصت تمرين النهارده ✓`}</T>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {tiles.map((x) => (
          <View key={x.l} style={{ flex: 1, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 8, backgroundColor: t.soft }}>
            <T w="numBold" style={{ fontSize: 15 }}>{x.v}</T>
            <T style={{ fontSize: 11, color: t.mute }}>{x.l}</T>
          </View>
        ))}
      </View>
      {pct != null ? (
        <T style={{ fontSize: 12.5, color: pct >= 0 ? t.okText : t.warn }}>
          {pct === 0 ? 'نفس حجم آخر مرة' : `الحجم ${pct > 0 ? 'زاد' : 'قلّ'} \u2066${Math.abs(pct)}%\u2069 عن آخر مرة (\u2066${sum.prev!.date.slice(5)}\u2069)`}
        </T>
      ) : (
        <T style={{ fontSize: 12.5, color: t.mute }}>أول مرة تسجّل التمرين ده، المرة الجاية هنقارن بيها.</T>
      )}
      {sum.prs.length ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="trophy" size={14} color="#E0A400" />
          <T w="num" style={{ fontSize: 12.5, flex: 1 }}>{`أرقام جديدة: ${sum.prs.map((id) => exerciseById(id)?.name ?? id).join('، ')}`}</T>
        </View>
      ) : null}
      <T style={{ fontSize: 12.5, color: t.mute }}>{`الجاي: ${next}`}</T>
      {nudge ? (
        <Pressable onPress={() => router.push('/settings')} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: t.warnSoft, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10, opacity: pressed ? 0.7 : 1 })}>
          <Ionicons name="cloud-upload-outline" size={15} color={t.warn} />
          <T style={{ fontSize: 12.5, color: t.warn, flex: 1 }}>{since == null ? 'لسه ما عملتش نسخة احتياطية. اعملها من الإعدادات' : `آخر نسخة احتياطية من ${since} يوم. اعمل واحدة جديدة`}</T>
        </Pressable>
      ) : null}
    </Card>
  );
}
