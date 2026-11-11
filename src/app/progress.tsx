import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { ALL_EXERCISES, MUSCLE_AR, PROGRAM, WEEKDAYS_AR, type Muscle } from '../data/program';
import { Card, ColorChip, Label, Pill, Progress, Ring, Screen, T } from '../components/ui';
import { E1rmChart } from '../components/E1rmChart';
import { bestE1rm, dateKey } from '../lib/logic';
import { storage } from '../lib/storage';
import { useDataVersion } from '../lib/bus';
import { dayKey, SWAPS_KEY } from '../lib/journal';
import { readStrings } from '../lib/meta';
import { exerciseInfo, PAST_KEY, parsePast } from '../lib/programEdit';
import { useTheme } from '../theme';

const TARGET = 10;

function weekRange(d = new Date()) {
  // Saturday-start week (matches the Egyptian week)
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 1) % 7));
  const end = new Date(x);
  end.setDate(end.getDate() + 6);
  return { from: dateKey(x), to: dateKey(end) };
}

export default function ProgressScreen() {
  const t = useTheme();
  const [sel, setSel] = useState(PROGRAM[0].exercises[0].id);
  const { from, to } = weekRange();

  useDataVersion((s) => s.v); // re-render after new logs
  // Exercises you logged that aren't in the program any more (deleted or replaced at /program): their history stays here.
  const past = parsePast(storage.getMeta(PAST_KEY));
  const info = (id: string) => exerciseInfo(id, ALL_EXERCISES, past);
  const gone = [...new Set(storage.allSets().filter((r) => r.kg != null || r.reps != null).map((r) => r.exId))].filter((id) => !ALL_EXERCISES.some((e) => e.id === id) && info(id));
  const ex = info(sel) ?? { name: sel, muscle: ALL_EXERCISES[0].muscle };
  const week = (() => {
    const done = storage.doneSetsBetween(from, to);
    const perMuscle = {} as Record<Muscle, number>;
    for (const m of Object.keys(MUSCLE_AR) as Muscle[]) perMuscle[m] = 0;
    for (const d of done) {
      const e = info(d.exId);
      if (e) perMuscle[e.muscle] += d.n;
    }
    return { perMuscle, sessions: storage.sessionDates(from, to).length };
  })();



  const hist = storage.history(sel).filter((h) => h.sets.some((s) => s.kg && s.reps));
  // Days you swapped this exercise for another one stay in the list (marked) but out of the chart.
  const swaps = readStrings(SWAPS_KEY);
  const points = hist.filter((h) => !swaps[dayKey(h.date, sel)]).map((h) => ({ date: h.date, v: bestE1rm(h.sets) }));

  return (
    <Screen title="التقدم" sub="الأسبوع بيبدأ السبت" onBack={() => router.back()}>

      <Card style={{ padding: 14, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Ring value={week.sessions / 5} size={64} stroke={5}>
            <T w="numBold" style={{ fontSize: 15, color: t.okText }}>{`${week.sessions}/5`}</T>
          </Ring>
          <View style={{ flex: 1, gap: 2 }}>
            <T w="bold" style={{ fontSize: 18 }}>الأسبوع ده</T>
            <T style={{ color: t.mute, fontSize: 12.5 }}>{`تمرينات خلصتها · مجموعات كل عضلة (الهدف ${TARGET} أو أكتر)`}</T>
          </View>
        </View>
        {(Object.keys(MUSCLE_AR) as Muscle[]).map((m) => (
          <View key={m} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <T style={{ width: 92, fontSize: 13 }}>{MUSCLE_AR[m]}</T>
            <View style={{ flex: 1 }}>
              <Progress value={week.perMuscle[m] / TARGET} color={t.muscle[m]} height={8} />
            </View>
            <T w="num" style={{ width: 26, fontSize: 13, textAlign: 'center' }}>{week.perMuscle[m]}</T>
          </View>
        ))}
      </Card>

      <T w="bold" style={{ fontSize: 17, marginTop: 6 }}>تمرين بتمرين</T>
      {PROGRAM.map((d) => (
        <View key={d.weekday} style={{ gap: 8 }}>
          <Label>{`${WEEKDAYS_AR[d.weekday]} · ${d.titleAr}`}</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {d.exercises.map((e) => (
              <Pill key={e.id} label={e.name} num on={e.id === sel} onPress={() => setSel(e.id)} />
            ))}
          </View>
        </View>
      ))}
      {gone.length ? (
        <View style={{ gap: 8 }}>
          <Label>اتشالت من البرنامج</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {gone.map((id) => (
              <Pill key={id} label={info(id)!.name} num on={id === sel} onPress={() => setSel(id)} />
            ))}
          </View>
        </View>
      ) : null}

      <Card style={{ padding: 14, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <T w="num" style={{ fontSize: 17, flex: 1 }}>{ex.name}</T>
          <ColorChip label={MUSCLE_AR[ex.muscle]} color={t.muscle[ex.muscle]} size={12.5} />
        </View>
        <T style={{ color: t.mute, fontSize: 12.5 }}>أقصى وزن متوقع لتكرار واحد (معادلة Epley) من أحسن مجموعة في كل مرة</T>
        <E1rmChart points={points} color={t.muscle[ex.muscle]} />
        {hist.slice().reverse().slice(0, 8).map((h) => (
          <View key={h.date} style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: t.line, paddingTop: 8 }}>
            <View style={{ flexShrink: 1 }}>
              <T w="numRegular" style={{ color: t.mute, fontSize: 13 }}>{h.date}</T>
              {swaps[dayKey(h.date, sel)] ? <T w="num" style={{ color: t.warn, fontSize: 11 }} numberOfLines={1}>{swaps[dayKey(h.date, sel)]}</T> : null}
            </View>
            <T w="num" style={{ fontSize: 13 }}>
              {h.sets.filter((s) => s.kg || s.reps).map((s) => `${s.kg ?? '–'}×${s.reps ?? '–'}`).join('  ')}
            </T>
          </View>
        ))}
      </Card>
    </Screen>
  );
}
