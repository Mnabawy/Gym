import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import Svg, { Circle, Line, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { ALL_EXERCISES, MONTHS_AR, MUSCLE_AR, PLAN_WEEKDAYS, PROGRAM, WEEKDAYS_AR, type Muscle } from '../../data/program';
import { Card, ColorChip, Label, Pill, Progress, Ring, Screen, T } from '../../components/ui';
import { bestE1rm, dateKey, monthCells, monthStats } from '../../lib/logic';
import { storage } from '../../lib/storage';
import { useDataVersion } from '../../lib/bus';
import { F, useTheme } from '../../theme';

const TARGET = 10;

function weekRange(d = new Date()) {
  // Saturday-start week (matches the Egyptian week)
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 1) % 7));
  const end = new Date(x);
  end.setDate(end.getDate() + 6);
  return { from: dateKey(x), to: dateKey(end) };
}

function Chart({ points, color }: { points: { date: string; v: number }[]; color: string }) {
  const t = useTheme();
  const W = 320, H = 150, P = 28;
  if (points.length === 0) return <T style={{ color: t.mute, fontSize: 13 }}>لسه مفيش تسجيل للتمرين ده.</T>;
  const vs = points.map((p) => p.v);
  const min = Math.floor(Math.min(...vs) * 0.95), max = Math.ceil(Math.max(...vs) * 1.05) || 1;
  const x = (i: number) => (points.length === 1 ? W / 2 : P + (i * (W - P * 2)) / (points.length - 1));
  const y = (v: number) => H - P - ((v - min) / Math.max(1, max - min)) * (H - P * 1.6);
  const li = points.length - 1;
  const lv = String(points[li].v);
  const bw = lv.length * 7 + 14;
  const bx = Math.min(W - bw - 2, Math.max(2, x(li) - bw / 2));
  const by = Math.max(0, y(points[li].v) - 30);
  const grid = [0, 0.5, 1].map((f) => min + (max - min) * f);
  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
      {grid.map((g, i) => (
        <Line key={i} x1={P} x2={W - P} y1={y(g)} y2={y(g)} stroke={t.line} strokeWidth={1} />
      ))}
      <Line x1={x(li)} x2={x(li)} y1={by + 20} y2={H - P} stroke={color} strokeWidth={1.2} strokeDasharray="3 3" />
      <SvgText x={P - 4} y={y(max) + 4} fontSize={10} fill={t.mute} textAnchor="end" fontFamily={F.numRegular}>{String(max)}</SvgText>
      <SvgText x={P - 4} y={y(min) + 4} fontSize={10} fill={t.mute} textAnchor="end" fontFamily={F.numRegular}>{String(min)}</SvgText>
      <Polyline points={points.map((p, i) => `${x(i)},${y(p.v)}`).join(' ')} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" />
      {points.map((p, i) => (
        <Circle key={i} cx={x(i)} cy={y(p.v)} r={4} fill={color} stroke={t.card} strokeWidth={2} />
      ))}
      <Rect x={bx} y={by} width={bw} height={20} rx={10} fill={color} />
      <SvgText x={bx + bw / 2} y={by + 14} fontSize={11} fill="#FFFFFF" textAnchor="middle" fontFamily={F.numBold}>{lv}</SvgText>
      <SvgText x={x(0)} y={H - 8} fontSize={10} fill={t.mute} textAnchor="middle" fontFamily={F.numRegular}>{points[0].date.slice(5)}</SvgText>
      {points.length > 1 ? (
        <SvgText x={x(points.length - 1)} y={H - 8} fontSize={10} fill={t.mute} textAnchor="middle" fontFamily={F.numRegular}>{points[points.length - 1].date.slice(5)}</SvgText>
      ) : null}
    </Svg>
  );
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

  const hist = storage.history(sel).filter((h) => h.sets.some((s) => s.kg && s.reps));
  const points = hist.map((h) => ({ date: h.date, v: bestE1rm(h.sets) }));

  return (
    <Screen title="التقدم" sub="الأسبوع بيبدأ السبت">
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
            <T w="bold" style={{ fontSize: 16 }}>الحضور شهر بشهر</T>
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
        <Chart points={points} color={t.muscle[ex.muscle]} />
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
