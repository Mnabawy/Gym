import React, { useState } from 'react';
import { View } from 'react-native';
import { dayFor, MUSCLE_AR, PROGRAM } from '../../data/program';
import { ExerciseCard } from '../../components/ExerciseCard';
import { TimerBar } from '../../components/TimerBar';
import { router } from 'expo-router';
import { Btn, Card, DayChips, HeaderBtn, Ring, Screen, T, TagBadge } from '../../components/ui';
import { countAr, dateKey, DAYS } from '../../lib/logic';
import { daysBetween } from '../../lib/gaps';
import { after, currentWorkout, seqIndex } from '../../lib/schedule';
import { storage } from '../../lib/storage';
import { useDataVersion } from '../../lib/bus';
import { useTheme } from '../../theme';

export default function Workout() {
  const t = useTheme();
  const date = dateKey();
  const [picked, setPicked] = useState<{ date: string; id: number } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const { v, bump } = useDataVersion();

  // Workouts run in one sequence, not by weekday: open on the one after your last session (src/lib/schedule.ts).
  // Re-read on every render; the screen re-renders when the data version (v) changes.
  const cur = currentWorkout(storage.trainedDays(), date);
  const sel = picked?.date === date ? picked.id : cur.id; // a pick from yesterday doesn't stick
  const day = dayFor(sel)!;
  const pick = (id: number) => {
    setPicked({ date, id });
    setConfirm(false);
  };

  const chips = PROGRAM.map((d, i) => {
    const muscles = [...new Set(d.exercises.map((e) => e.muscle))];
    return {
      key: d.weekday,
      label: `تمرين ${i + 1}`,
      short: String(i + 1),
      colors: muscles.map((m) => t.muscle[m]),
      details: muscles.map((m) => ({ color: t.muscle[m], label: MUSCLE_AR[m] })),
    };
  });

  const ago = cur.last ? daysBetween(cur.last.date, date) : 0;
  const sub = cur.last
    ? `آخر تمرين: ${dayFor(cur.last.id)?.titleAr} · ${ago === 1 ? 'امبارح' : `من ${countAr(ago, DAYS)}`}`
    : 'برنامج 5 أيام · قوة وعضل';

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
      sub={sub}
      footer={<TimerBar />}
      action={<HeaderBtn icon="settings-outline" label="الإعدادات" onPress={() => router.push('/settings')} />}>
      <DayChips days={chips} value={sel} today={cur.id} onChange={pick} />

      <Card style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Ring value={total ? done / total : 0} size={64} stroke={5}>
          <T w="numBold" style={{ fontSize: 14, color: t.okText }}>{`${total ? Math.round((done / total) * 100) : 0}%`}</T>
        </Ring>
        <View style={{ flex: 1, gap: 2 }}>
          <T style={{ color: t.mute, fontSize: 13 }}>{`تمرين ${seqIndex(sel) + 1} من ${PROGRAM.length} · ${day.exercises.length} تمارين · ${done} من ${total} مجموعة`}</T>
          <T w="bold" style={{ fontSize: 18 }}>{day.titleAr}</T>
        </View>
        <T style={{ color: t.mute, fontSize: 12.5, alignSelf: 'flex-start' }}>{`~ ${minutes} د`}</T>
      </Card>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 2 }}>
        {(['heavy', 'fail', 'drop'] as const).map((k) => (
          <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <TagBadge tag={k} />
            <T style={{ color: t.mute, fontSize: 12 }}>{k === 'heavy' ? 'وقّف قبل الفشل' : k === 'fail' ? 'آخر مجموعة لحد الفشل' : 'آخر مجموعة دروب سِت'}</T>
          </View>
        ))}
      </View>
      {finished ? (
        <View style={{ backgroundColor: t.okSoft, borderRadius: 12, padding: 12 }}>
          <T w="medium" style={{ color: t.okText, fontSize: 13 }}>{`خلصت تمرين النهارده. الجاي: ${dayFor(after(cur.id))?.titleAr}`}</T>
        </View>
      ) : null}
      {sel !== cur.id ? (
        <View style={{ backgroundColor: t.warnSoft, borderRadius: 12, padding: 12 }}>
          <T style={{ color: t.warn, fontSize: 13 }}>
            {`ده مش التمرين اللي عليه الدور (الدور على ${dayFor(cur.id)?.titleAr}). لو سجّلت فيه النهارده، الترتيب هيكمّل من بعده.`}
          </T>
        </View>
      ) : null}
      {day.exercises.map((e, i) => (
        <ExerciseCard key={`${e.id}-${date}-${v}`} ex={e} index={i} date={date} weekday={sel} onChange={bump} />
      ))}
      <View style={{ gap: 8, marginTop: 6 }}>
        <T style={{ color: t.mute, fontSize: 12.5, lineHeight: 20 }}>
          اكتب الوزن والتكرارات وعلّم ✓ بعد كل مجموعة، وعداد الراحة هيشتغل لوحده. الأرقام الباهتة هي اللي لعبتها المرة اللي فاتت، ولو علّمت ✓ والخانة فاضية هياخدها.
        </T>
        {!confirm ? (
          <Btn label="امسح تسجيل النهارده للتمرين ده" onPress={() => setConfirm(true)} />
        ) : (
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <T style={{ color: t.mute }}>متأكد؟</T>
            <Btn label="أيوه امسح" kind="solid" onPress={() => { storage.clearDay(date, day.exercises.map((e) => e.id)); setConfirm(false); bump(); }} />
            <Btn label="لا" onPress={() => setConfirm(false)} />
          </View>
        )}
      </View>
    </Screen>
  );
}
