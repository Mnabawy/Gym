// Sheets for يومي (src/app/(tabs)/(home)/index.tsx) and خطّط بكرة (src/app/plan.tsx):
// BlockSheet puts a task in a free slot (or moves / resizes a block), TopSheet picks «أهم ٣» for a day.
import React, { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Btn, INPUT, Sheet, SwitchRow, T } from './ui';
import { Segmented } from './GymSwitch';
import { BLOCK_MINS, DEFAULT_MINS, hm, pickFor, placeAt, slotStarts, spanAr, TOP_MAX, topFor, unscheduled } from '../lib/dayPlan';
import { PLAN_KINDS, PRIORITY, SPACES, spaceOf, taskId, type PlanKindKey, type Task } from '../lib/tasks';
import { addIdea, readIdeas, removeIdea } from '../lib/plans';
import { addDays, weekdayOf } from '../lib/dates';
import { readTasks, saveTask, undoable } from '../lib/taskStore';
import { showUndo } from '../lib/undo';
import { useDataVersion } from '../lib/bus';
import { allowReminders } from '../lib/reminder';
import { useTheme } from '../theme';

/** What the block sheet is for: a free slot to fill (`pick`: the task to start with), or a block already on the timeline. */
export type BlockTarget = { slot: { at: number; end: number }; pick?: string } | { task: Task };

/** A task's row in a sheet: its priority ring, title and list; ticked = picked. */
function PickRow({ x, on, onPress, note }: { x: Task; on: boolean; onPress: () => void; note?: string }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, borderRadius: 12, paddingHorizontal: 12, backgroundColor: on ? t.okSoft : t.soft, opacity: pressed ? 0.7 : 1 })}>
      <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: PRIORITY[x.priority].color }} />
      <T w={on ? 'semi' : 'body'} style={{ flex: 1, fontSize: 14 }} numberOfLines={1}>{x.title}</T>
      <T style={{ fontSize: 12, color: t.mute }}>{note ?? SPACES[spaceOf(x)]}</T>
      {on ? <Ionicons name="checkmark" size={18} color={t.fg} /> : null}
    </Pressable>
  );
}

export function BlockSheet({ date, target, onClose }: { date: string; target: BlockTarget | null; onClose: () => void }) {
  return target ? <BlockBody key={'task' in target ? target.task.id : target.slot.at} date={date} target={target} onClose={onClose} /> : null;
}

function BlockBody({ date, target, onClose }: { date: string; target: BlockTarget; onClose: () => void }) {
  const t = useTheme();
  const editing = 'task' in target ? target.task : null;
  const slot = 'slot' in target ? target.slot : null;
  const want = 'pick' in target ? target.pick : undefined;
  const open = slot ? unscheduled(readTasks(), date) : [];
  const first = open.slice(0, 6);
  const wanted = want ? open.find((x) => x.id === want) : undefined;
  const choices = wanted && !first.includes(wanted) ? [wanted, ...first.slice(0, 5)] : first;
  const [pick, setPick] = useState<string | null>(editing?.id ?? wanted?.id ?? choices[0]?.id ?? null);
  const [title, setTitle] = useState('');
  const starts = slot ? slotStarts(slot.at, slot.end) : [editing!.time! - 30, editing!.time!, editing!.time! + 30, editing!.time! + 60].filter((m) => m >= 0 && m < 1440);
  const [at, setAt] = useState(slot ? starts[0] : editing!.time!);
  const [mins, setMins] = useState<number>(editing?.mins ?? wanted?.mins ?? (slot ? Math.min(50, slot.end - slot.at) : DEFAULT_MINS));
  const [remind, setRemind] = useState(editing?.remind ?? false);
  const lengths = [...new Set([...BLOCK_MINS, mins])].sort((a, b) => a - b);
  const typed = title.trim();
  const ready = !!editing || !!typed || !!pick;

  const save = () => {
    const base: Task | undefined = editing ?? (typed ? undefined : readTasks().find((x) => x.id === pick));
    const task: Task = base ?? { id: taskId(), title: typed, due: date, time: null, priority: 3, subs: [], repeat: null, remind: false, done: null, created: date };
    const undo = undoable(() => saveTask({ ...placeAt(task, date, at, mins), remind }));
    showUndo(`${task.title} · ${hm(at)}`, undo);
    if (remind) allowReminders().catch(() => false);
    onClose();
  };
  const unplan = () => {
    const undo = undoable(() => saveTask({ ...editing!, time: null, remind: false }));
    showUndo(`${editing!.title} اتشالت من الجدول`, undo);
    onClose();
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title={editing ? editing.title : 'حط مهمة في وقت'}
      sub={slot ? `فاضي من ${hm(slot.at)} لـ ${hm(slot.end)} · ${spanAr(slot.end - slot.at)}` : `${hm(editing!.time!)} – ${hm(editing!.time! + (editing!.mins ?? DEFAULT_MINS))}`}>
      {slot ? (
        <>
          {choices.length ? <T style={{ fontSize: 12.5, color: t.mute }}>مهام مالهاش وقت</T> : null}
          {choices.map((x) => (
            <PickRow key={x.id} x={x} on={!typed && pick === x.id} onPress={() => { setTitle(''); setPick(x.id); }} note={x.top === date ? 'من أهم ٣' : undefined} />
          ))}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, borderRadius: 12, paddingHorizontal: 12, backgroundColor: typed ? t.okSoft : t.soft }}>
            <Ionicons name="add" size={20} color={t.mute} />
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="مهمة جديدة"
              placeholderTextColor={t.mute}
              style={[INPUT, { flex: 1, fontSize: 14, color: t.fg, textAlign: 'right', minHeight: 40 }]}
              returnKeyType="done"
            />
          </View>
        </>
      ) : null}
      <T style={{ fontSize: 12.5, color: t.mute, marginTop: 4 }}>تبدأ</T>
      <Segmented options={starts.map((m) => [m, hm(m)] as const)} value={at} onChange={setAt} />
      <T style={{ fontSize: 12.5, color: t.mute, marginTop: 4 }}>المدة</T>
      <Segmented options={lengths.map((m) => [m, spanAr(m)] as const)} value={mins} onChange={setMins} />
      <View style={{ backgroundColor: t.soft, borderRadius: 12, paddingHorizontal: 12, marginTop: 4 }}>
        <SwitchRow label="فكّرني في معادها" value={remind} onChange={setRemind} />
      </View>
      <Btn kind="solid" label={ready ? `حطّها ${hm(at)} – ${hm(at + mins)}` : 'اختار مهمة'} onPress={() => (ready ? save() : undefined)} />
      {editing ? <Btn label="شيلها من الجدول" onPress={unplan} /> : null}
    </Sheet>
  );
}

/** Pick «أهم ٣» for a day from the open tasks (today's / late / no day). Tapping one adds or takes it off. */
export function TopSheet({ date, visible, onClose, label }: { date: string; visible: boolean; onClose: () => void; label: string }) {
  const t = useTheme();
  useDataVersion((s) => s.v); // re-read after each pick
  const list = readTasks();
  const picked = topFor(list, date);
  const options = [...picked.filter((x) => !x.done), ...unscheduled(list, date).filter((x) => x.top !== date), ...list.filter((x) => !x.done && x.due === date && x.time != null && x.top !== date)].slice(0, 12);
  const [full, setFull] = useState(false);
  const toggle = (x: Task) => {
    const on = x.top === date;
    if (!on && picked.length >= TOP_MAX) {
      setFull(true);
      return;
    }
    setFull(false);
    const undo = undoable(() => saveTask(on ? { ...x, top: undefined } : pickFor(x, date)));
    if (on) showUndo(`${x.title} خرجت من أهم ٣`, undo);
  };
  return (
    <Sheet visible={visible} onClose={() => { setFull(false); onClose(); }} title={`أهم ٣ ${label}`} sub={`لو عملتهم بس، يومك نجح · ${picked.length} / ${TOP_MAX}`}>
      {options.length ? null : <T style={{ fontSize: 13.5, color: t.mute }}>مفيش مهام مفتوحة. ضيف من مهامي.</T>}
      {full ? <T w="medium" style={{ fontSize: 13.5, color: t.warn }}>{`اخترت ${TOP_MAX} خلاص. شيل واحدة الأول عشان تحط دي.`}</T> : null}
      {options.map((x) => (
        <PickRow key={x.id} x={x} on={x.top === date} onPress={() => toggle(x)} note={x.time != null && x.due === date ? hm(x.time) : undefined} />
      ))}
      <Btn kind="solid" label="تمام" onPress={() => { setFull(false); onClose(); }} />
    </Sheet>
  );
}

const KIND_ASK: Record<PlanKindKey, string> = {
  errand: 'رايح فين؟ (البنك، المكوجي…)',
  outing: 'هتخرج فين؟',
  visit: 'هتزور مين؟',
  hobby: 'هتعمل إيه؟',
  rest: 'هترتاح إزاي؟',
};

/**
 * «+ خطة»: a plan for a day (مشوار، خروجة، زيارة، هواية، راحة), saved as a task with that `kind` so it's in مهامي too.
 * Pick the kind, write it (or tap one of your ideas of that kind), the day, a time or none, and how long. «احفظها فكرة»
 * keeps it in your ideas for another time. `start` fills it in (from a suggestion).
 */
export function PlanSheet({ visible, onClose, today, slots, start }: { visible: boolean; onClose: () => void; today: string; slots: (date: string) => number[]; start?: { kind: PlanKindKey; title: string; date?: string; at?: number } }) {
  return visible ? <PlanBody key={start ? `${start.kind}|${start.title}` : 'new'} onClose={onClose} today={today} slots={slots} start={start} /> : null;
}

function PlanBody({ onClose, today, slots, start }: { onClose: () => void; today: string; slots: (date: string) => number[]; start?: { kind: PlanKindKey; title: string; date?: string; at?: number } }) {
  const t = useTheme();
  useDataVersion((s) => s.v);
  const [kind, setKind] = useState<PlanKindKey>(start?.kind ?? 'outing');
  const [title, setTitle] = useState(start?.title ?? '');
  const tomorrow = addDays(today, 1);
  const friday = nextWeekday(today, 5);
  const days: (readonly [string, string])[] = [[today, 'النهارده'], [tomorrow, 'بكرة'], ...(friday !== today && friday !== tomorrow ? [[friday, 'الجمعة'] as const] : [])];
  const [date, setDate] = useState(start?.date ?? today);
  const starts = slots(date);
  const [at, setAt] = useState<number>(start?.at ?? -1);
  const [mins, setMins] = useState(kind === 'errand' ? 60 : 120);
  const [keep, setKeep] = useState(false);
  const ideas = readIdeas().filter((i) => i.kind === kind);
  const ok = !!title.trim();
  const times = [...new Set([...(at >= 0 && !starts.includes(at) ? [at] : []), ...starts])].slice(0, 3);

  const save = () => {
    if (!ok) return;
    const task: Task = { id: taskId(), title: title.trim(), due: date, time: at >= 0 ? at : null, priority: 3, subs: [], repeat: null, remind: false, done: null, created: today, kind, ...(at >= 0 ? { mins } : {}) };
    const undo = undoable(() => saveTask(task));
    const undoIdea = keep && !ideas.some((i) => i.title === task.title) ? addIdea(kind, task.title) : null;
    showUndo(`${PLAN_KINDS[kind].label}: ${task.title}`, () => {
      undo();
      undoIdea?.();
    });
    onClose();
  };
  const forget = (id: string, name: string) => showUndo(`«${name}» اتشالت من الأفكار`, removeIdea(id));

  return (
    <Sheet visible onClose={onClose} title="خطة" sub="بتظهر في يومي وفي مهامي">
      <Segmented small={false} options={(Object.keys(PLAN_KINDS) as PlanKindKey[]).map((k) => [k, PLAN_KINDS[k].label] as const)} value={kind} onChange={(k) => { setKind(k); setMins(k === 'errand' ? 60 : 120); }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, borderRadius: 12, paddingHorizontal: 12, backgroundColor: t.soft }}>
        <Ionicons name={PLAN_KINDS[kind].icon} size={20} color={t.mute} />
        <TextInput value={title} onChangeText={setTitle} placeholder={KIND_ASK[kind]} placeholderTextColor={t.mute} style={[INPUT, { flex: 1, fontSize: 15, color: t.fg, textAlign: 'right', minHeight: 40 }]} returnKeyType="done" />
      </View>
      {ideas.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {ideas.map((i) => (
            <Pressable key={i.id} onPress={() => setTitle(i.title)} onLongPress={() => forget(i.id, i.title)} accessibilityRole="button" accessibilityHint="ضغطة طويلة تشيلها من الأفكار" style={({ pressed }) => ({ height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: title === i.title ? t.okSoft : t.soft, justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
              <T style={{ fontSize: 13 }}>{i.title}</T>
            </Pressable>
          ))}
        </View>
      ) : null}
      <T style={{ fontSize: 12.5, color: t.mute, marginTop: 4 }}>إمتى</T>
      <Segmented options={days} value={date} onChange={(d) => { setDate(d); setAt(-1); }} />
      <Segmented options={[[-1, 'من غير وقت'] as const, ...times.map((m) => [m, hm(m)] as const)]} value={at} onChange={setAt} />
      {at >= 0 ? <Segmented options={[60, 120, 180, 240].map((m) => [m, spanAr(m)] as const)} value={mins} onChange={setMins} /> : null}
      <View style={{ backgroundColor: t.soft, borderRadius: 12, paddingHorizontal: 12, marginTop: 4 }}>
        <SwitchRow label="احفظها في أفكارك كمان" value={keep} onChange={setKeep} />
      </View>
      <Btn kind="solid" label={ok ? `حطها ${days.find(([d]) => d === date)?.[1] ?? ''}${at >= 0 ? ` ${hm(at)}` : ''}` : 'اكتب الخطة'} onPress={save} />
    </Sheet>
  );
}

/** The next date on a weekday (0 = Sunday), today included. */
function nextWeekday(from: string, wd: number): string {
  for (let i = 0; i < 7; i++) {
    const d = addDays(from, i);
    if (weekdayOf(d) === wd) return d;
  }
  return from;
}
