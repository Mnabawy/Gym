import React, { useState } from 'react';
import { Item } from './Motion';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { INPUT, Btn, Sheet, T } from './ui';
import { ACTION, Swipe, type SwipeAction } from './Swipe';
import { saveGoal } from '../lib/goalStore';
import { showUndo } from '../lib/undo';
import { NoteEditor, NoteView } from './NoteEditor';
import { currentStage, duplicateTask, fmtAmount, goalId, moveStage, schedule, amountOf, setSplit, spreadMilestones, stageFill, unassigned, stageDone, toggleTask, type Goal, type Stage, type Task } from '../lib/goals';
import { MonthCalendar } from './MonthCalendar';
import { dateKey } from '../lib/logic';
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
  // Dates for every step and stage, spread over the goal's time frame (only when it has a due date).
  const plan = schedule(g);
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [edit, setEdit] = useState<{ st: Stage; task?: Task; notes?: boolean } | null>(null);
  const [shown, setShown] = useState<Record<string, boolean>>({});

  const isOpen = (st: Stage, i: number) => opened[st.id] ?? i === cur;
  const rows: Row[] = [];
  g.stages.forEach((st, i) => {
    const state = stageDone(st, g) ? 'done' : i === cur ? 'now' : 'later';
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
        style={[INPUT, s.input, { fontSize: big ? 16 : 14.5, color: t.fg, backgroundColor: t.card, borderColor: tint(t.fg, 0.15), ...font(big ? 'semi' : 'body') }]}
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
      {edit ? <EditSheet g={g} t={t} st={edit.st} task={edit.task} notesFirst={edit.notes} onClose={() => setEdit(null)} /> : null}
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
        let start: SwipeAction[] = [];
        let end: SwipeAction[] = [];

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
                <T w="semi" style={{ fontSize: 15, color: r.state === 'later' ? t.mute : t.fg }}>{r.st.title}</T>
                <T style={{ fontSize: 12, color: t.mute }}>{r.state === 'done' ? 'خلصت ✓' : r.state === 'now' ? `دلوقتي · ${n} من ${r.st.tasks.length}` : r.st.tasks.length ? `${r.st.tasks.length} خطوات` : 'لسه فاضية'}</T>
                {amountOf(g, r.i) !== null ? <Milestone g={g} t={t} i={r.i} /> : null}
                {r.st.note?.trim() ? (
                  r.open ? (
                    <View style={[s.note, { backgroundColor: tint(t.fg, 0.04) }]}>
                      <NoteView t={t} text={r.st.note} size={13} />
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <Ionicons name="document-text-outline" size={12} color={t.mute} />
                      <T style={{ fontSize: 11.5, color: t.mute }}>فيها تفاصيل</T>
                    </View>
                  )
                ) : null}
                {plan?.stage[r.st.id] && r.state !== 'done' ? (
                  <T style={{ fontSize: 11.5, color: plan.stage[r.st.id].to < today ? t.bad : t.mute }}>{`${dayShort(plan.stage[r.st.id].from)} ← ${dayShort(plan.stage[r.st.id].to)}`}</T>
                ) : null}
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
          start = [{ icon: 'add', label: 'خطوة', color: ACTION.blue, onPress: () => {
            setOpened({ ...opened, [r.st.id]: true });
            setText('');
            setAdding(r.st.id);
          } }];
          end = [
            { icon: 'trash', label: 'امسح', color: ACTION.red, onPress: () => removeBead(g, r.st) },
            { icon: 'create-outline', label: 'عدّل', color: ACTION.grey, onPress: () => setEdit({ st: r.st }) },
            { icon: 'document-text-outline', label: 'تفاصيل', color: ACTION.indigo, onPress: () => setEdit({ st: r.st, notes: true }) },
          ];
        } else if (r.kind === 'task') {
          const done = !!r.task.done;
          bead = (
            <View style={[s.small, done ? { backgroundColor: t.fg } : r.state === 'now' ? { borderWidth: 2, borderColor: t.ok, backgroundColor: t.card } : { borderWidth: 1.5, borderColor: tint(t.fg, 0.2), backgroundColor: t.bg }]}>
              {done ? <Ionicons name="checkmark" size={13} color={t.bg} /> : null}
            </View>
          );
          const when = plan?.task[r.task.id];
          const note = r.task.note?.trim() ? r.task.note : '';
          const open = !!shown[r.task.id];
          const tid = r.task.id;
          body = (
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <T style={{ flex: 1, fontSize: 14, lineHeight: 20, color: done ? t.mute : t.fg, textDecorationLine: done ? 'line-through' : 'none' }}>{r.task.title}</T>
                {when && !done ? (
                  <T style={{ fontSize: 11.5, color: when < today ? t.bad : r.task.due ? t.okText : t.mute, ...font('num') }}>{dayShort(when)}</T>
                ) : null}
                {/* The step's details open in place (a tap on the row ticks it). */}
                {note ? (
                  <Pressable onPress={() => { ease(); setShown({ ...shown, [tid]: !open }); }} hitSlop={8} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel="تفاصيل الخطوة" style={s.noteBtn}>
                    <Ionicons name={open ? 'document-text' : 'document-text-outline'} size={16} color={open ? t.okText : t.mute} />
                  </Pressable>
                ) : null}
              </View>
              {note && open ? (
                <View style={[s.note, { backgroundColor: tint(t.fg, 0.04), marginTop: 4 }]}>
                  <NoteView t={t} text={note} size={12.5} />
                </View>
              ) : null}
            </View>
          );
          onPress = () => {
            tap();
            ease();
            saveGoal(toggleTask(g, r.task.id, today));
          };
          onLong = () => setEdit({ st: r.st, task: r.task });
          label = r.task.title;
          const tick = () => saveGoal(toggleTask(g, r.task.id, today));
          start = [done ? { icon: 'arrow-undo', label: 'رجّعها', color: ACTION.grey, onPress: tick } : { icon: 'checkmark', label: 'خلصت', color: ACTION.green, onPress: tick }];
          end = [
            { icon: 'trash', label: 'امسح', color: ACTION.red, onPress: () => removeBead(g, r.st, r.task) },
            { icon: 'create-outline', label: 'عدّل', color: ACTION.grey, onPress: () => setEdit({ st: r.st, task: r.task }) },
            { icon: 'copy-outline', label: 'كرّر', color: ACTION.blue, onPress: () => copyStep(g, r.task) },
            { icon: 'document-text-outline', label: 'تفاصيل', color: ACTION.indigo, onPress: () => setEdit({ st: r.st, task: r.task, notes: true }) },
          ];
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
              <View style={[s.line, { height: big ? 6 : 8, backgroundColor: above ?? 'transparent' }]} />
              {bead}
              <View style={[s.line, { flex: 1, minHeight: 10, backgroundColor: below ?? 'transparent' }]} />
            </View>
            <View style={{ flex: 1, paddingTop: 6, paddingBottom: big ? 10 : 6, minHeight: big ? 50 : 40 }}>{body}</View>
          </>
        );
        // While you type in a "+" bead the row is a plain view (its ✓ and ✕ are buttons of their own).
        if (!onPress && !onLong) return <View key={key} style={s.row}>{rail}</View>;
        // The row is the card's color, so the swipe actions stay hidden under it until you drag.
        return (
          <Item key={key}><Swipe start={start} end={end}><Pressable
            onPress={onPress}
            onLongPress={onLong}
            delayLongPress={350}
            accessibilityRole={r.kind === 'task' ? 'checkbox' : 'button'}
            accessibilityState={r.kind === 'task' ? { checked: !!r.task.done } : undefined}
            accessibilityLabel={label}
            accessibilityHint={onLong ? 'دوسة طويلة للتعديل أو المسح' : undefined}
            style={({ pressed }) => [s.row, { backgroundColor: t.card }, { opacity: pressed && onPress ? 0.6 : 1 }]}>
            {rail}
          </Pressable></Swipe></Item>
        );
      })}
    </View>
  );
}

const MONTHS_SHORT = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
/** "12 ديسمبر" (the year only when it isn't this year). */
const dayShort = (d: string) => `${+d.slice(8)} ${MONTHS_SHORT[+d.slice(5, 7) - 1]}${d.slice(0, 4) !== new Date().toISOString().slice(0, 4) ? ` ${d.slice(0, 4)}` : ''}`;

/** Deletes a stage (with its tasks) or one task, with undo. */
/** Duplicate a step right under it (undoable). */
function copyStep(g: Goal, task: Task) {
  tap();
  saveGoal(duplicateTask(g, task.id, goalId(Date.now())));
  showUndo('اتعملت نسخة من الخطوة', () => saveGoal(g));
}

function removeBead(g: Goal, st: Stage, task?: Task) {
  saveGoal({ ...g, stages: task ? g.stages.map((x) => (x.id === st.id ? { ...x, tasks: x.tasks.filter((y) => y.id !== task.id) } : x)) : g.stages.filter((x) => x.id !== st.id) });
  showUndo(task ? 'اتمسحت خطوة' : 'اتمسحت مرحلة', () => saveGoal(g));
}

/**
 * A stage's own amount: how much of it is filled (what you logged, after the stages before it took theirs), what's
 * left, and a thin bar. ✓ once it's all filled.
 */
function Milestone({ g, t, i }: { g: Goal; t: Theme; i: number }) {
  const f = stageFill(g, i);
  if (!f) return null;
  const done = f.left <= 1e-9;
  const m = (n: number) => `\u2066${fmtAmount(n, g.unit)}\u2069`;
  return (
    <View style={{ gap: 3, marginTop: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
        <Ionicons name={done ? 'flag' : 'flag-outline'} size={12} color={done ? t.green : t.okText} />
        <T w="numBold" style={{ fontSize: 12.5, color: done ? t.green : t.fg }}>{done ? m(f.of) : `${m(f.got)} من ${m(f.of)}`}</T>
        <T style={{ fontSize: 12, color: t.mute }}>{done ? 'اتملت ✓' : `فاضل ${m(f.left)}`}</T>
      </View>
      {!done ? (
        <View style={{ height: 4, borderRadius: 2, backgroundColor: tint(t.fg, 0.08), overflow: 'hidden', maxWidth: 180 }}>
          <View style={{ width: `${(f.got / f.of) * 100}%`, height: 4, borderRadius: 2, backgroundColor: t.okText }} />
        </View>
      ) : null}
    </View>
  );
}

/** Long-press on a bead: rename it, move a stage, or delete it. */
function EditSheet({ g, t, st, task, onClose, notesFirst }: { g: Goal; t: Theme; st: Stage; task?: Task; onClose: () => void; notesFirst?: boolean }) {
  const [name, setName] = useState(task ? task.title : st.title);
  const [note, setNote] = useState((task ? task.note : st.note) ?? '');
  const [picking, setPicking] = useState(false);
  const [mark, setMark] = useState(st.amount !== undefined ? String(st.amount) : '');
  const i = g.stages.findIndex((x) => x.id === st.id);
  const plan = schedule(g);
  const own = task ? task.due : st.until;
  const when = task ? plan?.task[task.id] : plan?.stage[st.id]?.to;
  /** Your own date for this step / the stage's end, or undefined to let it be spread out again. */
  const setDate = (d: string | undefined) => {
    tap();
    const put = <X extends object>(x: X, k: 'due' | 'until'): X => {
      const y = { ...x } as Record<string, unknown>;
      if (d) y[k] = d;
      else delete y[k];
      return y as X;
    };
    saveGoal({ ...g, stages: g.stages.map((x) => (x.id !== st.id ? x : task ? { ...x, tasks: x.tasks.map((y) => (y.id === task.id ? put(y, 'due') : y)) } : put(x, 'until'))) });
    setPicking(false);
  };
  /** The stage's amount typed in: a number above 0, or empty to take it off. */
  const markVal = () => {
    const n = Math.abs(Number(mark.replace(/[,،\s]/g, '').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))));
    return mark.trim() && Number.isFinite(n) && n > 0 ? n : undefined;
  };
  const save = () => {
    const v = name.trim();
    if (!v) return;
    const at = markVal();
    const withMark = (x: Stage): Stage => {
      const { amount: _old, note: _n, ...rest } = x;
      const body = note.trim() ? { note: note.replace(/\s+$/, '') } : {};
      return at === undefined ? { ...rest, ...body, title: v } : { ...rest, ...body, title: v, amount: at };
    };
    const withNote = (y: Task): Task => {
      const { note: _n, ...rest } = y;
      return note.trim() ? { ...rest, title: v, note: note.replace(/\s+$/, '') } : { ...rest, title: v };
    };
    saveGoal({ ...g, ...(at !== undefined && !task ? { split: true } : {}), stages: g.stages.map((x) => (x.id !== st.id ? x : task ? { ...x, tasks: x.tasks.map((y) => (y.id === task.id ? withNote(y) : y)) } : withMark(x))) });
    onClose();
  };
  // The goal as it would be with what's typed in: this stage's amount comes off the total, the rest share what's left.
  const draft: Goal = { ...g, split: g.split || markVal() !== undefined, stages: g.stages.map((x) => (x.id === st.id ? { ...x, amount: markVal() } : x)) };
  const free = unassigned(draft);
  const autoIdx = draft.stages.findIndex((x) => x.amount === undefined && x.id !== st.id);
  const autoShare = draft.split && autoIdx >= 0 ? amountOf(draft, autoIdx) : null;
  const mine = amountOf(draft, i);
  const split = (on: boolean) => {
    tap();
    saveGoal(on ? spreadMilestones(g) : setSplit(g, false));
    setMark('');
  };
  const remove = () => {
    removeBead(g, st, task);
    onClose();
  };
  return (
    <Sheet visible onClose={onClose} title={task ? 'الخطوة' : 'المرحلة'} sub={task ? st.title : `${st.tasks.length} خطوات`}>
      <TextInput value={name} onChangeText={setName} autoFocus={!notesFirst} maxLength={80} onSubmitEditing={save} accessibilityLabel="الاسم" style={[INPUT, s.input, { flex: 0, color: t.fg, backgroundColor: t.soft, borderColor: 'transparent', ...font('body') }]} />
      <View style={{ gap: 6 }}>
        <T w="semi" style={{ fontSize: 13, color: t.mute }}>{task ? 'تفاصيل الخطوة' : 'تفاصيل المرحلة'}</T>
        <NoteEditor t={t} value={note} onChange={setNote} placeholder={`اكتب اللي محتاج تفتكره عن ${task ? 'الخطوة' : 'المرحلة'} دي…\nأو دوس «نقاط» وابدأ لستة`} />
      </View>
      {plan && when ? (
        <View style={{ gap: 6 }}>
          <Pressable onPress={() => setPicking(!picking)} accessibilityRole="button" accessibilityState={{ expanded: picking }} style={[s.dateRow, { backgroundColor: t.soft }]}>
            <Ionicons name="calendar-outline" size={18} color={t.okText} />
            <T style={{ flex: 1, fontSize: 14 }}>{task ? 'ميعاد الخطوة' : 'المرحلة تخلص'}</T>
            <T w="semi" style={{ fontSize: 14, color: own ? t.okText : t.fg }}>{dayShort(when)}</T>
            <T style={{ fontSize: 12, color: t.mute }}>{own ? 'انت حدّدته' : 'تلقائي'}</T>
          </Pressable>
          {picking ? <MonthCalendar value={when} today={dateKey()} onPick={(d) => setDate(d)} /> : null}
          {own ? <Btn label="رجّعه تلقائي (يتوزع مع الباقي)" onPress={() => setDate(undefined)} /> : null}
        </View>
      ) : (
        <T style={{ fontSize: 12.5, color: t.mute }}>حدّد مدة للهدف (من «عدّل الهدف») والخطوات هتتوزع عليها لوحدها، وتقدر تغيّر ميعاد أي خطوة من هنا</T>
      )}
      {!task ? (
        <View style={{ gap: 6 }}>
          {draft.split ? (
            <>
              <View style={[s.dateRow, { backgroundColor: t.soft }]}>
                <Ionicons name="flag-outline" size={18} color={t.okText} />
                <T style={{ fontSize: 14 }}>مبلغ المرحلة</T>
                <TextInput
                  value={mark}
                  onChangeText={setMark}
                  keyboardType="numeric"
                  placeholder={mine !== null ? fmtAmount(mine, '') : ''}
                  placeholderTextColor={t.mute}
                  accessibilityLabel="مبلغ المرحلة"
                  style={[INPUT, { flex: 1, minWidth: 0, height: 44, textAlign: 'left', color: t.fg, outlineWidth: 0, ...font('num'), fontSize: 15 }]}
                />
                {g.unit ? <T style={{ fontSize: 13, color: t.mute }}>{g.unit}</T> : null}
                <T style={{ fontSize: 12, color: t.mute }}>{markVal() !== undefined ? 'انت حدّدته' : 'تلقائي'}</T>
              </View>
              <T style={{ fontSize: 12, color: free < -1e-9 ? t.bad : t.mute }}>{free < -1e-9
                ? `المراحل أكتر من الهدف بـ \u2066${fmtAmount(-free, g.unit)}\u2069`
                : free > 1e-9
                  ? `فاضل \u2066${fmtAmount(free, g.unit)}\u2069 من الهدف مش في أي مرحلة`
                  : autoShare !== null
                    ? `بيتخصم من الهدف، والباقي بيتقسم على المراحل اللي مش محدّدة: \u2066${fmtAmount(autoShare, g.unit)}\u2069 لكل واحدة`
                    : 'كل المراحل محدّدة ومجموعها قد الهدف'}</T>
              {markVal() !== undefined ? <Btn label="رجّعه تلقائي (يتقسم مع الباقي)" onPress={() => setMark('')} /> : null}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Btn label="رجّع الكل بالتساوي" onPress={() => split(true)} style={{ flex: 1 }} />
                <Btn label="شيل المبالغ" onPress={() => split(false)} style={{ flex: 1 }} />
              </View>
            </>
          ) : (
            <Btn label="قسّم رقم الهدف على المراحل" onPress={() => split(true)} />
          )}
        </View>
      ) : null}
      {!task ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Btn label="↑ طلّعها" onPress={() => { saveGoal(moveStage(g, st.id, -1)); onClose(); }} style={{ flex: 1, opacity: i > 0 ? 1 : 0.4 }} />
          <Btn label="↓ نزّلها" onPress={() => { saveGoal(moveStage(g, st.id, 1)); onClose(); }} style={{ flex: 1, opacity: i < g.stages.length - 1 ? 1 : 0.4 }} />
        </View>
      ) : null}
      {task ? <Btn label="كرّر الخطوة" onPress={() => { copyStep(g, task); onClose(); }} /> : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Btn kind="danger" label={task ? 'امسح الخطوة' : 'امسح المرحلة'} onPress={remove} style={{ flex: 1 }} />
        <Btn label="احفظ" kind="solid" onPress={save} style={{ flex: 1 }} />
      </View>
    </Sheet>
  );
}

const s = StyleSheet.create({
  note: { borderRadius: 10, padding: 10, marginTop: 6 },
  noteBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, borderRadius: 10, paddingHorizontal: 12 },
  row: { flexDirection: 'row', gap: 10 },
  rail: { width: RAIL, alignItems: 'center' },
  line: { width: 4, borderRadius: 2 },
  big: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  small: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginVertical: 1 },
  input: { flex: 1, minWidth: 0, height: 44, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, textAlign: 'right', outlineWidth: 0 },
  ok: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
