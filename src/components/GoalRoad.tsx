import React, { useState } from 'react';
import { Item } from './Motion';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Btn, Sheet, T } from './ui';
import { saveGoal } from '../lib/goalStore';
import { showUndo } from '../lib/undo';
import { currentStage, goalId, moveStage, stageDone, toggleTask, type Goal, type Stage, type Task } from '../lib/goals';
import { tap } from '../lib/timer';
import { tint, type Theme, font } from '../theme';

type Row =
  | { kind: 'stage'; st: Stage; i: number; state: 'done' | 'now' | 'later'; open: boolean }
  | { kind: 'task'; st: Stage; task: Task; state: 'done' | 'now' | 'later' }
  | { kind: 'addTask'; st: Stage }
  | { kind: 'addStage' };

const RAIL = 44;
/** Beads slide into place instead of jumping (open a stage, tick, add). */
const ease = () => {
  // Reanimated layout transitions (Item) animate list changes now.
};
/** A new id for a stage or task (called from handlers only). */
const freshId = () => goalId(Date.now());

/**
 * The road to a goal as one vertical chain of connected beads: a big bead per stage (✓ done, lit while you're on it,
 * grey after), small beads for its tasks (tap to tick), and a "+" bead at the end of each open stage and of the road
 * where you type the next one in place. Long-press any bead to rename, move or delete it.
 */
export function GoalRoad({ g, t, today }: { g: Goal; t: Theme; today: string }) {
  const cur = currentStage(g);
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [edit, setEdit] = useState<{ st: Stage; task?: Task } | null>(null);

  const isOpen = (st: Stage, i: number) => opened[st.id] ?? i === cur;
  const rows: Row[] = [];
  g.stages.forEach((st, i) => {
    const state = stageDone(st) ? 'done' : i === cur ? 'now' : 'later';
    const open = isOpen(st, i);
    rows.push({ kind: 'stage', st, i, state, open });
    if (open) {
      for (const task of st.tasks) rows.push({ kind: 'task', st, task, state });
      rows.push({ kind: 'addTask', st });
    }
  });
  rows.push({ kind: 'addStage' });

  // A segment is ink once you've passed it: everything up to the last thing done.
  const doneRow = (r: Row) => (r.kind === 'stage' && r.state === 'done') || (r.kind === 'task' && !!r.task.done);
  const lastDone = rows.reduce((a, r, i) => (doneRow(r) ? i : a), -1);

  const submit = (key: string) => {
    const title = text.trim();
    if (!title) return setAdding(null);
    tap();
    ease();
    if (key === 'stage') {
      const st: Stage = { id: freshId(), title, tasks: [] };
      saveGoal({ ...g, stages: [...g.stages, st] });
      setOpened({ ...opened, [st.id]: true });
      setAdding(st.id); // straight on to its first task
    } else {
      saveGoal({ ...g, stages: g.stages.map((x) => (x.id === key ? { ...x, tasks: [...x.tasks, { id: freshId(), title, done: null }] } : x)) });
    }
    setText('');
  };

  const input = (key: string, ph: string, big: boolean) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <TextInput
        value={text}
        onChangeText={setText}
        autoFocus
        placeholder={ph}
        placeholderTextColor={t.mute}
        maxLength={80}
        submitBehavior="submit"
        returnKeyType="done"
        onSubmitEditing={() => submit(key)}
        accessibilityLabel={ph}
        style={[s.input, { fontSize: big ? 16 : 14.5, color: t.fg, backgroundColor: t.card, borderColor: tint(t.fg, 0.15), ...font(big ? 'semi' : 'body') }]}
      />
      <Pressable onPress={() => submit(key)} accessibilityRole="button" accessibilityLabel="ضيف" style={({ pressed }) => [s.ok, { backgroundColor: t.fg, opacity: pressed ? 0.7 : 1 }]}>
        <Ionicons name="checkmark" size={20} color={t.bg} />
      </Pressable>
      <Pressable onPress={() => setAdding(null)} hitSlop={6} accessibilityRole="button" accessibilityLabel="الغي" style={({ pressed }) => [s.ok, { width: 36, opacity: pressed ? 0.5 : 1 }]}>
        <Ionicons name="close" size={20} color={t.mute} />
      </Pressable>
    </View>
  );

  return (
    <View style={{ paddingVertical: 4 }}>
      {edit ? <EditSheet g={g} t={t} st={edit.st} task={edit.task} onClose={() => setEdit(null)} /> : null}
      {rows.map((r, idx) => {
        const above = idx === 0 ? null : idx <= lastDone ? t.fg : tint(t.fg, 0.14);
        const below = idx === rows.length - 1 ? null : idx < lastDone ? t.fg : tint(t.fg, 0.14);
        const big = r.kind === 'stage' || r.kind === 'addStage';
        const key = r.kind === 'addStage' ? 'add-stage' : r.kind === 'stage' ? r.st.id : r.kind === 'task' ? r.task.id : `add-${r.st.id}`;

        let bead: React.ReactNode;
        let body: React.ReactNode;
        let onPress: (() => void) | undefined;
        let onLong: (() => void) | undefined;
        let label = '';

        if (r.kind === 'stage') {
          const n = r.st.tasks.filter((x) => x.done).length;
          bead = (
            <View style={[s.big, r.state === 'done' ? { backgroundColor: t.fg } : r.state === 'now' ? { backgroundColor: t.card, borderWidth: 2.5, borderColor: t.fg, boxShadow: `0px 0px 0px 5px ${tint(t.fg, 0.08)}` } : { backgroundColor: t.bg, borderWidth: 1.5, borderColor: tint(t.fg, 0.2) }]}>
              {r.state === 'done' ? <Ionicons name="checkmark" size={18} color={t.bg} /> : <T w="numBold" style={{ fontSize: 14, color: r.state === 'now' ? t.fg : t.mute }}>{String(r.i + 1)}</T>}
            </View>
          );
          body = (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <T w="bold" style={{ fontSize: 16.5, color: r.state === 'later' ? t.mute : t.fg }}>{r.st.title}</T>
                <T style={{ fontSize: 12, color: t.mute }}>{r.state === 'done' ? 'خلصت ✓' : r.state === 'now' ? `دلوقتي · ${n} من ${r.st.tasks.length}` : r.st.tasks.length ? `${r.st.tasks.length} خطوات` : 'لسه فاضية'}</T>
              </View>
              <Ionicons name={r.open ? 'chevron-up' : 'chevron-down'} size={16} color={t.mute} />
            </View>
          );
          onPress = () => {
            ease();
            setOpened({ ...opened, [r.st.id]: !r.open });
          };
          onLong = () => setEdit({ st: r.st });
          label = r.st.title;
        } else if (r.kind === 'task') {
          const done = !!r.task.done;
          bead = (
            <View style={[s.small, done ? { backgroundColor: t.fg } : r.state === 'now' ? { borderWidth: 2, borderColor: t.ok, backgroundColor: t.card } : { borderWidth: 1.5, borderColor: tint(t.fg, 0.2), backgroundColor: t.bg }]}>
              {done ? <Ionicons name="checkmark" size={13} color={t.bg} /> : null}
            </View>
          );
          body = <T style={{ fontSize: 14.5, lineHeight: 22, color: done ? t.mute : t.fg, textDecorationLine: done ? 'line-through' : 'none' }}>{r.task.title}</T>;
          onPress = () => {
            tap();
            ease();
            saveGoal(toggleTask(g, r.task.id, today));
          };
          onLong = () => setEdit({ st: r.st, task: r.task });
          label = r.task.title;
        } else {
          const k = r.kind === 'addStage' ? 'stage' : r.st.id;
          const on = adding === k;
          bead = (
            <View style={[big ? s.big : s.small, { borderWidth: 1.5, borderStyle: 'dashed', borderColor: on ? t.fg : tint(t.fg, 0.3), backgroundColor: t.bg }]}>
              <Ionicons name="add" size={big ? 20 : 14} color={on ? t.fg : t.mute} />
            </View>
          );
          body = on
            ? input(k, k === 'stage' ? 'اسم المرحلة الجاية' : 'خطوة جديدة', big)
            : <T style={{ fontSize: big ? 15 : 13.5, color: t.mute }}>{k === 'stage' ? 'مرحلة جديدة' : 'ضيف خطوة'}</T>;
          onPress = on ? undefined : () => {
            setText('');
            setAdding(k);
          };
          label = k === 'stage' ? 'ضيف مرحلة' : `ضيف خطوة في ${r.kind === 'addTask' ? r.st.title : ''}`;
        }

        const rail = (
          <>
            <View style={s.rail}>
              <View style={[s.line, { height: big ? 10 : 12, backgroundColor: above ?? 'transparent' }]} />
              {bead}
              <View style={[s.line, { flex: 1, minHeight: 10, backgroundColor: below ?? 'transparent' }]} />
            </View>
            <View style={{ flex: 1, paddingTop: 10, paddingBottom: big ? 16 : 10, minHeight: big ? 64 : 44 }}>{body}</View>
          </>
        );
        // While you type in a "+" bead the row is a plain view (its ✓ and ✕ are buttons of their own).
        if (!onPress && !onLong) return <View key={key} style={s.row}>{rail}</View>;
        return (
          <Item key={key}><Pressable
            onPress={onPress}
            onLongPress={onLong}
            delayLongPress={350}
            accessibilityRole={r.kind === 'task' ? 'checkbox' : 'button'}
            accessibilityState={r.kind === 'task' ? { checked: !!r.task.done } : undefined}
            accessibilityLabel={label}
            accessibilityHint={onLong ? 'دوسة طويلة للتعديل أو المسح' : undefined}
            style={({ pressed }) => [s.row, { opacity: pressed && onPress ? 0.6 : 1 }]}>
            {rail}
          </Pressable></Item>
        );
      })}
    </View>
  );
}

/** Long-press on a bead: rename it, move a stage, or delete it. */
function EditSheet({ g, t, st, task, onClose }: { g: Goal; t: Theme; st: Stage; task?: Task; onClose: () => void }) {
  const [name, setName] = useState(task ? task.title : st.title);
  const i = g.stages.findIndex((x) => x.id === st.id);
  const save = () => {
    const v = name.trim();
    if (!v) return;
    saveGoal({ ...g, stages: g.stages.map((x) => (x.id !== st.id ? x : task ? { ...x, tasks: x.tasks.map((y) => (y.id === task.id ? { ...y, title: v } : y)) } : { ...x, title: v })) });
    onClose();
  };
  const remove = () => {
    saveGoal({ ...g, stages: task ? g.stages.map((x) => (x.id === st.id ? { ...x, tasks: x.tasks.filter((y) => y.id !== task.id) } : x)) : g.stages.filter((x) => x.id !== st.id) });
    showUndo(task ? 'اتمسحت خطوة' : 'اتمسحت مرحلة', () => saveGoal(g));
    onClose();
  };
  return (
    <Sheet visible onClose={onClose} title={task ? 'الخطوة' : 'المرحلة'} sub={task ? st.title : `${st.tasks.length} خطوات`}>
      <TextInput value={name} onChangeText={setName} autoFocus maxLength={80} onSubmitEditing={save} accessibilityLabel="الاسم" style={[s.input, { flex: 0, color: t.fg, backgroundColor: t.soft, borderColor: 'transparent', ...font('body') }]} />
      {!task ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Btn label="↑ طلّعها" onPress={() => { saveGoal(moveStage(g, st.id, -1)); onClose(); }} style={{ flex: 1, opacity: i > 0 ? 1 : 0.4 }} />
          <Btn label="↓ نزّلها" onPress={() => { saveGoal(moveStage(g, st.id, 1)); onClose(); }} style={{ flex: 1, opacity: i < g.stages.length - 1 ? 1 : 0.4 }} />
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Btn label={task ? 'امسح الخطوة' : 'امسح المرحلة'} onPress={remove} style={{ flex: 1 }} />
        <Btn label="احفظ" kind="solid" onPress={save} style={{ flex: 1 }} />
      </View>
    </Sheet>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  rail: { width: RAIL, alignItems: 'center' },
  line: { width: 2.5, borderRadius: 2 },
  big: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  small: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginVertical: 1 },
  input: { flex: 1, minWidth: 0, height: 44, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, textAlign: 'right', outlineWidth: 0 },
  ok: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
