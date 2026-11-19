import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { MONTHS_AR, WEEKDAYS_AR } from '../../../data/program';
import { Btn, Card, HeaderBtn, Progress, Ring, Screen, Sep, T } from '../../../components/ui';
import { MenuButton } from '../../../components/SideMenu';
import { HomeSwitch } from '../../../components/GymSwitch';
import { BlockSheet, TopSheet, type BlockTarget } from '../../../components/DaySheets';
import { Item } from '../../../components/Motion';
import { buildDay, firstFree, hm, nextItem, nowItem, placeAt, splitPast, spanAr, suggest, TOP_MAX, topFor, type PlanItem } from '../../../lib/dayPlan';
import { dayFixed } from '../../../lib/dayFixed';
import { addDays, weekdayOf } from '../../../lib/dates';
import { energyFor } from '../../../lib/energy';
import { readNumbers } from '../../../lib/meta';
import { waterGoalMl, WATER_KEY } from '../../../lib/journal';
import { isTrainingDay } from '../../../lib/schedule';
import { storage } from '../../../lib/storage';
import { addWater, tickMeal } from '../../../lib/foodStore';
import { readTasks, saveTask } from '../../../lib/taskStore';
import { useDataVersion } from '../../../lib/bus';
import { useSettings } from '../../../lib/settings';
import { tickTask } from '../../../lib/goalTaskStore';
import { PRIORITY, REPEAT_AR, taskId, type Task } from '../../../lib/tasks';
import { setFocus } from '../../../lib/focusStore';
import { showUndo } from '../../../lib/undo';
import { useToday } from '../../../lib/useToday';
import { useTheme } from '../../../theme';

const minutesNow = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

/** The clock in minutes, moved on every minute (the «now» line and the current block). */
function useMinute(): number {
  const [m, setM] = useState(minutesNow);
  useEffect(() => {
    const id = setInterval(() => setM(minutesNow()), 30_000);
    return () => clearInterval(id);
  }, []);
  return m;
}

/**
 * يومي (`/`, what the app opens on; أسبوعك is next to it on the switch; `?date=` shows another day, from the week's
 * rings): what's on now (or what to start in the free time you have), water, late tasks, «أهم ٣», and the day as one
 * timeline — prayers, work hours, meals and the workout put themselves on it, tasks with a time are blocks, what's over
 * folds under «فات», and a free gap opens a sheet to put a task in it. Logic in src/lib/dayPlan.ts; the evening plan
 * for tomorrow is src/app/plan.tsx.
 */
export default function DayScreen() {
  const t = useTheme();
  useDataVersion((s) => s.v);
  // Settings that move things on the timeline.
  useSettings((s) => `${s.prayer}|${s.place?.lat}|${s.prayerMethod}|${s.reminderTime}|${s.reminderDays.join()}|${s.workOn}|${s.workFrom}|${s.workTo}|${s.workDays.join()}`);
  const body = useSettings((s) => s.body);
  const today = useToday();
  const q = useLocalSearchParams<{ date?: string }>().date;
  const date = typeof q === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : today;
  const isToday = date === today;
  const clock = useMinute();
  const [block, setBlock] = useState<BlockTarget | null>(null);
  const [topOpen, setTopOpen] = useState(false);
  const [showPast, setShowPast] = useState(false);

  const tasks = readTasks();
  const { fixed } = dayFixed(date, today);
  // A past day has no free time left; another day has no «now».
  const now = isToday ? clock : null;
  const items = buildDay({ date, fixed, tasks, now: date < today ? 24 * 60 : now });
  const top = topFor(tasks, date);
  const cur = now != null ? nowItem(items, now) : null;
  const next = now != null ? nextItem(items, now) : null;
  const sug = now != null ? suggest(items, top, now, date) : null;
  const { past, rest } = now != null ? splitPast(items, now) : { past: [], rest: items };
  const nowAt = now != null ? rest.findIndex((i) => i.at > now) : -2;
  const late = isToday ? tasks.filter((x) => !x.done && x.due != null && x.due < today).length : 0;

  // Water for the day (same goal as the food tab).
  const trainedSet = new Set(storage.trainedDays().map((d) => d.date));
  const waterGoal = waterGoalMl(energyFor(body)?.water ?? null, isTrainingDay(date, today, trainedSet, storage.getMeta('restDay') || null));
  const waterMl = readNumbers(WATER_KEY)[date] ?? 0;

  const tick = (x: Task) => {
    const undo = tickTask(x.id, date, taskId());
    if (!x.done) showUndo(x.repeat ? `✓ ${x.title} · الجاية ${REPEAT_AR[x.repeat]}` : `✓ ${x.title}`, undo);
  };
  const focus = (title: string) => {
    setFocus({ task: title });
    router.push('/focus');
  };
  // «ركّز» on a suggestion: put the task on the timeline from now, then start a focus block on it.
  const startNow = (x: Task, end: number) => {
    const at = Math.floor(clock / 5) * 5;
    saveTask(placeAt(x, today, at, Math.min(x.mins ?? 50, Math.max(25, end - at))));
    focus(x.title);
  };
  const placeTop = (x: Task) => {
    const slot = firstFree(items, x.mins ?? 50) ?? { at: Math.ceil((now ?? 9 * 60) / 15) * 15, end: Math.ceil((now ?? 9 * 60) / 15) * 15 + 60 };
    setBlock({ slot, pick: x.id });
  };
  const tickMealRow = (it: PlanItem) => {
    const meal = it.id.slice('meal:'.length);
    const undo = tickMeal(date, meal, !it.done);
    if (!it.done) showUndo(`✓ ${meal}`, undo);
  };
  const dayAr = (d: string) => `${WEEKDAYS_AR[weekdayOf(d)]} ${+d.slice(8)} ${MONTHS_AR[+d.slice(5, 7) - 1]}`;
  const title = isToday ? 'النهارده' : date === addDays(today, -1) ? 'امبارح' : date === addDays(today, 1) ? 'بكرة' : WEEKDAYS_AR[weekdayOf(date)];

  return (
    <Screen
      title={title}
      sub={dayAr(date)}
      action={
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {isToday ? <HeaderBtn icon="moon-outline" label="خطّط بكرة" onPress={() => router.push('/plan')} /> : <HeaderBtn icon="today-outline" label="ارجع للنهارده" onPress={() => router.replace('/')} />}
          <MenuButton />
        </View>
      }>
      <HomeSwitch value="day" />

      {isToday ? (
        <Card style={{ paddingVertical: 0 }}>
          <View style={{ paddingVertical: 8, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {cur ? (
              <Ring value={(clock - cur.at) / Math.max(1, cur.end - cur.at)} size={46} stroke={4}>
                <T w="numBold" style={{ fontSize: 11.5, color: t.okText }}>{cur.end - clock >= 60 ? `${Math.floor((cur.end - clock) / 60)}س` : `${cur.end - clock}د`}</T>
              </Ring>
            ) : (
              <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: t.soft, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={sug ? 'flash-outline' : 'time-outline'} size={22} color={sug ? t.fg : t.mute} />
              </View>
            )}
            <View style={{ flex: 1, gap: 1 }}>
              {sug ? (
                <>
                  <T style={{ fontSize: 12, color: t.mute }}>{`عندك ${spanAr(sug.end - clock)} ${cur ? 'في الشغل' : 'فاضيين'}`}</T>
                  <T w="bold" style={{ fontSize: 16 }} numberOfLines={1}>{`ابدأ: ${sug.task.title}`}</T>
                  <T style={{ fontSize: 12, color: t.mute }} numberOfLines={1}>{next ? `بعد كده ${next.title} ${hm(next.at)}` : 'من أهم ٣ النهارده'}</T>
                </>
              ) : (
                <>
                  <T style={{ fontSize: 12, color: t.mute }}>{cur ? 'دلوقتي' : next ? `الجاي الساعة ${hm(next.at)}` : 'النهارده'}</T>
                  <T w="bold" style={{ fontSize: 16 }} numberOfLines={1}>{cur ? cur.title : next ? next.title : 'يومك فاضي'}</T>
                  <T style={{ fontSize: 12, color: t.mute }} numberOfLines={1}>
                    {cur ? `فاضل ${spanAr(cur.end - clock)}${next ? ` · بعد كده ${next.title} ${hm(next.at)}` : ''}` : next ? `بعد ${spanAr(next.at - clock)}` : 'دوس على وقت فاضي تحت وحط فيه مهمة'}
                  </T>
                </>
              )}
            </View>
            {sug ? <Btn kind="solid" label="ركّز" onPress={() => startNow(sug.task, sug.end)} /> : null}
            {!sug && cur?.kind === 'task' ? <Btn kind="solid" label="ركّز" onPress={() => focus(cur.title)} /> : null}
            {!sug && cur?.kind === 'gym' ? <Btn kind="solid" label="افتح" onPress={() => router.navigate('/workout')} /> : null}
            {!sug && cur?.kind === 'meal' ? <Btn kind="solid" label="كلت" onPress={() => tickMealRow(cur)} /> : null}
          </View>
          <Sep />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 12 }}>
            <Ionicons name="water-outline" size={20} color={t.protein} />
            <View style={{ flex: 1, gap: 4 }}>
              <T w="num" style={{ fontSize: 13 }}>{`المية \u2066${(waterMl / 1000).toFixed(1)} / ${(waterGoal / 1000).toFixed(1)}\u2069 لتر`}</T>
              <Progress value={Math.min(1, waterMl / waterGoal)} height={4} />
            </View>
            <Btn label="+ كوباية" onPress={() => showUndo('+ كوباية مية', addWater(date, 250))} />
          </View>
        </Card>
      ) : null}

      {late ? (
        <Pressable onPress={() => router.push('/plan')} accessibilityRole="button" style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 12, paddingVertical: 0 }}>
            <Ionicons name="alert-circle" size={20} color={t.warn} />
            <T style={{ flex: 1, fontSize: 14 }}>{`عندك ${late} ${late === 1 ? 'مهمة متأخرة' : late === 2 ? 'مهمتين متأخرين' : 'مهام متأخرة'}`}</T>
            <T style={{ fontSize: 12.5, color: t.mute }}>رتّبهم</T>
            <Ionicons name="chevron-back" size={16} color={t.mute} />
          </Card>
        </Pressable>
      ) : null}

      <Card style={{ paddingVertical: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 40, paddingHorizontal: 12 }}>
          <T w="bold" style={{ fontSize: 14 }}>{isToday ? 'أهم ٣ النهارده' : 'أهم ٣'}</T>
          <T w="num" style={{ fontSize: 12, color: t.mute }}>{`\u2066${top.filter((x) => x.done).length} / ${TOP_MAX}\u2069`}</T>
        </View>
        {top.map((x) => (
          <Item key={x.id}>
            <Sep />
            <TaskLine
              x={x}
              onTick={() => tick(x)}
              onPress={() => setTopOpen(true)}
              end={x.done ? null : x.time != null && x.due === date ? <T style={{ fontSize: 12, color: t.mute }}>{hm(x.time)}</T> : date >= today ? <SetTime onPress={() => placeTop(x)} /> : null}
            />
          </Item>
        ))}
        {top.length < TOP_MAX && date >= today ? (
          <>
            <Sep />
            <Pressable onPress={() => setTopOpen(true)} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, paddingHorizontal: 12, opacity: pressed ? 0.6 : 1 })}>
              <Ionicons name="add" size={22} color={t.mute} />
              <T style={{ fontSize: 14, color: t.mute }}>{top.length ? 'اختار كمان' : `اختار أهم ٣ حاجات ${isToday ? 'النهارده' : 'لليوم ده'}`}</T>
            </Pressable>
          </>
        ) : null}
      </Card>

      <Card style={{ paddingVertical: 0, overflow: 'hidden' }}>
        {items.length ? null : <T style={{ fontSize: 13.5, color: t.mute, padding: 12 }}>مفيش حاجة على اليوم.</T>}
        {past.length ? (
          <>
            <Pressable onPress={() => setShowPast(!showPast)} accessibilityRole="button" accessibilityState={{ expanded: showPast }} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 36, paddingHorizontal: 12, opacity: pressed ? 0.6 : 1 })}>
              <Ionicons name={showPast ? 'chevron-down' : 'chevron-back'} size={15} color={t.mute} />
              <T style={{ flex: 1, fontSize: 13, color: t.mute }}>{`فات ${past.length}`}</T>
            </Pressable>
            {showPast
              ? past.map((it) => (
                  <React.Fragment key={it.id}>
                    <Sep />
                    <Line it={it} live={false} onTick={lineTick(it)} onPress={() => open(it)} />
                  </React.Fragment>
                ))
              : null}
            {rest.length ? <Sep /> : null}
          </>
        ) : null}
        {rest.map((it, i) => (
          <React.Fragment key={it.id}>
            {i > 0 ? <Sep /> : null}
            {i === nowAt && now != null ? <NowLine now={now} /> : null}
            <Line it={it} live={cur?.id === it.id} onTick={lineTick(it)} onPress={() => open(it)} />
          </React.Fragment>
        ))}
        {nowAt === -1 && now != null && rest.length ? <NowLine now={now} /> : null}
      </Card>

      <BlockSheet date={date} target={block} onClose={() => setBlock(null)} />
      <TopSheet date={date} label={isToday ? 'النهارده' : 'لليوم ده'} visible={topOpen} onClose={() => setTopOpen(false)} />
    </Screen>
  );

  function lineTick(it: PlanItem): (() => void) | undefined {
    if (it.task) return () => tick(it.task!);
    if (it.kind === 'meal' && date <= today) return () => tickMealRow(it);
    return undefined;
  }
  function open(it: PlanItem) {
    if (it.kind === 'free') setBlock({ slot: { at: it.at, end: it.end } });
    else if (it.kind === 'work' && now != null && it.end > now) setBlock({ slot: { at: Math.max(it.at, Math.ceil(now / 15) * 15), end: it.end } });
    else if (it.kind === 'work' && date > today) setBlock({ slot: { at: it.at, end: it.end } });
    else if (it.kind === 'task' && it.task && !it.task.done) setBlock({ task: it.task });
    else if (it.kind === 'meal') router.navigate('/food');
    else if (it.kind === 'gym') router.navigate('/workout');
  }
}

/** «حط وقت»: a small tinted button at the end of a «أهم ٣» row that has no time yet. */
function SetTime({ onPress }: { onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" style={({ pressed }) => ({ height: 28, paddingHorizontal: 10, borderRadius: 8, backgroundColor: t.okSoft, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
      <T w="semi" style={{ fontSize: 12.5, color: t.okText }}>حط وقت</T>
    </Pressable>
  );
}

/** A task row with its priority ring to tick (أهم ٣). */
function TaskLine({ x, onTick, onPress, end }: { x: Task; onTick: () => void; onPress: () => void; end: React.ReactNode }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, paddingHorizontal: 12, opacity: pressed ? 0.7 : 1 })}>
      <Tick on={!!x.done} color={PRIORITY[x.priority].color} onPress={onTick} label={x.title} />
      <T style={{ flex: 1, fontSize: 14.5, color: x.done ? t.mute : t.fg, textDecorationLine: x.done ? 'line-through' : 'none' }} numberOfLines={1}>{x.title}</T>
      {end}
    </Pressable>
  );
}

function Tick({ on, color, onPress, label }: { on: boolean; color: string; onPress: () => void; label: string }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={label}>
      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: on ? 0 : 2, borderColor: color, backgroundColor: on ? t.ok : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
        {on ? <Ionicons name="checkmark" size={14} color={t.onOk} /> : null}
      </View>
    </Pressable>
  );
}

/** The red «now» line between two rows. */
function NowLine({ now }: { now: number }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 14 }} accessibilityLabel={`دلوقتي ${hm(now)}`}>
      <T w="numBold" style={{ width: 44, fontSize: 11, color: t.bad }}>{hm(now)}</T>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.bad }} />
      <View style={{ flex: 1, height: 1.5, backgroundColor: t.bad }} />
    </View>
  );
}

/** One line on the timeline: time, a small mark, what it is. */
function Line({ it, live, onPress, onTick }: { it: PlanItem; live: boolean; onPress: () => void; onTick?: () => void }) {
  const t = useTheme();
  const time = <T w="num" style={{ width: 44, fontSize: 12, color: t.mute }}>{hm(it.at)}</T>;
  if (it.kind === 'prayer') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 32, paddingHorizontal: 12 }}>
        {time}
        <Ionicons name="moon-outline" size={15} color={t.mute} />
        <T style={{ flex: 1, fontSize: 13, color: t.mute }}>{it.title}</T>
      </View>
    );
  }
  if (it.kind === 'free') {
    return (
      <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 12, opacity: pressed ? 0.6 : 1 })}>
        {time}
        <Ionicons name="add" size={16} color={t.mute} />
        <T style={{ flex: 1, fontSize: 14, color: t.mute }}>{`فاضي ${spanAr(it.end - it.at)} · حط مهمة`}</T>
      </Pressable>
    );
  }
  const color = it.kind === 'task' && it.task ? PRIORITY[it.task.priority].color : it.kind === 'gym' ? t.sec.gym : it.kind === 'work' ? t.mute : t.sec.focus;
  const sub = it.kind === 'task' ? `${hm(it.at)} – ${hm(it.end)} · ${spanAr(it.end - it.at)}` : it.kind === 'work' ? `${it.sub} · حط مهمة شغل فيه` : it.sub;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 12, backgroundColor: live ? t.soft : 'transparent', opacity: pressed ? 0.7 : 1 })}>
      {time}
      {onTick ? <Tick on={it.done} color={color} onPress={onTick} label={it.title} /> : <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, marginHorizontal: 3 }} />}
      <View style={{ flex: 1 }}>
        <T w={live ? 'semi' : 'body'} style={{ fontSize: 14.5, color: it.done ? t.mute : t.fg, textDecorationLine: it.done && it.kind === 'task' ? 'line-through' : 'none' }} numberOfLines={1}>{it.title}</T>
        {sub ? <T style={{ fontSize: 12, color: t.mute }} numberOfLines={1}>{sub}</T> : null}
      </View>
      {live ? <T w="semi" style={{ fontSize: 12 }}>دلوقتي</T> : it.done && !onTick && it.kind !== 'task' ? <Ionicons name="checkmark" size={17} color={t.fg} /> : null}
    </Pressable>
  );
}
