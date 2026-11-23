import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { MUSCLE_AR, PROGRAM, WEEKDAYS_AR } from '../data/program';
import { Btn, Card, Label, Pill, Screen, Sep, T } from '../components/ui';
import { Segmented } from '../components/GymSwitch';
import { cleanDays, DAYS_MAX, DAYS_MIN, DEFAULT_WEEKDAYS, generate, GOAL_AR, LEVEL_AR, planLine, type Goal, type Level } from '../lib/generator';
import { nextDayId, parsePastDays, PAST_DAYS_KEY, SETUP_KEY } from '../lib/template';
import { confirm } from '../lib/confirm';
import { useSettings } from '../lib/settings';
import { storage } from '../lib/storage';
import { useTheme } from '../theme';

const GOALS = (Object.keys(GOAL_AR) as Goal[]).map((k) => [k, GOAL_AR[k]] as const);
const LEVELS = (Object.keys(LEVEL_AR) as Level[]).map((k) => [k, LEVEL_AR[k]] as const);
const COUNTS = [3, 4, 5].map((n) => [n, `${n} أيام`] as const);
/** Saturday first, the Egyptian week. */
const WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5];

/**
 * Setup: goal, level and training days → a plan (src/lib/generator.ts), shown before you take it. Opens by itself the
 * first time on a phone with nothing logged (src/app/index.tsx), and from settings («ابني برنامج جديد»).
 */
export default function SetupScreen() {
  const t = useTheme();
  const setTemplate = useSettings((s) => s.setTemplate);
  const [goal, setGoal] = useState<Goal>('muscle');
  const [level, setLevel] = useState<Level>('beginner');
  const [days, setDays] = useState<number[]>(DEFAULT_WEEKDAYS[3]);
  const first = !storage.getMeta(SETUP_KEY);
  const picked = cleanDays(days);
  const ok = picked.length >= DAYS_MIN && picked.length <= DAYS_MAX;
  // Cheap enough to rebuild on every change.
  const plan = generate({ goal, level, weekdays: picked }, nextDayId(parsePastDays(storage.getMeta(PAST_DAYS_KEY)), PROGRAM.map((d) => d.weekday)));

  const done = () => {
    storage.setMeta(SETUP_KEY, '1');
    if (router.canGoBack()) router.back();
    else router.replace('/workout');
  };
  const take = async () => {
    if (!ok) return;
    if (storage.trainedDays().length && !(await confirm({ title: 'تبدأ البرنامج الجديد؟', body: 'برنامجك الحالي وتعديلاتك عليه هيتشالوا. كل اللي سجلته قبل كده بيفضل زي ما هو.', confirmLabel: 'ابدأ' }))) return;
    setTemplate(plan);
    done();
  };
  const toggleDay = (d: number) => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));

  return (
    <Screen
      title={first ? 'أهلاً بيك' : 'برنامج جديد'}
      sub="قولنا هدفك ومستواك وأيام تمرينك، وإحنا نعملك البرنامج. الأوزان بتزيد لوحدها مع كل تمرين."
      onBack={first ? undefined : () => router.back()}>
      <Label>هدفك</Label>
      <Segmented options={GOALS} value={goal} onChange={setGoal} />
      <Label>مستواك</Label>
      <Segmented options={LEVELS} value={level} onChange={setLevel} />
      <T style={{ color: t.mute, fontSize: 12 }}>
        {level === 'beginner' ? 'أقل من سنة تمرين منتظم: أجهزة ودمبلز الأول، مجموعات أقل، ومن غير فشل.' : 'سنة أو أكتر: البار الأول ومجموعات أكتر.'}
      </T>
      <Label>بتتمرن كام يوم في الأسبوع</Label>
      <Segmented options={COUNTS} value={ok ? picked.length : null} onChange={(n) => setDays(DEFAULT_WEEKDAYS[n])} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {WEEK_ORDER.map((d) => (
          <Pill key={d} label={WEEKDAYS_AR[d]} on={days.includes(d)} onPress={() => toggleDay(d)} />
        ))}
      </View>
      {!ok ? <T style={{ color: t.bad, fontSize: 12.5 }}>{`اختار من ${DAYS_MIN} لـ ${DAYS_MAX} أيام`}</T> : null}

      <Label>{`برنامجك · ${planLine(plan)}`}</Label>
      <Card>
        {plan.days.map((d, i) => (
          <View key={d.id}>
            {i ? <Sep /> : null}
            <View style={{ paddingHorizontal: 14, paddingVertical: 10, gap: 4 }}>
              <T w="semi" style={{ fontSize: 15 }}>{`تمرين ${i + 1} · ${d.titleAr}`}</T>
              {d.exercises.map((e) => (
                <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.muscle[e.muscle] }} />
                  <T w="num" style={{ flex: 1, fontSize: 13 }} numberOfLines={1}>{e.name}</T>
                  <T style={{ fontSize: 12, color: t.mute }}>{`${MUSCLE_AR[e.muscle]} · ⁦${e.sets}×${e.repLow}–${e.repHigh}⁩`}</T>
                </View>
              ))}
            </View>
          </View>
        ))}
      </Card>
      <T style={{ color: t.mute, fontSize: 12 }}>تقدر تعدّل أي تمرين بعدين من الإعدادات ← عدّل البرنامج.</T>
      <Btn label="ابدأ البرنامج ده" kind="solid" onPress={take} />
      {first ? <Btn label="خليني على البرنامج الحالي" onPress={done} /> : null}
    </Screen>
  );
}
