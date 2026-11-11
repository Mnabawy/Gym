import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { exerciseById, MONTHS_AR, MUSCLE_AR, type Muscle } from '../data/program';
import { MEAL_ORDER } from '../data/nutrition';
import { Card, Label, Progress, Ring, Screen, T } from '../components/ui';
import { energyFor } from '../lib/energy';
import { addDays, weekStart } from '../lib/gaps';
import { SWAPS_KEY, swappedSet, waterGoalMl, WATER_KEY } from '../lib/journal';
import { dateKey } from '../lib/logic';
import { readNumbers, readStrings } from '../lib/meta';
import { weekReport } from '../lib/report';
import { useSettings } from '../lib/settings';
import { storage } from '../lib/storage';
import { readGoals } from '../lib/goalStore';
import { readQuits } from '../lib/quitStore';
import { readTasks } from '../lib/taskStore';
import { readSessions } from '../lib/focusStore';
import { minAr } from '../lib/focus';
import { fmtAmount } from '../lib/goals';
import { useDataVersion } from '../lib/bus';
import { parseWeights, WEIGHTS_KEY } from '../lib/weight';
import { readHabitLog, readHabits } from '../lib/habitStore';
import { CARDIO_KEY, parseCardio, parseSteps, STEPS_KEY } from '../lib/cardio';
import { useTheme } from '../theme';

/** Weekly target sets per muscle (same as the progress page). */
const TARGET = 10;
const iso = (s: string) => `⁦${s}⁩`;
const dayAr = (k: string) => `${+k.slice(8)} ${MONTHS_AR[+k.slice(5, 7) - 1]}`;
const signed = (n: number) => `${n > 0 ? '+' : ''}${n}`;

/** One Saturday–Friday week: attendance, sets per muscle, volume vs the week before, records, weight, food. */
export default function WeekScreen() {
  const t = useTheme();
  useDataVersion((s) => s.v);
  const body = useSettings((s) => s.body);
  const today = dateKey();
  const thisWeek = weekStart(today);
  const [from, setFrom] = useState(thisWeek);
  const rows = storage.allSets();
  const first = rows.find((r) => r.done)?.date;
  const canPrev = !!first && from > weekStart(first);
  const r = weekReport(from, today, {
    rows,
    swapped: swappedSet(readStrings(SWAPS_KEY)),
    weights: parseWeights(storage.getMeta(WEIGHTS_KEY)),
    checks: storage.allMealChecks(),
    water: readNumbers(WATER_KEY),
    waterGoal: waterGoalMl(energyFor(body)?.water ?? null, false),
    mealsPerDay: MEAL_ORDER.length,
    habits: readHabits(),
    habitLog: readHabitLog(),
    cardio: parseCardio(storage.getMeta(CARDIO_KEY)),
    weightKg: body.weight ?? 0,
    steps: parseSteps(storage.getMeta(STEPS_KEY)),
    goals: readGoals(),
    quits: readQuits(),
    tasks: readTasks(),
    focus: readSessions(),
  });
  const live = from === thisWeek;
  // Only for a finished week: a week in progress would always look like a drop.
  const change = !live && r.prevVolume ? Math.round(((r.volume - r.prevVolume) / r.prevVolume) * 100) : null;
  const short = (Object.keys(MUSCLE_AR) as Muscle[]).filter((m) => r.perMuscle[m] < TARGET);

  return (
    <Screen title="تقرير الأسبوع" sub="من السبت للجمعة" onBack={() => router.back()}>
      <View style={s.nav}>
        <Nav icon="chevron-forward" label="الأسبوع اللي فات" disabled={!canPrev} onPress={() => setFrom(addDays(from, -7))} />
        <T w="bold" style={{ flex: 1, textAlign: 'center', fontSize: 15 }}>{`${dayAr(r.from)} – ${dayAr(r.to)}${live ? ' · الأسبوع ده' : ''}`}</T>
        <Nav icon="chevron-back" label="الأسبوع الجاي" disabled={live} onPress={() => setFrom(addDays(from, 7))} />
      </View>

      <Card style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Ring value={r.sessions / r.target} size={64} stroke={5}>
          <T w="numBold" style={{ fontSize: 15, color: t.okText }}>{`${r.sessions}/${r.target}`}</T>
        </Ring>
        <View style={{ flex: 1, gap: 3 }}>
          <T w="bold" style={{ fontSize: 16 }}>{r.sessions >= r.target ? 'حضرت كل التمارين ✓' : live ? `حضرت ${r.sessions} لحد دلوقتي` : `حضرت ${r.sessions} من ${r.target}`}</T>
          <T style={{ color: t.mute, fontSize: 12.5 }}>{`${r.sets} مجموعة · ${iso(r.volume.toLocaleString('en-US'))} كجم حجم${r.minutes ? ` · متوسط التمرين ${r.minutes} د` : ''}`}</T>
          {change != null ? (
            <T style={{ fontSize: 12.5, color: change >= 0 ? t.okText : t.warn }}>{`الحجم ${iso(`${signed(change)}%`)} عن الأسبوع اللي قبله`}</T>
          ) : null}
        </View>
      </Card>

      <Label>مجموعات كل عضلة (الهدف {TARGET} أو أكتر)</Label>
      <Card style={{ padding: 14, gap: 8 }}>
        {(Object.keys(MUSCLE_AR) as Muscle[]).map((m) => (
          <View key={m} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <T style={{ width: 92, fontSize: 13 }}>{MUSCLE_AR[m]}</T>
            <View style={{ flex: 1 }}>
              <Progress value={r.perMuscle[m] / TARGET} color={t.muscle[m]} height={8} />
            </View>
            <T w="num" style={{ width: 26, fontSize: 13, textAlign: 'center' }}>{r.perMuscle[m]}</T>
          </View>
        ))}
        {!live && short.length ? <T style={{ color: t.warn, fontSize: 12.5 }}>{`ناقص: ${short.map((m) => MUSCLE_AR[m]).join('، ')}`}</T> : null}
      </Card>

      <Label>أرقام جديدة</Label>
      <Card style={{ padding: 14, gap: 6 }}>
        {r.prs.length ? (
          r.prs.map((p) => (
            <View key={`${p.date}${p.exId}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="trophy" size={14} color="#E0A400" />
              <T w="num" style={{ flex: 1, fontSize: 14 }}>{exerciseById(p.exId)?.name ?? p.exId}</T>
              <T style={{ color: t.mute, fontSize: 12 }}>{dayAr(p.date)}</T>
            </View>
          ))
        ) : (
          <T style={{ color: t.mute, fontSize: 13 }}>مفيش أرقام جديدة الأسبوع ده.</T>
        )}
      </Card>


      {r.habits.length ? (
        <>
          <Label>العادات</Label>
          <Card style={{ padding: 14, gap: 10 }}>
            {r.habits.map((h) => (
              <View key={h.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: h.color }} />
                <T style={{ width: 110, fontSize: 13 }} numberOfLines={1}>{h.name}</T>
                <View style={{ flex: 1 }}>
                  <Progress value={h.due ? h.done / h.due : 1} color={h.color} height={8} />
                </View>
                <T w="num" style={{ width: 40, fontSize: 12.5, textAlign: 'center' }}>{`${h.done}/${h.due}`}</T>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {r.goals.length ? (
        <>
          <Label>الأهداف</Label>
          <Card style={{ padding: 14, gap: 10 }}>
            {r.goals.map((g) => (
              <View key={g.id} style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: g.color }} />
                  <T w="semi" style={{ flex: 1, fontSize: 13.5 }} numberOfLines={1}>{g.name}</T>
                  <T w="num" style={{ fontSize: 12.5 }}>{`${Math.floor(g.share * 100)}%`}</T>
                </View>
                <Progress value={g.share} color={g.color} height={8} />
                <T style={{ fontSize: 12, color: t.mute }}>{g.gained || g.tasks ? `الأسبوع ده: ${g.gained ? iso(`${g.gained > 0 ? '+' : ''}${fmtAmount(g.gained, g.unit)}`) : ''}${g.gained && g.tasks ? ' · ' : ''}${g.tasks ? `${g.tasks} خطوات خلصت` : ''}` : 'مفيش حركة الأسبوع ده'}</T>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {r.tasksDone ? (
        <>
          <Label>مهامي</Label>
          <Card style={{ padding: 14 }}>
            <T style={{ fontSize: 13.5 }}>{`✓ خلّصت ${r.tasksDone} ${r.tasksDone === 1 ? 'مهمة' : 'مهام'} الأسبوع ده`}</T>
          </Card>
        </>
      ) : null}

      {r.focus.work + r.focus.study ? (
        <>
          <Label>بومودورو</Label>
          <Card style={{ padding: 14 }}>
            <T style={{ fontSize: 13.5 }}>{`⏱ ركّزت ${minAr(r.focus.work + r.focus.study)} الأسبوع ده${r.focus.work && r.focus.study ? ` (شغل ${minAr(r.focus.work)} · مذاكرة ${minAr(r.focus.study)})` : ''}`}</T>
          </Card>
        </>
      ) : null}

      {r.quits.length ? (
        <>
          <Label>بطّل</Label>
          <Card style={{ padding: 14, gap: 10 }}>
            {r.quits.map((q) => (
              <View key={q.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: q.color }} />
                <T style={{ fontSize: 12.5, color: t.mute }}>{`${q.cleanDays} أيام نضيفة${q.slips ? ` · ${q.slips} وقعة` : ''}${q.urges ? ` · قاومت ${q.resisted} من ${q.urges}` : ''}`}</T>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <Label>الجسم والأكل</Label>
      <Card style={{ padding: 14, gap: 8 }}>
        <Line icon="scale-outline" label="الوزن" value={r.weight.end == null ? 'ما اتوزنتش' : `${iso(String(r.weight.end))} كجم${r.weight.change != null ? ` (${iso(signed(r.weight.change))})` : ''}`} />
        <Line icon="restaurant-outline" label="الالتزام بالوجبات" value={r.meals == null ? 'مفيش تسجيل' : `${Math.round(r.meals * 100)}%`} />
        <Line icon="water-outline" label="أيام كمّلت فيها المية" value={`${r.waterDays} من ${r.days}`} />
      </Card>
    </Screen>
  );
}

function Line({ icon, label, value }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; value: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28 }}>
      <Ionicons name={icon} size={16} color={t.mute} />
      <T style={{ flex: 1, fontSize: 13.5 }}>{label}</T>
      <T w="semi" style={{ fontSize: 13.5 }}>{value}</T>
    </View>
  );
}

function Nav({ icon, label, disabled, onPress }: { icon: 'chevron-forward' | 'chevron-back'; label: string; disabled: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} style={[s.btn, { backgroundColor: t.soft, opacity: disabled ? 0.35 : 1 }]}>
      <Ionicons name={icon} size={20} color={t.fg} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  nav: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
