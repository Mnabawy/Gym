import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Btn, Sheet, SwitchRow, T } from './ui';
import { addDays } from '../lib/gaps';
import { dateKey, weekdayOf } from '../lib/logic';
import { WEEKDAYS_AR } from '../data/program';
import { parseQuick, PRIORITY, REPEAT_AR, tagColor, taskId, timeAr, type Priority, type Repeat, type Sub, type Task } from '../lib/tasks';
import { deleteTask, readTasks, saveTask } from '../lib/taskStore';
import { allowReminders } from '../lib/reminder';
import { tap } from '../lib/timer';
import { F, tint, useTheme, type Theme } from '../theme';

const stamp = () => Date.now();
const TIMES: { label: string; m: number | null }[] = [
  { label: 'من غير ساعة', m: null },
  { label: '9 الصبح', m: 9 * 60 },
  { label: '1 الضهر', m: 13 * 60 },
  { label: '5 العصر', m: 17 * 60 },
  { label: '9 بالليل', m: 21 * 60 },
];

export function dueAr(due: string | null, today: string): string {
  if (!due) return 'من غير ميعاد';
  if (due === today) return 'النهارده';
  if (due === addDays(today, 1)) return 'بكره';
  if (due === addDays(today, -1)) return 'امبارح';
  return `${WEEKDAYS_AR[weekdayOf(due)]} ${+due.slice(8)}/${+due.slice(5, 7)}`;
}

function Chip({ t, label, on, onPress, color }: { t: Theme; label: string; on: boolean; onPress: () => void; color?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} style={({ pressed }) => [s.chip, { backgroundColor: on ? color ?? t.fg : t.soft, opacity: pressed ? 0.7 : 1 }]}>
      <T w="semi" style={{ fontSize: 13, color: on ? (color ? '#FFFFFF' : t.bg) : t.fg }}>{label}</T>
    </Pressable>
  );
}

/**
 * Add or edit a task. Type it the quick way ("كلّم المحاسب بكره 5 العصر !1 #فلوس") and see what was understood right
 * under it, or set each part with the buttons: day, time, priority, tag, repeat, reminder and small steps.
 */
export function TaskSheet({ task, initial, onClose }: { task?: Task; initial?: string; onClose: () => void }) {
  const t = useTheme();
  const today = dateKey();
  const [text, setText] = useState(task?.title ?? initial ?? '');
  const parsed = parseQuick(text, today);
  // Values set with the buttons win over what the text says.
  const [f, setF] = useState(() => ({
    due: task ? task.due : (undefined as string | null | undefined),
    time: task ? task.time : (undefined as number | null | undefined),
    priority: task?.priority as Priority | undefined,
    tag: task ? task.tag ?? '' : (undefined as string | undefined),
    repeat: task ? task.repeat : (undefined as Repeat | null | undefined),
    remind: task?.remind ?? false,
    subs: task?.subs ?? ([] as Sub[]),
  }));
  const [sub, setSub] = useState('');
  const [newTag, setNewTag] = useState('');
  const [confirm, setConfirm] = useState(false);

  const editing = !!task;
  const title = editing ? text.trim() : parsed.title;
  const due = f.due !== undefined ? f.due : editing ? null : parsed.due;
  const time = f.time !== undefined ? f.time : editing ? null : parsed.time;
  const priority: Priority = f.priority ?? (editing ? 3 : parsed.priority ?? 3);
  const tag = f.tag !== undefined ? f.tag : parsed.tag ?? '';
  const repeat = f.repeat !== undefined ? f.repeat : editing ? null : parsed.repeat;
  const evening = !editing && parsed.evening && time == null;
  const set = (p: Partial<typeof f>) => setF({ ...f, ...p });
  const tags = [...new Set(readTasks().map((x) => x.tag).filter((x): x is string => !!x))].slice(0, 8);
  const ok = !!title;

  const save = async () => {
    if (!ok) return;
    tap();
    const next: Task = {
      ...(task ?? { id: taskId(stamp()), done: null, created: today }),
      title,
      due: due ?? (repeat ? today : null),
      time: time ?? null,
      ...(evening || task?.evening ? { evening: true } : {}),
      priority,
      ...(tag ? { tag } : {}),
      subs: f.subs,
      repeat: repeat ?? null,
      remind: f.remind && time != null,
    };
    if (!tag) delete next.tag;
    saveTask(next);
    if (next.remind) await allowReminders().catch(() => false);
    onClose();
  };

  const days = [today, addDays(today, 1), addDays(today, 2), addDays(today, 3), addDays(today, 4), addDays(today, 5), addDays(today, 6), addDays(today, 7)];
  const understood = [
    !editing && parsed.due ? `📅 ${dueAr(parsed.due, today)}` : null,
    !editing && parsed.time != null ? `⏰ ${timeAr(parsed.time)}` : null,
    !editing && parsed.evening ? '🌙 بالليل' : null,
    !editing && parsed.priority ? `● ${PRIORITY[parsed.priority].label}` : null,
    !editing && parsed.tag ? `# ${parsed.tag}` : null,
    !editing && parsed.repeat ? `🔁 ${REPEAT_AR[parsed.repeat]}` : null,
  ].filter(Boolean);

  return (
    <Sheet visible onClose={onClose} title={editing ? 'المهمة' : 'مهمة جديدة'}>
      <TextInput
        value={text}
        onChangeText={setText}
        autoFocus={!editing}
        multiline
        placeholder="اكتب المهمة… «بكره 5 العصر !1 #شغل»"
        placeholderTextColor={t.mute}
        maxLength={140}
        accessibilityLabel="المهمة"
        style={[s.title, { color: t.fg, fontFamily: F.semi }]}
      />
      {understood.length ? (
        <View style={s.row}>
          {understood.map((u) => (
            <View key={u} style={[s.got, { backgroundColor: tint(t.ok, 0.12) }]}>
              <T w="semi" style={{ fontSize: 12.5, color: t.okText }}>{u}</T>
            </View>
          ))}
        </View>
      ) : null}

      <T style={[s.lbl, { color: t.mute }]}>امتى</T>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>
        <Chip t={t} label="من غير ميعاد" on={!due} onPress={() => set({ due: null })} />
        {days.map((d) => <Chip key={d} t={t} label={dueAr(d, today)} on={due === d} onPress={() => set({ due: d })} />)}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>
        {TIMES.map((x) => <Chip key={x.label} t={t} label={x.label} on={time === x.m || (x.m == null && time == null)} onPress={() => set({ time: x.m })} />)}
        {time != null && !TIMES.some((x) => x.m === time) ? <Chip t={t} label={timeAr(time)} on onPress={() => {}} /> : null}
      </ScrollView>
      {time != null ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Btn label="− ربع ساعة" onPress={() => set({ time: (time + 1440 - 15) % 1440 })} style={{ flex: 1 }} />
          <T w="num" style={{ fontSize: 15, minWidth: 90, textAlign: 'center' }}>{timeAr(time)}</T>
          <Btn label="+ ربع ساعة" onPress={() => set({ time: (time + 15) % 1440 })} style={{ flex: 1 }} />
        </View>
      ) : null}

      <T style={[s.lbl, { color: t.mute }]}>الأهمية</T>
      <View style={{ flexDirection: 'row', gap: 7 }}>
        {([1, 2, 3, 4] as Priority[]).map((p) => {
          const on = priority === p;
          const c = PRIORITY[p].color;
          return (
            <Pressable key={p} onPress={() => set({ priority: p })} accessibilityRole="button" accessibilityState={{ selected: on }} style={({ pressed }) => [s.prio, { borderColor: c, backgroundColor: on ? c : 'transparent', opacity: pressed ? 0.7 : 1 }]}>
              <T w="semi" style={{ fontSize: 12.5, color: on ? '#FFFFFF' : c }}>{PRIORITY[p].label}</T>
            </Pressable>
          );
        })}
      </View>

      <T style={[s.lbl, { color: t.mute }]}>تصنيف</T>
      <View style={s.row}>
        <Chip t={t} label="من غير" on={!tag} onPress={() => set({ tag: '' })} />
        {[...new Set([...(tag ? [tag] : []), ...tags])].map((x) => <Chip key={x} t={t} label={`# ${x}`} on={tag === x} color={tagColor(x)} onPress={() => set({ tag: x })} />)}
        <TextInput
          value={newTag}
          onChangeText={setNewTag}
          onSubmitEditing={() => {
            const v = newTag.replace(/^#/, '').trim();
            if (v) set({ tag: v });
            setNewTag('');
          }}
          placeholder="+ جديد"
          placeholderTextColor={t.mute}
          maxLength={16}
          accessibilityLabel="تصنيف جديد"
          style={[s.tagIn, { color: t.fg, backgroundColor: t.soft, fontFamily: F.body }]}
        />
      </View>

      <T style={[s.lbl, { color: t.mute }]}>تكرار</T>
      <View style={s.row}>
        <Chip t={t} label="مرة واحدة" on={!repeat} onPress={() => set({ repeat: null })} />
        {(Object.keys(REPEAT_AR) as Repeat[]).map((r) => <Chip key={r} t={t} label={REPEAT_AR[r]} on={repeat === r} onPress={() => set({ repeat: r })} />)}
      </View>

      <SwitchRow label="🔔 فكّرني في ميعادها" sub={time == null ? 'اختار ساعة الأول' : `${dueAr(due ?? today, today)} ${timeAr(time)}`} value={f.remind && time != null} disabled={time == null} onChange={(v) => set({ remind: v })} />

      <T style={[s.lbl, { color: t.mute }]}>خطوات صغيرة</T>
      {f.subs.map((x) => (
        <View key={x.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40 }}>
          <Pressable onPress={() => set({ subs: f.subs.map((y) => (y.id === x.id ? { ...y, done: !y.done } : y)) })} accessibilityRole="checkbox" accessibilityState={{ checked: x.done }} accessibilityLabel={x.title} hitSlop={6}>
            <Ionicons name={x.done ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={x.done ? t.ok : t.mute} />
          </Pressable>
          <T style={{ flex: 1, fontSize: 14.5, color: x.done ? t.mute : t.fg, textDecorationLine: x.done ? 'line-through' : 'none' }}>{x.title}</T>
          <Pressable onPress={() => set({ subs: f.subs.filter((y) => y.id !== x.id) })} hitSlop={8} accessibilityRole="button" accessibilityLabel={`امسح ${x.title}`}>
            <Ionicons name="close" size={18} color={t.mute} />
          </Pressable>
        </View>
      ))}
      <TextInput
        value={sub}
        onChangeText={setSub}
        submitBehavior="submit"
        onSubmitEditing={() => {
          if (!sub.trim()) return;
          set({ subs: [...f.subs, { id: taskId(stamp(), f.subs.length + 1), title: sub.trim(), done: false }] });
          setSub('');
        }}
        placeholder="+ خطوة"
        placeholderTextColor={t.mute}
        maxLength={80}
        accessibilityLabel="خطوة جديدة"
        style={[s.subIn, { color: t.fg, backgroundColor: t.soft, fontFamily: F.body }]}
      />

      <Pressable onPress={save} accessibilityRole="button" style={({ pressed }) => [s.add, { backgroundColor: t.ok, opacity: ok ? (pressed ? 0.85 : 1) : 0.5 }]}>
        <T w="bold" style={{ color: t.onOk, fontSize: 16 }}>{editing ? 'احفظ' : 'ضيف المهمة'}</T>
      </Pressable>
      {editing ? (
        !confirm ? (
          <Btn label="امسح المهمة" onPress={() => setConfirm(true)} />
        ) : (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn label="لا" onPress={() => setConfirm(false)} style={{ flex: 1 }} />
            <Btn label="امسح" kind="solid" onPress={() => { deleteTask(task!.id); onClose(); }} style={{ flex: 1 }} />
          </View>
        )
      ) : null}
    </Sheet>
  );
}

const s = StyleSheet.create({
  title: { fontSize: 18, minHeight: 48, textAlign: 'right', outlineWidth: 0, padding: 0, lineHeight: 28 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, alignItems: 'center' },
  got: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  lbl: { fontSize: 12.5, marginBottom: -4 },
  chip: { minHeight: 36, borderRadius: 13, paddingHorizontal: 12, justifyContent: 'center' },
  prio: { flex: 1, height: 40, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  tagIn: { height: 36, minWidth: 80, borderRadius: 13, paddingHorizontal: 10, fontSize: 13, textAlign: 'right', outlineWidth: 0 },
  subIn: { height: 42, borderRadius: 12, paddingHorizontal: 12, fontSize: 14, textAlign: 'right', outlineWidth: 0 },
  add: { height: 52, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
});
