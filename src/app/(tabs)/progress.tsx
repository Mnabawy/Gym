import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';
import { ALL_EXERCISES, MUSCLE_AR, PROGRAM, WEEKDAYS_AR, type Muscle } from '../../data/program';
import { Card, Progress, Screen, T } from '../../components/ui';
import { bestE1rm, dateKey } from '../../lib/logic';
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
  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
      <Line x1={P} x2={W - P} y1={H - P} y2={H - P} stroke={t.line} strokeWidth={1} />
      <SvgText x={P - 4} y={y(max) + 4} fontSize={10} fill={t.mute} textAnchor="end" fontFamily={F.numRegular}>{String(max)}</SvgText>
      <SvgText x={P - 4} y={y(min) + 4} fontSize={10} fill={t.mute} textAnchor="end" fontFamily={F.numRegular}>{String(min)}</SvgText>
      <Polyline points={points.map((p, i) => `${x(i)},${y(p.v)}`).join(' ')} fill="none" stroke={color} strokeWidth={2.5} />
      {points.map((p, i) => (
        <Circle key={i} cx={x(i)} cy={y(p.v)} r={i === points.length - 1 ? 5 : 3} fill={color} />
      ))}
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

  const hist = storage.history(sel).filter((h) => h.sets.some((s) => s.kg && s.reps));
  const points = hist.map((h) => ({ date: h.date, v: bestE1rm(h.sets) }));

  return (
    <Screen title="التقدم" sub="الأسبوع بيبدأ السبت">
      <Card style={{ padding: 14, gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <T w="bold" style={{ fontSize: 16 }}>الأسبوع ده</T>
          <T style={{ color: t.mute, fontSize: 13 }}>
            <T w="numBold">{week.sessions}</T> من 5 تمرينات
          </T>
        </View>
        <T style={{ color: t.mute, fontSize: 12 }}>{`مجموعات خلصتها لكل عضلة (الهدف ${TARGET} أو أكتر)`}</T>
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

      <T w="bold" style={{ fontSize: 16, marginTop: 4 }}>تمرين بتمرين</T>
      {PROGRAM.map((d) => (
        <View key={d.weekday} style={{ gap: 6 }}>
          <T style={{ color: t.mute, fontSize: 12.5 }}>{`${WEEKDAYS_AR[d.weekday]} · ${d.titleAr}`}</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {d.exercises.map((e) => {
              const on = e.id === sel;
              return (
                <Pressable
                  key={e.id}
                  onPress={() => setSel(e.id)}
                  accessibilityRole="button"
                  style={{ minHeight: 36, paddingHorizontal: 10, justifyContent: 'center', borderRadius: 8, borderWidth: 1, borderColor: on ? t.muscle[e.muscle] : t.line, backgroundColor: on ? t.muscle[e.muscle] + '22' : t.card }}>
                  <T w="num" style={{ fontSize: 12.5 }}>{e.name}</T>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}

      <Card color={t.muscle[ex.muscle]} style={{ padding: 14, gap: 8 }}>
        <T w="num" style={{ fontSize: 17 }}>{ex.name}</T>
        <T style={{ color: t.mute, fontSize: 12.5 }}>أقصى وزن متوقع لتكرار واحد (معادلة Epley) من أحسن مجموعة في كل مرة</T>
        <Chart points={points} color={t.muscle[ex.muscle]} />
        {hist.slice().reverse().slice(0, 8).map((h) => (
          <View key={h.date} style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: t.line, paddingTop: 6 }}>
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
