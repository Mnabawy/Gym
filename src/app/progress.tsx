import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ALL_EXERCISES, MONTHS_AR, MUSCLE_AR, PLAN_WEEKDAYS, PROGRAM, WEEKDAYS_AR, type Muscle } from '../data/program';
import { Card, ColorChip, Label, Pill, Progress, Ring, Screen, T } from '../components/ui';
import { E1rmChart } from '../components/E1rmChart';
import { gapText } from '../components/GapCard';
import { useReport } from '../lib/useReport';
import { bestE1rm, countAr, dateKey, monthCells, monthStats } from '../lib/logic';
import { storage } from '../lib/storage';
import { useDataVersion } from '../lib/bus';
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
  const ex = ALL_EXERCISES.find((e) => e.id === sel)!;
  const { from, to } = weekRange();

  useDataVersion((s) => s.v); // re-render after new logs
  const week = (() => {
    const done = storage.doneSetsBetween(from, to);
    const perMuscle = {} as Record<Muscle, number>;
    for (const m of Object.keys(MUSCLE_AR) as Muscle[]) perMuscle[m] = 0;
    for (const d of done) {
      const e = ALL_EXERCISES.find((x) => x.id === d.exId);
      if (e) perMuscle[e.muscle] += d.n;
    }
    return { perMuscle, sessions: storage.sessionDates(from, to).length };
  })();

  const now = new Date();
  const trainedDays = storage.trainedDays();
  const month = monthStats(monthCells(now.getFullYear(), now.getMonth()), new Set(trainedDays.map((d) => d.date)), PLAN_WEEKDAYS, dateKey(now), trainedDays[0]?.date);

  const report = useReport();
  const top = report.gaps[0];

  const hist = storage.history(sel).filter((h) => h.sets.some((s) => s.kg && s.reps));
  const points = hist.map((h) => ({ date: h.date, v: bestE1rm(h.sets) }));

  return (
    <Screen title="التقدم" sub="الأسبوع بيبدأ السبت" onBack={() => router.back()}>
      <Pressable onPress={() => router.push('/gaps')} accessibilityRole="button" style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
        <Card style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Ring value={report.score ?? 0} size={54} stroke={5}>
            <T w="numBold" style={{ fontSize: 13, color: t.okText }}>{report.score == null ? '–' : `${Math.round(report.score * 100)}%`}</T>
          </Ring>
          <View style={{ flex: 1, gap: 2 }}>
            <T w="bold" style={{ fontSize: 16 }}>إيه اللي ناقصك؟</T>
            <T style={{ color: t.mute, fontSize: 12.5 }}>
              {!report.since ? 'هيبان هنا بعد أول تمرين تسجّله' : report.gaps.length ? `${countAr(report.gaps.length, ['حاجة واحدة', 'حاجتين', 'حاجات', 'حاجة'])} ${report.gaps.length === 2 ? 'محتاجين' : 'محتاجة'} تركيز` : 'مفيش حاجة ناقصة، كمّل كده'}
            </T>
            {top ? (
              <T w="medium" style={{ fontSize: 13, color: top.level === 2 ? t.warn : t.fg }} numberOfLines={1}>
                {gapText(top, report).title}
              </T>
            ) : null}
          </View>
          <Ionicons name="chevron-back" size={20} color={t.mute} />
        </Card>
      </Pressable>

      <Card style={{ padding: 14, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
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

      <Pressable onPress={() => router.push('/attendance')} accessibilityRole="button" style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
        <Card style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: t.okSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="calendar" size={22} color={t.okText} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <T w="bold" style={{ fontSize: 16 }}>الكالندر</T>
            <T style={{ color: t.mute, fontSize: 12.5 }}>
              {`${MONTHS_AR[now.getMonth()]} · حضرت ${month.done} · فوّت ${month.missed}${month.rate == null ? '' : ` · ⁦${Math.round(month.rate * 100)}%⁩`}`}
            </T>
          </View>
          <Ionicons name="chevron-back" size={20} color={t.mute} />
        </Card>
      </Pressable>

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

      <Card style={{ padding: 14, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <T w="num" style={{ fontSize: 17, flex: 1 }}>{ex.name}</T>
          <ColorChip label={MUSCLE_AR[ex.muscle]} color={t.muscle[ex.muscle]} size={12.5} />
        </View>
        <T style={{ color: t.mute, fontSize: 12.5 }}>أقصى وزن متوقع لتكرار واحد (معادلة Epley) من أحسن مجموعة في كل مرة</T>
        <E1rmChart points={points} color={t.muscle[ex.muscle]} />
        {hist.slice().reverse().slice(0, 8).map((h) => (
          <View key={h.date} style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: t.line, paddingTop: 8 }}>
            <T w="numRegular" style={{ color: t.mute, fontSize: 13 }}>{h.date}</T>
            <T w="num" style={{ fontSize: 13 }}>
              {h.sets.filter((s) => s.kg || s.reps).map((s) => `${s.kg ?? '–'}×${s.reps ?? '–'}`).join('  ')}
            </T>
          </View>
        ))}
      </Card>
    </Screen>
  );
}
