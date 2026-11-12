import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Btn, MiniSwitch, Pill, Sheet, T } from './ui';
import { MonthCalendar } from './MonthCalendar';
import { MONTHS_AR, WEEKDAYS_AR } from '../data/program';
import { readGoals } from '../lib/goalStore';
import { stepsBetween, stepsToTasks, taskFor, type PlannedStep } from '../lib/goalTasks';
import { addDays } from '../lib/gaps';
import { dateKey, weekdayOf } from '../lib/logic';
import { storage } from '../lib/storage';
import { readTasks, writeTasks } from '../lib/taskStore';
import { taskId, type Space } from '../lib/tasks';
import { showUndo } from '../lib/undo';
import { tap } from '../lib/timer';
import { tint, useTheme } from '../theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
type Range = 'week' | 'two' | 'month' | 'custom';

const dayAr = (k: string) => `${WEEKDAYS_AR[weekdayOf(k)]} ${+k.slice(8)} ${MONTHS_AR[+k.slice(5, 7) - 1]}`;
const short = (k: string) => `${+k.slice(8)} ${MONTHS_AR[+k.slice(5, 7) - 1]}`;
/** The last day of the month `k` is in. */
const monthEnd = (k: string) => {
  const d = new Date(+k.slice(0, 4), +k.slice(5, 7), 0);
  return dateKey(d);
};

/**
 * «خطوات الفترة» on the goals page: pick a stretch of days, see the open steps your running goals planned in it, and
 * turn the ones you tick into tasks in مهامي (each linked back to its goal; src/lib/goalTasks.ts).
 */
export function GoalStepsSheet({ onClose }: { onClose: () => void }) {
  const t = useTheme();
  const today = dateKey();
  const [range, setRange] = useState<Range>('week');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(addDays(today, 13));
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);
  const [space, setSpace] = useState<Space>(() => (storage.getMeta('taskSpace') === 'work' ? 'work' : 'personal'));
  const [off, setOff] = useState<Set<string>>(new Set());

  const span: [string, string] =
    range === 'week' ? [today, addDays(today, 6)] : range === 'two' ? [today, addDays(today, 13)] : range === 'month' ? [today, monthEnd(today)] : from <= to ? [from, to] : [to, from];
  // Steps already late (planned before today) come along on «الأسبوع ده» and the others that start today.
  const goals = readGoals();
  const tasks = readTasks();
  const steps = stepsBetween(goals, range === 'custom' ? span[0] : '0000-01-01', span[1]);
  const key = (p: PlannedStep) => `${p.goal.id}|${p.step.id}`;
  const open = steps.filter((p) => !taskFor(tasks, p.goal.id, p.step.id));
  const picked = open.filter((p) => !off.has(key(p)));

  // Grouped by goal, in the goals' order.
  const groups: { goal: PlannedStep['goal']; items: PlannedStep[] }[] = [];
  for (const p of steps) {
    const g = groups.find((x) => x.goal.id === p.goal.id);
    if (g) g.items.push(p);
    else groups.push({ goal: p.goal, items: [p] });
  }

  const flip = (p: PlannedStep) => {
    tap();
    const k = key(p);
    const next = new Set(off);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    setOff(next);
  };
  const convert = () => {
    if (!picked.length) return;
    tap();
    const before = readTasks();
    const stamp = Date.now();
    const made = stepsToTasks(picked, before, today, space, (i) => taskId(stamp, i + 1));
    writeTasks([...before, ...made]);
    showUndo(`${made.length} ${made.length === 1 ? 'خطوة بقت مهمة' : 'خطوات بقوا مهام'} في «${space === 'work' ? 'شغل' : 'خاص'}»`, () => writeTasks(before));
    onClose();
  };

  return (
    <Sheet visible onClose={onClose} title="خطوات الفترة" sub="اختار فترة، وحوّل خطوات أهدافك فيها لمهام في مهامي">
      <View style={s.row}>
        <Pill label="الأسبوع ده" on={range === 'week'} onPress={() => setRange('week')} />
        <Pill label="أسبوعين" on={range === 'two'} onPress={() => setRange('two')} />
        <Pill label="لآخر الشهر" on={range === 'month'} onPress={() => setRange('month')} />
        <Pill label="فترة تانية" on={range === 'custom'} onPress={() => setRange('custom')} />
      </View>
      {range === 'custom' ? (
        <>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['from', 'to'] as const).map((k) => (
              <Pressable key={k} onPress={() => setPicking(picking === k ? null : k)} accessibilityRole="button" accessibilityState={{ expanded: picking === k }} style={[s.date, { backgroundColor: picking === k ? t.okSoft : t.soft }]}>
                <T style={{ fontSize: 12, color: t.mute }}>{k === 'from' ? 'من' : 'لحد'}</T>
                <T w="semi" style={{ fontSize: 14.5 }}>{dayAr(k === 'from' ? from : to)}</T>
              </Pressable>
            ))}
          </View>
          {picking ? (
            <MonthCalendar
              value={picking === 'from' ? from : to}
              today={today}
              onPick={(d) => {
                if (picking === 'from') setFrom(d);
                else setTo(d);
                setPicking(picking === 'from' ? 'to' : null);
              }}
            />
          ) : null}
        </>
      ) : (
        <T style={{ fontSize: 12.5, color: t.mute }}>{`لحد ${dayAr(span[1])}، ومعاها الخطوات اللي اتأخرت`}</T>
      )}

      {groups.length ? (
        groups.map(({ goal, items }) => (
          <View key={goal.id} style={[s.card, { backgroundColor: t.card, borderColor: t.line }]}>
            <View style={s.head}>
              <View style={[s.icon, { backgroundColor: tint(goal.color, 0.14) }]}>
                <Ionicons name={goal.icon as IconName} size={15} color={goal.color} />
              </View>
              <T w="semi" style={{ flex: 1, fontSize: 14 }} numberOfLines={1}>{goal.name}</T>
            </View>
            {items.map((p) => {
              const linked = !!taskFor(tasks, p.goal.id, p.step.id);
              const on = !linked && !off.has(key(p));
              const late = p.date < today;
              return (
                <Pressable
                  key={p.step.id}
                  onPress={() => (linked ? undefined : flip(p))}
                  disabled={linked}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on || linked, disabled: linked }}
                  accessibilityLabel={`${p.step.title}، ${short(p.date)}${linked ? '، في مهامك' : ''}`}
                  style={({ pressed }) => [s.item, { borderTopColor: t.line, opacity: pressed ? 0.6 : 1 }]}>
                  <View style={[s.box, { borderColor: linked ? t.mute : on ? goal.color : t.mute, backgroundColor: on ? goal.color : 'transparent' }]}>
                    {on ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : linked ? <Ionicons name="checkmark" size={14} color={t.mute} /> : null}
                  </View>
                  <T style={{ flex: 1, fontSize: 14.5, color: linked ? t.mute : t.fg }} numberOfLines={2}>{p.step.title}</T>
                  <T style={{ fontSize: 12, color: linked ? t.mute : late ? t.bad : t.mute }}>{linked ? 'في مهامك' : late ? `متأخرة · ${short(p.date)}` : short(p.date)}</T>
                </Pressable>
              );
            })}
          </View>
        ))
      ) : (
        <T style={{ fontSize: 13.5, color: t.mute, lineHeight: 21, textAlign: 'center', paddingVertical: 12 }}>
          مفيش خطوات مخططة في الفترة دي. الخطوات بتاخد مواعيد لما الهدف يبقى ليه ميعاد نهائي، أو لما تحط ميعاد للخطوة بنفسك.
        </T>
      )}

      {open.length ? (
        <>
          <MiniSwitch label="تروح لأنهي قايمة" options={[['personal', 'خاص'], ['work', 'شغل']] as const} value={space} onChange={setSpace} />
          <Btn label={picked.length ? `حوّل ${picked.length} لمهام` : 'اختار خطوة الأول'} kind="solid" onPress={convert} style={{ opacity: picked.length ? 1 : 0.5 }} />
        </>
      ) : steps.length ? (
        <Btn label="افتح مهامي" onPress={() => { onClose(); router.push('/tasks'); }} />
      ) : null}
    </Sheet>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  date: { flex: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, gap: 2, minHeight: 52 },
  card: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, minHeight: 44 },
  icon: { width: 26, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, minHeight: 48, borderTopWidth: StyleSheet.hairlineWidth },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
