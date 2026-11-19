import React, { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { MONTHS_AR, WEEKDAYS_AR } from '../data/program';
import { Btn, Card, INPUT, Label, Ring, Screen, Sep, T } from '../components/ui';
import { readIntent, setIntent } from '../lib/plans';
import { Segmented } from '../components/GymSwitch';
import { TopSheet } from '../components/DaySheets';
import { Item } from '../components/Motion';
import { buildDay, hm, leftovers, moveTo, spanAr, TOP_MAX, topFor } from '../lib/dayPlan';
import { dayFixed } from '../lib/dayFixed';
import { addDays, weekdayOf } from '../lib/dates';
import { useDataVersion } from '../lib/bus';
import { readTasks, saveTask, undoable } from '../lib/taskStore';
import { readSessions } from '../lib/focusStore';
import { PLAN_KINDS, PRIORITY, type Task } from '../lib/tasks';
import { showUndo } from '../lib/undo';
import { useToday } from '../lib/useToday';
import { useTheme } from '../theme';

/**
 * خطّط بكرة (`/plan`, from the moon button on يومي): a few minutes in the evening — how today went, what's still open
 * (each to بكرة or بعدين), «أهم ٣» for tomorrow, and what tomorrow already holds. The morning brief lists the three.
 */
export default function PlanScreen() {
  const t = useTheme();
  useDataVersion((s) => s.v);
  const today = useToday();
  const tomorrow = addDays(today, 1);
  const [topOpen, setTopOpen] = useState(false);
  const tasks = readTasks();

  const topToday = topFor(tasks, today);
  const doneToday = tasks.filter((x) => x.done === today).length;
  const focusMin = readSessions().filter((s) => s.date === today).reduce((a, s) => a + s.min, 0);
  const left = leftovers(tasks, today);
  const topTomorrow = topFor(tasks, tomorrow);

  const { fixed, gymTitle } = dayFixed(tomorrow, today);
  const day = buildDay({ date: tomorrow, fixed, tasks, now: null });
  const blocks = day.filter((i) => i.kind === 'task');
  const blockMin = blocks.reduce((a, i) => a + i.end - i.at, 0);
  const freeMin = day.filter((i) => i.kind === 'free').reduce((a, i) => a + i.end - i.at, 0);
  const plansTomorrow = tasks.filter((x) => x.kind && x.due === tomorrow && !x.done);
  const prayers = fixed.filter((f) => f.kind === 'prayer').length;
  const gym = fixed.find((f) => f.kind === 'gym');
  const work = fixed.find((f) => f.kind === 'work');

  const move = (x: Task, to: 'tomorrow' | 'later') => {
    const undo = undoable(() => saveTask(moveTo(x, to === 'tomorrow' ? tomorrow : null)));
    showUndo(to === 'tomorrow' ? `${x.title} → بكرة` : `${x.title} → بعدين`, undo);
  };
  const unTop = (x: Task) => {
    const undo = undoable(() => saveTask({ ...x, top: undefined }));
    showUndo(`${x.title} خرجت من أهم ٣`, undo);
  };
  const title = `${WEEKDAYS_AR[weekdayOf(tomorrow)]} ${+tomorrow.slice(8)} ${MONTHS_AR[+tomorrow.slice(5, 7) - 1]}`;
  const topDone = topToday.filter((x) => x.done).length;

  return (
    <Screen title="خطّط بكرة" sub={title} onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
      <Card style={{ paddingVertical: 8, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Ring value={topToday.length ? topDone / topToday.length : doneToday ? 1 : 0} size={46} stroke={4}>
          <T w="numBold" style={{ fontSize: 12, color: t.okText }}>{topToday.length ? `${topDone}/${topToday.length}` : String(doneToday)}</T>
        </Ring>
        <View style={{ flex: 1, gap: 1 }}>
          <T w="bold" style={{ fontSize: 15 }}>{topToday.length ? `النهارده خلصت ${topDone} من أهم ${topToday.length}` : `النهارده خلصت ${doneToday} ${doneToday === 1 ? 'مهمة' : 'مهام'}`}</T>
          <T style={{ fontSize: 12, color: t.mute }}>{focusMin ? `${spanAr(focusMin)} تركيز · ${doneToday} مهام خلصت` : `${doneToday} مهام خلصت`}</T>
        </View>
      </Card>

      {left.length ? (
        <>
          <Label>اللي ما خلصش</Label>
          <Card style={{ paddingVertical: 0 }}>
            {left.map((x, i) => (
              <Item key={x.id}>
                {i ? <Sep /> : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52, paddingHorizontal: 12 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: PRIORITY[x.priority].color }} />
                  <T style={{ flex: 1, fontSize: 14.5 }} numberOfLines={2}>{x.title}</T>
                  <Segmented small options={[['tomorrow', 'بكرة'], ['later', 'بعدين']] as const} value={null} onChange={(k) => move(x, k)} />
                </View>
              </Item>
            ))}
          </Card>
        </>
      ) : null}

      <Label>نيّة بكرة</Label>
      <Card style={{ paddingVertical: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 12 }}>
          <Ionicons name="compass-outline" size={20} color={t.mute} />
          <TextInput
            defaultValue={readIntent(tomorrow)}
            onEndEditing={(e) => setIntent(tomorrow, e.nativeEvent.text)}
            placeholder="بكرة هركز على…"
            placeholderTextColor={t.mute}
            returnKeyType="done"
            style={[INPUT, { flex: 1, fontSize: 15, color: t.fg, textAlign: 'right', minHeight: 40 }]}
          />
        </View>
      </Card>

      <Label>أهم ٣ بكرة · لو عملتهم بس، يومك نجح</Label>
      <Card style={{ paddingVertical: 0 }}>
        {topTomorrow.map((x, i) => (
          <Item key={x.id}>
            {i ? <Sep /> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: 12 }}>
              <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: PRIORITY[x.priority].color }} />
              <T style={{ flex: 1, fontSize: 14.5 }} numberOfLines={1}>{x.title}</T>
              {x.time != null && x.due === tomorrow ? <T style={{ fontSize: 12, color: t.mute }}>{hm(x.time)}</T> : null}
              <Pressable onPress={() => unTop(x)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`شيل ${x.title}`}>
                <Ionicons name="close" size={18} color={t.mute} />
              </Pressable>
            </View>
          </Item>
        ))}
        {topTomorrow.length < TOP_MAX ? (
          <>
            {topTomorrow.length ? <Sep /> : null}
            <Pressable onPress={() => setTopOpen(true)} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: 12, opacity: pressed ? 0.6 : 1 })}>
              <Ionicons name="add" size={22} color={t.mute} />
              <T style={{ fontSize: 14.5, color: t.mute }}>اختار من مهامك</T>
            </Pressable>
          </>
        ) : null}
      </Card>

      <Label>شكل بكرة</Label>
      <Card style={{ paddingVertical: 0 }}>
        {work ? (
          <>
            <Fact color={t.mute} label="الشغل" value={`${hm(work.at)} – ${hm(work.at + work.mins)}`} />
            <Sep />
          </>
        ) : null}
        <Fact color={t.sec.gym} label={gym ? `الجيم · ${gymTitle}` : 'يوم راحة من الجيم'} value={gym ? hm(gym.at) : ''} />
        <Sep />
        <Fact color={t.sec.tasks} label={`${blocks.length} ${blocks.length === 1 ? 'مهمة' : 'مهام'} في الجدول`} value={blockMin ? spanAr(blockMin) : ''} />
        <Sep />
        {prayers ? (
          <>
            <Fact color={t.mute} label={`${prayers} صلوات`} value="ثابتين" />
            <Sep />
          </>
        ) : null}
        {plansTomorrow.length ? (
          <>
            <Fact color={t.sec.focus} label={plansTomorrow.map((x) => `${PLAN_KINDS[x.kind!].label}: ${x.title}`).join('، ')} value="" />
            <Sep />
          </>
        ) : null}
        <Fact label="فاضي" value={freeMin ? spanAr(freeMin) : 'مفيش'} />
      </Card>

      <View style={{ gap: 6, marginTop: 8 }}>
 <Btn label="+ خطة لبكرة (خروجة، زيارة، مشوار…)" onPress={() => router.navigate({ pathname: '/', params: { date: tomorrow, plan: '1' } })} />
        <Btn kind="solid" label="تمام، بكرة جاهز" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <T style={{ fontSize: 12, color: t.mute, textAlign: 'center' }}>الموجز الصباحي هيبعتلك نيّتك وأهم ٣ أول ما تصحى</T>
      </View>

      <TopSheet date={tomorrow} label="بكرة" visible={topOpen} onClose={() => setTopOpen(false)} />
    </Screen>
  );
}

function Fact({ color, label, value }: { color?: string; label: string; value: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 12 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color ?? 'transparent', borderWidth: color ? 0 : 1.5, borderColor: t.mute }} />
      <T style={{ flex: 1, fontSize: 14 }}>{label}</T>
      {value ? <T style={{ fontSize: 12.5, color: t.mute }}>{value}</T> : null}
    </View>
  );
}
