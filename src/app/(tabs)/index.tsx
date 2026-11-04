import React, { useState } from 'react';
import { View } from 'react-native';
import { dayFor, MUSCLE_AR, WEEKDAY_LETTERS_AR, WEEKDAYS_AR } from '../../data/program';
import { ExerciseCard } from '../../components/ExerciseCard';
import { TimerBar } from '../../components/TimerBar';
import { Btn, Card, DayChips, Progress, Screen, T, TagBadge } from '../../components/ui';
import { dateKey } from '../../lib/logic';
import { storage } from '../../lib/storage';
import { useDataVersion } from '../../lib/bus';
import { useTheme } from '../../theme';

export default function Workout() {
  const t = useTheme();
  const now = new Date();
  const today = now.getDay();
  const date = dateKey(now);
  const [sel, setSel] = useState(today);
  const [confirm, setConfirm] = useState(false);
  const { v, bump } = useDataVersion();
  const day = dayFor(sel);

  const chips = WEEKDAYS_AR.map((label, i) => {
    const d = dayFor(i);
    const muscles = d ? [...new Set(d.exercises.map((e) => e.muscle))] : [];
    return {
      key: i,
      label,
      short: WEEKDAY_LETTERS_AR[i],
      colors: muscles.map((m) => t.muscle[m]),
      details: d ? muscles.map((m) => ({ color: t.muscle[m], label: MUSCLE_AR[m] })) : [{ label: 'راحة' }],
    };
  });

  // Logging always goes to today's date; other days are view/plan mode with today's date too (log ahead if you train off-schedule).
  // Re-read on every render; the screen re-renders when the data version (v) changes.
  let done = 0, total = 0;
  for (const e of day?.exercises ?? []) {
    total += e.sets;
    done += storage.setsFor(date, e.id).filter((x) => x.done).length;
  }

  return (
    <Screen title="تمرين النهارده" sub="برنامج 5 أيام · قوة وعضل" footer={<TimerBar />}>
      <DayChips days={chips} value={sel} today={today} onChange={(k) => { setSel(k); setConfirm(false); }} />

      {!day ? (
        <Card style={{ padding: 24, alignItems: 'center', borderStyle: 'dashed' }}>
          <T w="bold" style={{ fontSize: 18 }}>{`${WEEKDAYS_AR[sel]} · يوم راحة`}</T>
          <T style={{ color: t.mute, textAlign: 'center', marginTop: 4 }}>العضلة بتكبر وانت مرتاح. نام كويس، واشرب مية، وكُل زي نظامك.</T>
        </Card>
      ) : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <T w="bold" style={{ fontSize: 18 }}>{`${WEEKDAYS_AR[sel]} · ${day.titleAr}`}</T>
            <T w="numRegular" style={{ color: t.mute, fontSize: 13 }}>{`${done} / ${total}`}</T>
          </View>
          <Progress value={total ? done / total : 0} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {(['heavy', 'fail', 'drop'] as const).map((k) => (
              <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <TagBadge tag={k} />
                <T style={{ color: t.mute, fontSize: 12 }}>{k === 'heavy' ? 'وقّف قبل الفشل' : k === 'fail' ? 'آخر مجموعة لحد الفشل' : 'آخر مجموعة دروب سِت'}</T>
              </View>
            ))}
          </View>
          {sel !== today ? (
            <View style={{ backgroundColor: t.warnSoft, borderRadius: 10, padding: 10 }}>
              <T style={{ color: t.warn, fontSize: 13 }}>ده مش يوم النهارده. لو هتلعبه النهارده، اللي هتسجله هيتحفظ بتاريخ النهارده.</T>
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
              <Btn label="امسح تسجيل النهارده لليوم ده" onPress={() => setConfirm(true)} />
            ) : (
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <T style={{ color: t.mute }}>متأكد؟</T>
                <Btn label="أيوه امسح" kind="solid" onPress={() => { storage.clearDay(date, day.exercises.map((e) => e.id)); setConfirm(false); bump(); }} />
                <Btn label="لا" onPress={() => setConfirm(false)} />
              </View>
            )}
          </View>
        </>
      )}
    </Screen>
  );
}
