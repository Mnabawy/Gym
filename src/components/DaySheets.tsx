// Sheets for يومي (src/app/(tabs)/(home)/index.tsx) and خطّط بكرة (src/app/plan.tsx):
// BlockSheet puts a task in a free slot (or moves / resizes a block), TopSheet picks «أهم ٣» for a day.
import React, { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Btn, INPUT, Sheet, SwitchRow, T } from './ui';
import { Segmented } from './GymSwitch';
import { BLOCK_MINS, DEFAULT_MINS, hm, pickFor, placeAt, slotStarts, spanAr, TOP_MAX, topFor, unscheduled } from '../lib/dayPlan';
import { PRIORITY, SPACES, spaceOf, taskId, type Task } from '../lib/tasks';
import { readTasks, saveTask, undoable } from '../lib/taskStore';
import { showUndo } from '../lib/undo';
import { useDataVersion } from '../lib/bus';
import { allowReminders } from '../lib/reminder';
import { useTheme } from '../theme';

/** What the block sheet is for: a free slot to fill, or a block already on the timeline. */
export type BlockTarget = { slot: { at: number; end: number } } | { task: Task };

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
  const choices = slot ? unscheduled(readTasks(), date).slice(0, 6) : [];
  const [pick, setPick] = useState<string | null>(editing?.id ?? choices[0]?.id ?? null);
  const [title, setTitle] = useState('');
  const starts = slot ? slotStarts(slot.at, slot.end) : [editing!.time! - 30, editing!.time!, editing!.time! + 30, editing!.time! + 60].filter((m) => m >= 0 && m < 1440);
  const [at, setAt] = useState(slot ? starts[0] : editing!.time!);
  const [mins, setMins] = useState<number>(editing?.mins ?? (slot ? Math.min(50, slot.end - slot.at) : DEFAULT_MINS));
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
