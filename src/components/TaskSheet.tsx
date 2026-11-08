import React, { useState } from 'react';
import { LayoutAnimation, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Sheet, T } from './ui';
import { ClockPicker } from './ClockPicker';
import { MonthCalendar } from './MonthCalendar';
import { MONTHS_AR, WEEKDAYS_AR } from '../data/program';
import { addDays } from '../lib/gaps';
import { dateKey, weekdayOf } from '../lib/logic';
import { PRIORITY, REPEAT_AR, tagColor, taskId, timeAr, type Priority, type Repeat, type Sub, type Task } from '../lib/tasks';
import { deleteTask, readTasks, saveTask } from '../lib/taskStore';
import { allowReminders } from '../lib/reminder';
import { showUndo } from '../lib/undo';
import { tap } from '../lib/timer';
import { F, useTheme, type Theme } from '../theme';

const stamp = () => Date.now();
const ease = () => {
  if (Platform.OS !== 'web') LayoutAnimation.configureNext(LayoutAnimation.create(200, 'easeInEaseOut', 'opacity'));
};

/** «النهارده» / «بكره» / «امبارح» / «الخميس 12 نوفمبر». */
export function dueAr(due: string | null, today: string): string {
  if (!due) return 'من غير تاريخ';
  if (due === today) return 'النهارده';
  if (due === addDays(today, 1)) return 'بكره';
  if (due === addDays(today, -1)) return 'امبارح';
  const y = due.slice(0, 4) !== today.slice(0, 4) ? ` ${due.slice(0, 4)}` : '';
  return `${WEEKDAYS_AR[weekdayOf(due)]} ${+due.slice(8)} ${MONTHS_AR[+due.slice(5, 7) - 1]}${y}`;
}

type Open = 'date' | 'time' | 'repeat' | 'priority' | 'tag' | null;

/**
 * Add or edit a task. The title and a note, then one row per detail: the date on a month calendar, the time on a clock,
 * repeat, a reminder, priority, a tag and small steps. Nothing is guessed from the text.
 */
export function TaskSheet({ task, initial, day, onClose }: { task?: Task; initial?: string; day?: string | null; onClose: () => void }) {
  const t = useTheme();
  const today = dateKey();
  const editing = !!task;
  const [title, setTitle] = useState(task?.title ?? initial ?? '');
  const [note, setNote] = useState(task?.note ?? '');
  const [due, setDue] = useState<string | null>(task ? task.due : day ?? null);
  const [time, setTime] = useState<number | null>(task?.time ?? null);
  const [repeat, setRepeat] = useState<Repeat | null>(task?.repeat ?? null);
  const [remind, setRemind] = useState(task?.remind ?? false);
  const [priority, setPriority] = useState<Priority>(task?.priority ?? 3);
  const [tag, setTag] = useState(task?.tag ?? '');
  const [newTag, setNewTag] = useState('');
  const [subs, setSubs] = useState<Sub[]>(task?.subs ?? []);
  const [sub, setSub] = useState('');
  const [open, setOpen] = useState<Open>(null);
  const [sure, setSure] = useState(false);
  const tags = [...new Set([...(tag ? [tag] : []), ...readTasks().map((x) => x.tag).filter((x): x is string => !!x)])].slice(0, 10);
  const ok = !!title.trim();
  const toggle = (o: Open) => {
    ease();
    setOpen(open === o ? null : o);
  };

  const save = async () => {
    if (!ok) return;
    tap();
    const next: Task = {
      ...(task ?? { id: taskId(stamp()), done: null, created: today }),
      title: title.trim(),
      due: due ?? (repeat ? today : null),
      time,
      priority,
      subs,
      repeat,
      remind: remind && time != null,
    };
    if (tag) next.tag = tag;
    else delete next.tag;
    if (note.trim()) next.note = note.trim();
    else delete next.note;
    saveTask(next);
    if (next.remind) await allowReminders().catch(() => false);
    onClose();
  };
  // Asked right here (a dialog would open behind this sheet on the web), with undo after.
  const remove = () => {
    if (!task) return;
    tap();
    const before = readTasks();
    deleteTask(task.id);
    onClose();
    showUndo('اتمسحت المهمة', () => {
      if (!readTasks().some((x) => x.id === task.id)) saveTask(before.find((x) => x.id === task.id) ?? task);
    });
  };
  const addSub = () => {
    if (!sub.trim()) return;
    setSubs([...subs, { id: taskId(stamp(), subs.length + 1), title: sub.trim(), done: false }]);
    setSub('');
  };

  return (
    <Sheet visible onClose={onClose} title={editing ? 'تعديل المهمة' : 'مهمة جديدة'}>
      <TextInput
        value={title}
        onChangeText={setTitle}
        autoFocus={!editing}
        multiline
        placeholder="عايز تعمل إيه؟"
        placeholderTextColor={t.mute}
        maxLength={140}
        accessibilityLabel="المهمة"
        style={[s.title, { color: t.fg, fontFamily: F.semi }]}
      />
      <TextInput
        value={note}
        onChangeText={setNote}
        multiline
        placeholder="ملاحظة (اختياري)"
        placeholderTextColor={t.mute}
        maxLength={400}
        accessibilityLabel="ملاحظة"
        style={[s.note, { color: t.fg, fontFamily: F.body }]}
      />

      <View style={[s.group, { backgroundColor: t.soft }]}>
        <Row t={t} icon="calendar" color="#E0573B" label="التاريخ" value={due ? dueAr(due, today) : 'من غير'} on={open === 'date'} onPress={() => toggle('date')} onClear={due ? () => { ease(); setDue(null); setRepeat(null); if (open === 'date') setOpen(null); } : undefined} />
        {open === 'date' ? (
          <View style={[s.panel, { backgroundColor: t.card }]}>
            <MonthCalendar
              value={due}
              today={today}
              onPick={(d) => {
                tap();
                ease();
                setDue(d);
                setOpen(null);
              }}
            />
          </View>
        ) : null}
        <Line t={t} />
        <Row
          t={t}
          icon="time"
          color="#3B7BE0"
          label="الوقت"
          value={time != null ? timeAr(time) : 'من غير'}
          on={open === 'time'}
          onPress={() => {
            if (time == null) {
              // The clock opens on the time now (to the next 5 minutes), like the phone's own picker.
              const d = new Date();
              setTime((Math.ceil((d.getHours() * 60 + d.getMinutes()) / 5) * 5) % 1440);
              if (!due) setDue(today);
            }
            toggle('time');
          }}
          onClear={time != null ? () => { ease(); setTime(null); setRemind(false); if (open === 'time') setOpen(null); } : undefined}
        />
        {open === 'time' && time != null ? (
          <View style={[s.panel, { backgroundColor: t.card }]}>
            <ClockPicker value={time} onChange={setTime} />
            <Pressable onPress={() => toggle('time')} accessibilityRole="button" style={({ pressed }) => [s.done, { backgroundColor: t.ok, opacity: pressed ? 0.85 : 1 }]}>
              <T w="semi" style={{ color: t.onOk, fontSize: 14 }}>تمام</T>
            </Pressable>
          </View>
        ) : null}
        <Line t={t} />
        <Row t={t} icon="repeat" color="#3E9A68" label="التكرار" value={repeat ? REPEAT_AR[repeat] : 'مرة واحدة'} on={open === 'repeat'} onPress={() => toggle('repeat')} />
        {open === 'repeat' ? (
          <View style={[s.chips, { paddingHorizontal: 12, paddingBottom: 12 }]}>
            {([null, 'daily', 'weekdays', 'weekly', 'monthly'] as (Repeat | null)[]).map((r) => (
              <Chip key={String(r)} t={t} label={r ? REPEAT_AR[r] : 'مرة واحدة'} on={repeat === r} onPress={() => { ease(); setRepeat(r); if (r && !due) setDue(today); setOpen(null); }} />
            ))}
          </View>
        ) : null}
        <Line t={t} />
        <Row t={t} icon="flag" color={PRIORITY[priority].color} label="الأهمية" value={PRIORITY[priority].label} valueColor={PRIORITY[priority].color} on={open === 'priority'} onPress={() => toggle('priority')} />
        {open === 'priority' ? (
          <View style={[s.chips, { paddingHorizontal: 12, paddingBottom: 12 }]}>
            {([1, 2, 3, 4] as Priority[]).map((p) => (
              <Chip key={p} t={t} label={PRIORITY[p].label} dot={PRIORITY[p].color} on={priority === p} color={PRIORITY[p].color} onPress={() => { ease(); setPriority(p); setOpen(null); }} />
            ))}
          </View>
        ) : null}
        <Line t={t} />
        <Row t={t} icon="pricetag" color="#7A5CFA" label="التصنيف" value={tag ? `# ${tag}` : 'من غير'} valueColor={tag ? tagColor(tag) : undefined} on={open === 'tag'} onPress={() => toggle('tag')} onClear={tag ? () => setTag('') : undefined} />
        {open === 'tag' ? (
          <View style={[s.chips, { paddingHorizontal: 12, paddingBottom: 12 }]}>
            {tags.map((x) => <Chip key={x} t={t} label={`# ${x}`} on={tag === x} color={tagColor(x)} onPress={() => { ease(); setTag(tag === x ? '' : x); setOpen(null); }} />)}
            <TextInput
              value={newTag}
              onChangeText={setNewTag}
              onSubmitEditing={() => {
                const v = newTag.replace(/^#/, '').trim();
                if (v) setTag(v);
                setNewTag('');
              }}
              onBlur={() => {
                const v = newTag.replace(/^#/, '').trim();
                if (v) setTag(v);
                setNewTag('');
              }}
              placeholder="+ تصنيف"
              placeholderTextColor={t.mute}
              maxLength={16}
              accessibilityLabel="تصنيف جديد"
              style={[s.tagIn, { color: t.fg, backgroundColor: t.soft, fontFamily: F.body }]}
            />
          </View>
        ) : null}
        <Line t={t} />
        <Pressable onPress={() => setRemind(!remind)} disabled={time == null} accessibilityRole="switch" accessibilityLabel="فكّرني" accessibilityState={{ checked: remind && time != null, disabled: time == null }} style={[s.row, { opacity: time == null ? 0.55 : 1 }]}>
          <View style={[s.icon, { backgroundColor: '#E8902A' }]}>
            <Ionicons name="notifications" size={16} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <T style={{ fontSize: 15 }}>فكّرني في ميعادها</T>
            {time == null ? <T style={{ fontSize: 11.5, color: t.mute }}>حدّد الوقت الأول</T> : null}
          </View>
          {/* RTL: off = thumb at the start (right), on = end (left), like settings. */}
          <View style={[s.track, { backgroundColor: remind && time != null ? t.ok : t.line, alignItems: remind && time != null ? 'flex-end' : 'flex-start' }]}>
            <View style={s.thumb} />
          </View>
        </Pressable>
      </View>

      <T style={[s.lbl, { color: t.mute }]}>{subs.length ? `المهام الفرعية · ${subs.filter((x) => x.done).length} من ${subs.length}` : 'المهام الفرعية'}</T>
      {subs.map((x) => (
        <View key={x.id} style={s.subRow}>
          <Pressable onPress={() => setSubs(subs.map((y) => (y.id === x.id ? { ...y, done: !y.done } : y)))} accessibilityRole="checkbox" accessibilityState={{ checked: x.done }} accessibilityLabel={x.title} hitSlop={8}>
            <Ionicons name={x.done ? 'checkmark-circle' : 'ellipse-outline'} size={23} color={x.done ? t.ok : t.mute} />
          </Pressable>
          <T style={{ flex: 1, fontSize: 14.5, color: x.done ? t.mute : t.fg, textDecorationLine: x.done ? 'line-through' : 'none' }}>{x.title}</T>
          <Pressable onPress={() => setSubs(subs.filter((y) => y.id !== x.id))} hitSlop={10} accessibilityRole="button" accessibilityLabel={`امسح ${x.title}`}>
            <Ionicons name="close" size={18} color={t.mute} />
          </Pressable>
        </View>
      ))}
      <View style={[s.subAdd, { backgroundColor: t.soft }]}>
        <Ionicons name="add" size={20} color={t.mute} />
        <TextInput
          value={sub}
          onChangeText={setSub}
          submitBehavior="submit"
          onSubmitEditing={addSub}
          placeholder="ضيف مهمة فرعية"
          placeholderTextColor={t.mute}
          maxLength={80}
          accessibilityLabel="مهمة فرعية جديدة"
          style={[s.subIn, { color: t.fg, fontFamily: F.body }]}
        />
        {sub.trim() ? (
          <Pressable onPress={addSub} hitSlop={8} accessibilityRole="button" accessibilityLabel="ضيف المهمة الفرعية">
            <Ionicons name="checkmark" size={22} color={t.ok} />
          </Pressable>
        ) : null}
      </View>

      <Pressable onPress={save} disabled={!ok} accessibilityRole="button" style={({ pressed }) => [s.save, { backgroundColor: t.ok, opacity: ok ? (pressed ? 0.85 : 1) : 0.45 }]}>
        <T w="bold" style={{ color: t.onOk, fontSize: 16 }}>{editing ? 'احفظ' : 'ضيف المهمة'}</T>
      </Pressable>
      {editing && !sure ? (
        <Pressable onPress={() => setSure(true)} accessibilityRole="button" style={({ pressed }) => [s.del, { opacity: pressed ? 0.6 : 1 }]}>
          <Ionicons name="trash-outline" size={17} color={t.bad} />
          <T w="semi" style={{ color: t.bad, fontSize: 14 }}>امسح المهمة</T>
        </Pressable>
      ) : null}
      {editing && sure ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable onPress={() => setSure(false)} accessibilityRole="button" style={({ pressed }) => [s.sure, { backgroundColor: t.soft, opacity: pressed ? 0.7 : 1 }]}>
            <T w="semi" style={{ fontSize: 14 }}>لا، سيبها</T>
          </Pressable>
          <Pressable onPress={remove} accessibilityRole="button" accessibilityLabel="أكيد امسحها" style={({ pressed }) => [s.sure, { backgroundColor: t.bad, opacity: pressed ? 0.8 : 1 }]}>
            <T w="semi" style={{ fontSize: 14, color: '#FFFFFF' }}>امسحها</T>
          </Pressable>
        </View>
      ) : null}
    </Sheet>
  );
}

function Row({ t, icon, color, label, value, valueColor, on, onPress, onClear }: { t: Theme; icon: React.ComponentProps<typeof Ionicons>['name']; color: string; label: string; value: string; valueColor?: string; on: boolean; onPress: () => void; onClear?: () => void }) {
  return (
    <View style={s.row}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} accessibilityState={{ expanded: on }} style={({ pressed }) => [s.rowBtn, { opacity: pressed ? 0.6 : 1 }]}>
        <View style={[s.icon, { backgroundColor: color }]}>
          <Ionicons name={icon} size={16} color="#FFFFFF" />
        </View>
        <T style={{ fontSize: 15, flex: 1 }}>{label}</T>
        <T w="semi" style={{ fontSize: 14, color: valueColor ?? (onClear ? t.okText : t.mute) }} numberOfLines={1}>{value}</T>
        {!onClear ? <Ionicons name={on ? 'chevron-up' : 'chevron-down'} size={16} color={t.mute} /> : null}
      </Pressable>
      {onClear ? (
        <Pressable onPress={onClear} hitSlop={10} accessibilityRole="button" accessibilityLabel={`شيل ${label}`} style={s.clear}>
          <Ionicons name="close-circle" size={20} color={t.mute} />
        </Pressable>
      ) : null}
    </View>
  );
}

const Line = ({ t }: { t: Theme }) => <View style={{ height: 1, backgroundColor: t.line, marginStart: 52 }} />;

function Chip({ t, label, on, onPress, color, dot }: { t: Theme; label: string; on: boolean; onPress: () => void; color?: string; dot?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} style={({ pressed }) => [s.chip, { backgroundColor: on ? color ?? t.fg : t.soft, opacity: pressed ? 0.7 : 1 }]}>
      {dot ? <View style={[s.pdot, { backgroundColor: on ? '#FFFFFF' : dot }]} /> : null}
      <T w="semi" style={{ fontSize: 13, color: on ? (color ? '#FFFFFF' : t.bg) : t.fg }}>{label}</T>
    </Pressable>
  );
}

const s = StyleSheet.create({
  title: { fontSize: 19, minHeight: 44, textAlign: 'right', outlineWidth: 0, padding: 0, lineHeight: 29 },
  note: { fontSize: 14, minHeight: 24, textAlign: 'right', outlineWidth: 0, padding: 0, lineHeight: 22, marginTop: -4 },
  group: { borderRadius: 12, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52, paddingHorizontal: 12 },
  rowBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52 },
  icon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  clear: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center' },
  panel: { marginHorizontal: 8, marginBottom: 8, borderRadius: 14, padding: 10, gap: 10 },
  done: { height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  lbl: { fontSize: 12.5, marginBottom: -4, marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, alignItems: 'center' },
  chip: { minHeight: 36, borderRadius: 13, paddingHorizontal: 12, justifyContent: 'center', flexDirection: 'row', alignItems: 'center', gap: 6 },
  pdot: { width: 8, height: 8, borderRadius: 4 },
  tagIn: { height: 36, minWidth: 90, borderRadius: 13, paddingHorizontal: 10, fontSize: 13, textAlign: 'right', outlineWidth: 0 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40 },
  subAdd: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, borderRadius: 12, paddingHorizontal: 10 },
  subIn: { flex: 1, height: 44, fontSize: 14, textAlign: 'right', outlineWidth: 0 },
  save: { height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  sure: { flex: 1, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  track: { width: 50, height: 30, borderRadius: 15, padding: 2, justifyContent: 'center' },
  thumb: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#FFFFFF', boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.25)' },
  del: { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', height: 44 },
});
