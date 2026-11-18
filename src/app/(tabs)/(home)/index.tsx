import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { MONTHS_AR, WEEKDAYS_AR } from '../../../data/program';
import { Btn, Card, HeaderBtn, Ring, Screen, Sep, T } from '../../../components/ui';
import { MenuButton } from '../../../components/SideMenu';
import { HomeSwitch } from '../../../components/GymSwitch';
import { BlockSheet, TopSheet, type BlockTarget } from '../../../components/DaySheets';
import { Item } from '../../../components/Motion';
import { buildDay, hm, nextItem, nowItem, spanAr, TOP_MAX, topFor, type PlanItem } from '../../../lib/dayPlan';
import { dayFixed } from '../../../lib/dayFixed';
import { weekdayOf } from '../../../lib/dates';
import { useDataVersion } from '../../../lib/bus';
import { useSettings } from '../../../lib/settings';
import { readTasks } from '../../../lib/taskStore';
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
 * يومي (`/`, what the app opens on; أسبوعك is next to it on the switch): what's on now, «أهم ٣», and the day as one
 * timeline — prayers, meals and the workout put themselves on it, tasks with a time are blocks, and a free gap opens a
 * sheet to put a task in it. Logic in src/lib/dayPlan.ts; the evening plan for tomorrow is src/app/plan.tsx.
 */
export default function DayScreen() {
  const t = useTheme();
  useDataVersion((s) => s.v);
  // Settings that move things on the timeline.
  useSettings((s) => `${s.prayer}|${s.place?.lat}|${s.prayerMethod}|${s.reminderTime}|${s.reminderDays.join()}`);
  const today = useToday();
  const now = useMinute();
  const [block, setBlock] = useState<BlockTarget | null>(null);
  const [topOpen, setTopOpen] = useState(false);

  const tasks = readTasks();
  const { fixed } = dayFixed(today, today);
  const items = buildDay({ date: today, fixed, tasks, now });
  const cur = nowItem(items, now);
  const next = nextItem(items, now);
  const top = topFor(tasks, today);
  const nowAt = items.findIndex((i) => i.at > now);
  const tick = (x: Task) => {
    const undo = tickTask(x.id, today, taskId());
    if (!x.done) showUndo(x.repeat ? `✓ ${x.title} · الجاية ${REPEAT_AR[x.repeat]}` : `✓ ${x.title}`, undo);
  };
  const focus = (title: string) => {
    setFocus({ task: title });
    router.push('/focus');
  };
  const date = `${WEEKDAYS_AR[weekdayOf(today)]} ${+today.slice(8)} ${MONTHS_AR[+today.slice(5, 7) - 1]}`;

  return (
    <Screen
      title="النهارده"
      sub={date}
      action={
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <HeaderBtn icon="moon-outline" label="خطّط بكرة" onPress={() => router.push('/plan')} />
          <MenuButton />
        </View>
      }>
      <HomeSwitch value="day" />

      <Card style={{ paddingVertical: 8, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {cur ? (
          <Ring value={(now - cur.at) / Math.max(1, cur.end - cur.at)} size={46} stroke={4}>
            <T w="numBold" style={{ fontSize: 11.5, color: t.okText }}>{`${cur.end - now}د`}</T>
          </Ring>
        ) : (
          <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: t.soft, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="time-outline" size={22} color={t.mute} />
          </View>
        )}
        <View style={{ flex: 1, gap: 1 }}>
          <T style={{ fontSize: 12, color: t.mute }}>{cur ? 'دلوقتي' : next ? `الجاي الساعة ${hm(next.at)}` : 'النهارده'}</T>
          <T w="bold" style={{ fontSize: 16 }} numberOfLines={1}>{cur ? cur.title : next ? next.title : 'يومك فاضي'}</T>
          <T style={{ fontSize: 12, color: t.mute }} numberOfLines={1}>
            {cur ? `فاضل ${spanAr(cur.end - now)}${next ? ` · بعد كده ${next.title} ${hm(next.at)}` : ''}` : next ? `بعد ${spanAr(next.at - now)}` : 'دوس على وقت فاضي تحت وحط فيه مهمة'}
          </T>
        </View>
        {cur?.kind === 'task' ? <Btn kind="solid" label="ركّز" onPress={() => focus(cur.title)} /> : null}
        {cur?.kind === 'gym' ? <Btn kind="solid" label="افتح" onPress={() => router.navigate('/workout')} /> : null}
      </Card>

      <Card style={{ paddingVertical: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 40, paddingHorizontal: 12 }}>
          <T w="bold" style={{ fontSize: 14 }}>أهم ٣ النهارده</T>
          <T w="num" style={{ fontSize: 12, color: t.mute }}>{`⁦${top.filter((x) => x.done).length} / ${TOP_MAX}⁩`}</T>
        </View>
        {top.map((x) => (
          <Item key={x.id}>
            <Sep />
            <TaskLine x={x} onTick={() => tick(x)} onPress={() => setTopOpen(true)} end={x.done ? '' : x.time != null && x.due === today ? hm(x.time) : 'مالهاش وقت'} endColor={x.time != null ? t.mute : t.warn} />
          </Item>
        ))}
        {top.length < TOP_MAX ? (
          <>
            <Sep />
            <Pressable onPress={() => setTopOpen(true)} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, paddingHorizontal: 12, opacity: pressed ? 0.6 : 1 })}>
              <Ionicons name="add" size={22} color={t.mute} />
              <T style={{ fontSize: 14, color: t.mute }}>{top.length ? 'اختار كمان' : 'اختار أهم ٣ حاجات النهارده'}</T>
            </Pressable>
          </>
        ) : null}
      </Card>

      <Card style={{ paddingVertical: 0, overflow: 'hidden' }}>
        {items.length ? null : <T style={{ fontSize: 13.5, color: t.mute, padding: 12 }}>مفيش حاجة على اليوم.</T>}
        {items.map((it, i) => (
          <React.Fragment key={it.id}>
            {i > 0 ? <Sep /> : null}
            {i === nowAt ? <NowLine now={now} /> : null}
            <Line it={it} live={cur?.id === it.id} onTick={it.task ? () => tick(it.task!) : undefined} onPress={() => {
              if (it.kind === 'free') setBlock({ slot: { at: it.at, end: it.end } });
              else if (it.kind === 'task' && it.task && !it.task.done) setBlock({ task: it.task });
              else if (it.kind === 'meal') router.navigate('/food');
              else if (it.kind === 'gym') router.navigate('/workout');
            }} />
          </React.Fragment>
        ))}
        {nowAt === -1 && items.length ? <NowLine now={now} /> : null}
      </Card>

      <BlockSheet date={today} target={block} onClose={() => setBlock(null)} />
      <TopSheet date={today} label="النهارده" visible={topOpen} onClose={() => setTopOpen(false)} />
    </Screen>
  );
}

/** A task row with its priority ring to tick (أهم ٣). */
function TaskLine({ x, onTick, onPress, end, endColor }: { x: Task; onTick: () => void; onPress: () => void; end: string; endColor: string }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, paddingHorizontal: 12, opacity: pressed ? 0.7 : 1 })}>
      <Tick on={!!x.done} color={PRIORITY[x.priority].color} onPress={onTick} label={x.title} />
      <T style={{ flex: 1, fontSize: 14.5, color: x.done ? t.mute : t.fg, textDecorationLine: x.done ? 'line-through' : 'none' }} numberOfLines={1}>{x.title}</T>
      {end ? <T style={{ fontSize: 12, color: endColor }}>{end}</T> : null}
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
  const color = it.kind === 'task' && it.task ? PRIORITY[it.task.priority].color : it.kind === 'gym' ? t.sec.gym : t.sec.focus;
  const sub = it.kind === 'task' ? `${hm(it.at)} – ${hm(it.end)} · ${spanAr(it.end - it.at)}` : it.sub;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 12, backgroundColor: live ? t.soft : 'transparent', opacity: pressed ? 0.7 : 1 })}>
      {time}
      {onTick ? <Tick on={it.done} color={color} onPress={onTick} label={it.title} /> : <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, marginHorizontal: 3 }} />}
      <View style={{ flex: 1 }}>
        <T w={live ? 'semi' : 'body'} style={{ fontSize: 14.5, color: it.done ? t.mute : t.fg, textDecorationLine: it.done && it.kind === 'task' ? 'line-through' : 'none' }} numberOfLines={1}>{it.title}</T>
        {sub ? <T style={{ fontSize: 12, color: t.mute }} numberOfLines={1}>{sub}</T> : null}
      </View>
      {live ? <T w="semi" style={{ fontSize: 12 }}>دلوقتي</T> : it.done && it.kind !== 'task' ? <Ionicons name="checkmark" size={17} color={t.fg} /> : null}
    </Pressable>
  );
}
