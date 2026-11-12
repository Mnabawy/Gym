import React, { useEffect, useRef, useState } from 'react';
import { Item, Pop } from '../components/Motion';
import { ACTION, Swipe } from '../components/Swipe';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Btn, INPUT, MiniSwitch, Ring, Screen, Sheet, T, useKeyboardShown } from '../components/ui';
import { MenuButton } from '../components/SideMenu';
import { MonthCalendar } from '../components/MonthCalendar';
import { dueAr, TaskSheet } from '../components/TaskSheet';
import { MONTHS_AR, WEEKDAYS_AR } from '../data/program';
import { useDataVersion } from '../lib/bus';
import { storage } from '../lib/storage';
import { addDays } from '../lib/gaps';
import { dateKey, weekdayOf } from '../lib/logic';
import { addSub, allView, counts, inSpace, SPACES, spaceOf, type Space, removeSub, toggleSub, dayTasks, doneOn, dueCounts, PRIORITY, REPEAT_AR, taskId, timeAr, todayView, toggleTask, type Task } from '../lib/tasks';
import { router } from 'expo-router';
import { setFocus } from '../lib/focusStore';
import { deleteTask, emptyTrash, pruneDone, purgeTask, readTasks, readTrash, restoreTask, saveTask, writeTasks } from '../lib/taskStore';
import { stepFollowsTask } from '../lib/goalTaskStore';
import { readGoals } from '../lib/goalStore';
import type { Goal } from '../lib/goals';
import { showUndo } from '../lib/undo';
import { tap } from '../lib/timer';
import { ThemeProvider, tint, useTheme, useWarm, type Theme, font } from '../theme';

type Tab = 'today' | 'calendar' | 'all';
const stamp = () => Date.now();
const ease = () => {
  // Reanimated layout transitions (Item) animate list changes now.
};
const LATE = '#C0392B';
/** Short weekday names by `Date.getDay()` for the week strip. */
const WD = ['حد', 'اتنين', 'تلات', 'أربع', 'خميس', 'جمعة', 'سبت'];

export default function TasksSection() {
  return (
    <ThemeProvider value={useWarm()}>
      <Tasks />
    </ThemeProvider>
  );
}

/**
 * مهامي: three tabs — النهارده (overdue, today, done), التقويم (a month calendar, then the picked day), الكل (everything
 * open by day, then no date). A bar at the bottom adds a task to the day you're looking at; ＋ opens the full form,
 * where the date is picked on a calendar and the time on a clock.
 */
function Tasks() {
  const t = useTheme();
  useDataVersion((s) => s.v);
  const inset = useSafeAreaInsets();
  const kb = useKeyboardShown();
  const today = dateKey();
  const [space, setSpaceState] = useState<Space>(() => (storage.getMeta('taskSpace') === 'work' ? 'work' : 'personal'));
  const setSpace = (v: Space) => {
    if (v === space) return;
    tap();
    storage.setMeta('taskSpace', v);
    setSpaceState(v);
    setOpenSubs(null);
  };
  const everything = readTasks();
  // The two lists never mix on this page: everything below only sees the one you're on.
  const list = inSpace(everything, space);
  const [tab, setTab] = useState<Tab>('today');
  const [day, setDay] = useState(today);
  const [editing, setEditing] = useState<Task | null>(null);
  const [adding, setAdding] = useState<{ title: string } | null>(null);
  const [quick, setQuick] = useState('');
  const [openSubs, setOpenSubs] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [month, setMonth] = useState(false);
  const quickRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  useEffect(() => pruneDone(dateKey()), []);

  // The day a new task goes to: today, the day picked on the calendar, or none on «الكل».
  const target = tab === 'today' ? today : tab === 'calendar' ? day : null;
  const toggle = (x: Task) => {
    tap();
    ease();
    const before = readTasks();
    writeTasks(toggleTask(before, x.id, today, taskId(stamp())));
    // A task made from a goal's step ticks the step too.
    const goalBack = stepFollowsTask(x.id);
    if (!x.done) showUndo(x.repeat ? `✓ ${x.title} · الجاية ${REPEAT_AR[x.repeat]}` : `✓ ${x.title}`, () => { writeTasks(before); goalBack?.(); });
  };
  const addQuick = () => {
    const title = quick.trim();
    if (!title) return;
    tap();
    ease();
    saveTask({ id: taskId(stamp()), title, due: target, time: null, priority: 3, subs: [], repeat: null, remind: false, done: null, created: today, ...(space === 'work' ? { space } : {}) });
    setQuick('');
    quickRef.current?.focus();
  };

  const c = counts(list, today);
  const tv = todayView(list, today);
  const todayAll = tv.overdue.length + tv.day.length + tv.done.length;
  const trash = readTrash().filter((x) => spaceOf(x.task) === space);
  // Tasks made from a goal's step show the goal's name and open it.
  const goalsById = new Map(readGoals().map((g) => [g.id, g]));
  const row = (x: Task, last: boolean, showDate: boolean) => <Item key={x.id}><TaskRow t={t} x={x} goal={x.goal ? goalsById.get(x.goal.goal) : undefined} today={today} last={last} showDate={showDate} onToggle={() => toggle(x)} onOpen={() => setEditing(x)} subsOpen={openSubs === x.id} onSubs={() => { ease(); setOpenSubs(openSubs === x.id ? null : x.id); }} /></Item>;
  const group = (key: string, label: string, items: Task[], o: { color?: string; showDate?: boolean; fold?: boolean } = {}) =>
    items.length ? (
      <View key={key} style={{ gap: 8 }}>
        {label ? <Pressable onPress={o.fold ? () => { ease(); setShowDone(!showDone); } : undefined} disabled={!o.fold} accessibilityRole={o.fold ? 'button' : undefined} accessibilityState={o.fold ? { expanded: showDone } : undefined} style={s.sec}>
          {o.color ? <View style={[s.secDot, { backgroundColor: o.color }]} /> : null}
          <T w="semi" style={{ fontSize: 13.5, color: o.color ?? t.mute }}>{label}</T>
          <T w="num" style={{ fontSize: 12, color: o.color ?? t.mute }}>{String(items.length)}</T>
          {o.fold ? <Ionicons name={showDone ? 'chevron-up' : 'chevron-down'} size={14} color={t.mute} /> : null}
        </Pressable> : null}
        {o.fold && !showDone ? null : <View style={[s.card, { backgroundColor: t.card }]}>{items.map((x, i) => row(x, i === items.length - 1, !!o.showDate))}</View>}
      </View>
    ) : null;

  const dayLabel = (d: string) => `${WEEKDAYS_AR[weekdayOf(d)]} ${+d.slice(8)} ${MONTHS_AR[+d.slice(5, 7) - 1]}`;
  const sub: Record<Tab, string> = {
    today: dayLabel(today),
    calendar: day === today ? `النهارده · ${dayLabel(day)}` : dayLabel(day),
    all: c.open ? `${c.open} مهمة مفتوحة` : 'مفيش حاجة مفتوحة',
  };
  const placeholder = target == null ? 'مهمة جديدة (من غير تاريخ)' : target === today ? 'مهمة جديدة للنهارده' : `مهمة جديدة لـ ${dueAr(target, today)}`;

  return (
    <Screen
      dense
      title="مهامي"
      sub={sub[tab]}
      header={
        <View style={s.header}>
          {/* Bar: خاص / شغل on one side, sections and the menu on the other. */}
          <View style={s.navBar}>
            <MiniSwitch options={[['personal', SPACES.personal], ['work', SPACES.work]]} value={space} onChange={setSpace} label="المهام" />
            <MenuButton />
          </View>
          {/* النهارده / التقويم / الكل as one iOS segmented control, today's ring next to it. */}
          <View style={s.bigRow}>
          <View style={[s.segBar, { flex: 1, backgroundColor: t.segBar }]}>
            {(
              [
                ['today', 'النهارده', c.today],
                ['calendar', 'التقويم', null],
                ['all', 'الكل', c.open],
              ] as [Tab, string, number | null][]
            ).map(([k, l, n]) => {
              const on = tab === k;
              return (
                <Pressable key={k} onPress={() => { ease(); setTab(k); }} accessibilityRole="tab" accessibilityState={{ selected: on }} style={[s.segItem, on ? { backgroundColor: t.segOn } : null]}>
                  <T w={on ? 'semi' : 'medium'} style={{ fontSize: 13.5, color: on ? t.fg : t.mute }} numberOfLines={1}>{l}</T>
                  {n ? <T w="numBold" style={{ fontSize: 11.5, color: on ? t.okText : t.mute }}>{String(n)}</T> : null}
                </Pressable>
              );
            })}
          </View>
            {todayAll ? (
              <Ring value={tv.done.length / todayAll} size={38} stroke={3.5} color={t.ok} track={tint(t.fg, 0.08)}>
                <T w="numBold" style={{ fontSize: 10.5 }}>{`${tv.done.length}/${todayAll}`}</T>
              </Ring>
            ) : null}
          </View>
        </View>
      }
      footer={
        <View style={[s.bar, { paddingBottom: kb ? 8 : Math.max(inset.bottom, 10) + 4, backgroundColor: t.bg }]}>
          <View style={[s.quick, { backgroundColor: t.card, borderColor: t.border }]}>
            <Ionicons name="add-circle-outline" size={22} color={t.mute} />
            <TextInput
              ref={quickRef}
              value={quick}
              onChangeText={setQuick}
              onSubmitEditing={addQuick}
              submitBehavior="submit"
              returnKeyType="done"
              placeholder={placeholder}
              placeholderTextColor={t.mute}
              maxLength={140}
              accessibilityLabel="مهمة سريعة"
              style={[INPUT, s.quickIn, { color: t.fg, ...font('body') }]}
            />
            {quick.trim() ? (
              <Pressable onPress={addQuick} hitSlop={8} accessibilityRole="button" accessibilityLabel="ضيف">
                <Ionicons name="arrow-up-circle" size={32} color={t.ok} />
              </Pressable>
            ) : null}
          </View>
          <Pressable
            onPress={() => {
              setAdding({ title: quick });
              setQuick('');
            }}
            accessibilityRole="button"
            accessibilityLabel="مهمة جديدة بالتفاصيل"
            style={({ pressed }) => [s.fab, { backgroundColor: t.ok, transform: [{ scale: pressed ? 0.94 : 1 }] }]}>
            <Ionicons name="add" size={30} color={t.onOk} />
          </Pressable>
        </View>
      }>
      {editing ? <TaskSheet task={editing} onClose={() => setEditing(null)} /> : null}
      {adding ? <TaskSheet initial={adding.title} day={target} space={space} onClose={() => setAdding(null)} /> : null}


      {tab === 'today' ? (
        todayAll ? (
          <>
            {group('late', 'متأخرة', tv.overdue, { color: LATE, showDate: true })}
            {tv.day.length ? group('day', tv.overdue.length ? 'النهارده' : '', tv.day) : !tv.overdue.length ? <Empty t={t} icon="checkmark-done-outline" title="خلّصت مهام النهارده" sub="برافو. لو فيه حاجة تانية اكتبها تحت" /> : null}
            {group('done', 'خلصت', tv.done, { fold: true })}
          </>
        ) : (
          <Empty t={t} icon="sunny-outline" title="يومك فاضي" sub="اكتب مهمة تحت، أو دوس ＋ لو عايز تحدّد ميعاد وتفاصيل" />
        )
      ) : null}

      {tab === 'calendar' ? (
        <>
          <View style={[s.card, { backgroundColor: t.card, borderColor: t.border, paddingVertical: 4, paddingHorizontal: 4 }]}>
            {month ? (
              <MonthCalendar value={day} today={today} marks={dueCounts(list)} onPick={(d) => { tap(); ease(); setDay(d); setMonth(false); }} />
            ) : (
              <WeekStrip t={t} day={day} today={today} marks={dueCounts(list)} onPick={(d) => { tap(); ease(); setDay(d); }} />
            )}
            <Pressable onPress={() => { ease(); setMonth(!month); }} accessibilityRole="button" accessibilityState={{ expanded: month }} style={s.monthBtn}>
              <T w="semi" style={{ fontSize: 12.5, color: t.okText }}>{month ? 'اقفل الشهر' : 'الشهر كله'}</T>
              <Ionicons name={month ? 'chevron-up' : 'chevron-down'} size={14} color={t.okText} />
            </Pressable>
          </View>
          {day === today && tv.overdue.length ? group('late', 'متأخرة', tv.overdue, { color: LATE, showDate: true }) : null}
          {dayTasks(list, day).length || doneOn(list, day).length ? (
            <>
              {group('day', dueAr(day, today), dayTasks(list, day))}
              {group('done', 'خلصت', doneOn(list, day), { fold: true })}
            </>
          ) : (
            <Empty t={t} icon="calendar-outline" title={`مفيش مهام ${day === today ? 'النهارده' : `يوم ${+day.slice(8)} ${MONTHS_AR[+day.slice(5, 7) - 1]}`}`} sub="اكتب تحت وهتتضاف لليوم ده" />
          )}
        </>
      ) : null}

      {tab === 'all' ? (
        allView(list, today).length ? (
          allView(list, today).map((g) => group(g.late ? 'late' : g.date ?? 'none', g.late ? 'متأخرة' : g.date ? dueAr(g.date, today) : 'من غير تاريخ', g.tasks, { color: g.late ? LATE : undefined, showDate: g.late }))
        ) : (
          <Empty t={t} icon="checkmark-done-outline" title="مفيش حاجة مفتوحة" sub="كل مهامك خلصت" />
        )
      ) : null}
      {tab === 'all' ? (
        <Pressable onPress={() => setTrashOpen(true)} accessibilityRole="button" style={({ pressed }) => [s.trashRow, { backgroundColor: t.card, opacity: pressed ? 0.6 : 1 }]}>
          <Ionicons name="trash-outline" size={18} color={t.bad} />
          <T style={{ flex: 1, fontSize: 15 }}>المحذوفة</T>
          <T w="num" style={{ fontSize: 13, color: t.mute }}>{trash.length ? String(trash.length) : 'فاضية'}</T>
          <Ionicons name="chevron-back" size={16} color={t.mute} />
        </Pressable>
      ) : null}
      {trashOpen ? <TrashSheet t={t} space={space} onClose={() => setTrashOpen(false)} /> : null}
      <View style={{ height: 8 }} />
    </Screen>
  );
}

/** المحذوفة: tasks deleted in the last 30 days (this list only), to put back or delete for good. */
function TrashSheet({ t, space, onClose }: { t: Theme; space: Space; onClose: () => void }) {
  useDataVersion((v) => v.v);
  const [sure, setSure] = useState(false);
  const today = dateKey();
  const items = readTrash().filter((x) => spaceOf(x.task) === space);
  return (
    <Sheet visible onClose={onClose} title="المحذوفة" sub="بتفضل هنا 30 يوم وبعدين تتمسح لوحدها">
      {items.length ? (
        <View style={[s.card, { backgroundColor: t.soft }]}>
          {items.map((x, i) => (
            <Item key={x.task.id}>
              <View style={[s.trashItem, { borderBottomWidth: i === items.length - 1 ? 0 : StyleSheet.hairlineWidth, borderColor: t.line }]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T style={{ fontSize: 15 }} numberOfLines={2}>{x.task.title}</T>
                  <T style={{ fontSize: 12, color: t.mute }}>{`اتمسحت ${x.at === today ? 'النهارده' : dueAr(x.at, today)}`}</T>
                </View>
                <Pressable onPress={() => { tap(); ease(); restoreTask(x.task.id); }} hitSlop={6} accessibilityRole="button" accessibilityLabel={`رجّع ${x.task.title}`} style={({ pressed }) => [s.trashBtn, { backgroundColor: tint(t.ok, 0.12), opacity: pressed ? 0.6 : 1 }]}>
                  <T w="semi" style={{ fontSize: 13, color: t.okText }}>رجّعها</T>
                </Pressable>
                <Pressable onPress={() => { ease(); purgeTask(x.task.id); }} hitSlop={6} accessibilityRole="button" accessibilityLabel={`امسح ${x.task.title} خالص`} style={s.trashX}>
                  <Ionicons name="trash-outline" size={18} color={t.bad} />
                </Pressable>
              </View>
            </Item>
          ))}
        </View>
      ) : (
        <T style={{ fontSize: 14, color: t.mute, textAlign: 'center', paddingVertical: 16 }}>مفيش مهام محذوفة</T>
      )}
      {items.length ? (
        sure ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn label="لأ" onPress={() => setSure(false)} style={{ flex: 1 }} />
            <Btn label={`امسح ${items.length} خالص`} kind="dangerSolid" onPress={() => { emptyTrash(); setSure(false); }} style={{ flex: 1 }} />
          </View>
        ) : (
          <Btn label="فضّي المحذوفة" kind="danger" onPress={() => setSure(true)} />
        )
      ) : null}
    </Sheet>
  );
}

/** A week from Saturday around the picked day: weekday, date, a dot per task; arrows move a week. */
function WeekStrip({ t, day, today, marks, onPick }: { t: Theme; day: string; today: string; marks: Record<string, number>; onPick: (d: string) => void }) {
  const start = addDays(day, -((weekdayOf(day) - 6 + 7) % 7));
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Pressable onPress={() => onPick(addDays(day, -7))} hitSlop={6} accessibilityRole="button" accessibilityLabel="الأسبوع اللي فات" style={s.wArrow}>
        <Ionicons name="chevron-forward" size={18} color={t.mute} />
      </Pressable>
      {days.map((d) => {
        const on = d === day;
        const n = marks[d] ?? 0;
        return (
          <Pressable key={d} onPress={() => onPick(d)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${WEEKDAYS_AR[weekdayOf(d)]} ${+d.slice(8)}${n ? `، ${n} مهام` : ''}`} style={[s.wd, { backgroundColor: on ? t.ok : 'transparent', borderColor: d === today && !on ? t.ok : 'transparent' }]}>
            <T style={{ fontSize: 11, color: on ? t.onOk : t.mute }}>{WD[weekdayOf(d)]}</T>
            <T w="numBold" style={{ fontSize: 16, color: on ? t.onOk : d < today ? t.mute : t.fg }}>{String(+d.slice(8))}</T>
            <View style={{ flexDirection: 'row', gap: 2, height: 4 }}>
              {Array.from({ length: Math.min(3, n) }, (_, k) => <View key={k} style={[s.dot, { backgroundColor: on ? t.onOk : t.ok }]} />)}
            </View>
          </Pressable>
        );
      })}
      <Pressable onPress={() => onPick(addDays(day, 7))} hitSlop={6} accessibilityRole="button" accessibilityLabel="الأسبوع الجاي" style={s.wArrow}>
        <Ionicons name="chevron-back" size={18} color={t.mute} />
      </Pressable>
    </View>
  );
}

function Empty({ t, icon, title, sub }: { t: Theme; icon: React.ComponentProps<typeof Ionicons>['name']; title: string; sub: string }) {
  return (
    <View style={{ alignItems: 'center', gap: 6, paddingVertical: 27 }}>
      <View style={[s.emptyIcon, { backgroundColor: tint(t.ok, 0.1) }]}>
        <Ionicons name={icon} size={30} color={t.ok} />
      </View>
      <T w="bold" style={{ fontSize: 17 }}>{title}</T>
      <T style={{ color: t.mute, fontSize: 13, textAlign: 'center' }}>{sub}</T>
    </View>
  );
}

/**
 * One task: a round check in its priority's color, the title, a line with time, repeat, reminder, tag — and its
 * subtasks: the button at the end opens them under the task, to tick, remove or add one without opening the form.
 */
function TaskRow({ t, x, goal, today, last, showDate, onToggle, onOpen, subsOpen, onSubs }: { t: Theme; x: Task; goal?: Goal; today: string; last: boolean; showDate: boolean; onToggle: () => void; onOpen: () => void; subsOpen: boolean; onSubs: () => void }) {
  // The ring takes the priority's color; a plain task takes the app's color, «بعدين» stays grey.
  const c = x.priority === 3 ? t.ok : x.priority === 4 ? t.mute : PRIORITY[x.priority].color;
  const done = !!x.done;
  const meta: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string; color?: string }[] = [];
  if (showDate && x.due) meta.push({ icon: 'calendar-outline', text: dueAr(x.due, today), color: x.due < today && !done ? LATE : undefined });
  if (x.time != null) meta.push({ icon: 'time-outline', text: timeAr(x.time) });
  if (x.repeat) meta.push({ icon: 'repeat', text: REPEAT_AR[x.repeat] });
  if (x.remind) meta.push({ icon: 'notifications-outline', text: '' });
  if (x.note) meta.push({ icon: 'document-text-outline', text: '' });
  const subsDone = x.subs.filter((y) => y.done).length;
  const before = () => readTasks();
  const remove = () => {
    const list = before();
    deleteTask(x.id);
    showUndo(`اتمسحت: ${x.title}`, () => writeTasks(list));
  };
  const other: Space = spaceOf(x) === 'work' ? 'personal' : 'work';
  const move = () => {
    const list = before();
    saveTask({ ...x, space: other });
    showUndo(`${x.title} · اتنقلت لـ ${SPACES[other]}`, () => writeTasks(list));
  };
  const tomorrow = () => {
    const list = before();
    saveTask({ ...x, due: addDays(today, 1) });
    showUndo(`${x.title} · بكرة`, () => writeTasks(list));
  };
  return (
    <Swipe
      // «ركّز» = a Pomodoro block on this task (the timer has no section of its own any more).
      start={done
        ? [{ icon: 'arrow-undo', label: 'رجّعها', color: ACTION.grey, onPress: onToggle }]
        : [{ icon: 'checkmark', label: 'خلصت', color: ACTION.green, onPress: onToggle },
           { icon: 'timer-outline', label: 'ركّز', color: ACTION.teal, onPress: () => { setFocus({ task: x.title }); router.push('/focus'); } }]}
      end={[
        { icon: 'trash', label: 'امسح', color: ACTION.red, onPress: remove },
        ...(done ? [] : [{ icon: 'arrow-redo' as const, label: 'بكرة', color: ACTION.orange, onPress: tomorrow }]),
        { icon: 'create-outline', label: 'عدّل', color: ACTION.grey, onPress: onOpen },
        ...(done ? [] : [{ icon: 'git-branch-outline' as const, label: 'فرعية', color: ACTION.blue, onPress: onSubs }]),
        { icon: other === 'work' ? 'briefcase-outline' : 'person-outline', label: `لـ${SPACES[other]}`, color: ACTION.indigo, onPress: move },
      ]}>
    <View style={{ backgroundColor: t.card }}>
    <View style={s.task}>
      <Pressable onPress={onToggle} hitSlop={12} accessibilityRole="checkbox" accessibilityState={{ checked: done }} accessibilityLabel={x.title} style={[s.cb, { borderColor: done ? t.ok : c, backgroundColor: done ? t.ok : 'transparent' }]}>
        {done ? <Pop value="done"><Ionicons name="checkmark" size={16} color={t.bg} /></Pop> : null}
      </Pressable>
      <View style={[s.body, { borderBottomWidth: last || subsOpen ? 0 : StyleSheet.hairlineWidth, borderColor: t.line }]}>
      <Pressable onPress={onOpen} accessibilityRole="button" accessibilityHint="افتح وعدّل" style={({ pressed }) => ({ flex: 1, minWidth: 0, opacity: pressed ? 0.6 : 1, gap: 3 })}>
        <T style={{ fontSize: 15, lineHeight: 21, color: done ? t.mute : t.fg, textDecorationLine: done ? 'line-through' : 'none' }}>{x.title}</T>
        {(meta.length || x.tag || goal) && !done ? (
          <View style={s.meta}>
            {goal ? (
              <Pressable onPress={() => router.push(`/goals/${goal.id}`)} hitSlop={6} accessibilityRole="link" accessibilityLabel={`من هدف ${goal.name}`} style={({ pressed }) => [s.metaItem, { opacity: pressed ? 0.5 : 1 }]}>
                <Ionicons name="flag" size={12} color={goal.color} />
                <T style={{ fontSize: 12, color: t.mute }} numberOfLines={1}>{goal.name}</T>
              </Pressable>
            ) : null}
            {meta.map((m) => (
              <View key={m.icon} style={s.metaItem}>
                <Ionicons name={m.icon} size={13} color={m.color ?? t.mute} />
                {m.text ? <T style={{ fontSize: 12, color: m.color ?? t.mute }}>{m.text}</T> : null}
              </View>
            ))}
            {x.tag ? <T style={{ fontSize: 12, color: t.okText }}>{`#${x.tag}`}</T> : null}
          </View>
        ) : null}
      </Pressable>
      {!done && (x.subs.length || subsOpen) ? (
        <Pressable onPress={onSubs} hitSlop={6} accessibilityRole="button" accessibilityLabel={`المهام الفرعية ${subsDone} من ${x.subs.length}`} accessibilityState={{ expanded: subsOpen }} style={({ pressed }) => [s.subBtn, { backgroundColor: subsOpen ? tint(t.ok, 0.14) : t.soft, opacity: pressed ? 0.7 : 1 }]}>
          <T w="numBold" style={{ fontSize: 12, color: subsOpen ? t.okText : t.mute }}>{`${subsDone}/${x.subs.length}`}</T>
          <Ionicons name={subsOpen ? 'chevron-up' : 'chevron-down'} size={14} color={subsOpen ? t.okText : t.mute} />
        </Pressable>
      ) : null}
      </View>
    </View>
    {subsOpen && !done ? <SubList t={t} x={x} /> : null}
    </View>
    </Swipe>
  );
}

/** The subtasks under a task: tick, remove, and a field to add the next one (stays open for more). */
function SubList({ t, x }: { t: Theme; x: Task }) {
  const [text, setText] = useState('');
  const ref = useRef<React.ComponentRef<typeof TextInput>>(null);
  const add = () => {
    if (!text.trim()) return;
    tap();
    ease();
    saveTask(addSub(x, text, taskId(stamp(), x.subs.length + 1)));
    setText('');
    ref.current?.focus();
  };
  return (
    <View style={[s.subs, { borderColor: t.line }]}>
      {x.subs.map((y) => (
        <Item key={y.id}><View style={s.subRow}>
          <Pressable onPress={() => { tap(); saveTask(toggleSub(x, y.id)); }} hitSlop={10} accessibilityRole="checkbox" accessibilityState={{ checked: y.done }} accessibilityLabel={y.title} style={[s.subCb, { borderColor: y.done ? t.mute : t.ok, backgroundColor: y.done ? t.mute : 'transparent' }]}>
            {y.done ? <Pop value="done"><Ionicons name="checkmark" size={12} color={t.bg} /></Pop> : null}
          </Pressable>
          <T style={{ flex: 1, fontSize: 14.5, lineHeight: 21, color: y.done ? t.mute : t.fg, textDecorationLine: y.done ? 'line-through' : 'none' }}>{y.title}</T>
          <Pressable onPress={() => { ease(); saveTask(removeSub(x, y.id)); }} hitSlop={10} accessibilityRole="button" accessibilityLabel={`امسح ${y.title}`} style={s.subX}>
            <Ionicons name="close" size={16} color={t.bad} />
          </Pressable>
        </View></Item>
      ))}
      <View style={s.subRow}>
        <Ionicons name="add" size={18} color={t.mute} style={{ width: 20, textAlign: 'center' }} />
        <TextInput
          ref={ref}
          value={text}
          onChangeText={setText}
          onSubmitEditing={add}
          submitBehavior="submit"
          returnKeyType="done"
          autoFocus={!x.subs.length}
          placeholder="مهمة فرعية"
          placeholderTextColor={t.mute}
          maxLength={80}
          accessibilityLabel={`مهمة فرعية لـ ${x.title}`}
          style={[INPUT, s.subIn, { color: t.fg, ...font('body') }]}
        />
        {text.trim() ? (
          <Pressable onPress={add} hitSlop={8} accessibilityRole="button" accessibilityLabel="ضيف المهمة الفرعية">
            <Ionicons name="checkmark-circle" size={24} color={t.ok} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  header: { gap: 10, marginBottom: 4 },
  trashRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, borderRadius: 12, paddingHorizontal: 14, marginTop: 8 },
  trashItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12 },
  trashBtn: { height: 32, borderRadius: 16, paddingHorizontal: 12, justifyContent: 'center' },
  trashX: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  navBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  bigRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  segBar: { flexDirection: 'row', padding: 2, borderRadius: 9, gap: 2 },
  segItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, height: 32, borderRadius: 7 },
  secDot: { width: 7, height: 7, borderRadius: 4 },
  monthBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, height: 28, marginTop: 2 },
  wArrow: { width: 24, height: 48, alignItems: 'center', justifyContent: 'center' },
  wd: { flex: 1, alignItems: 'center', paddingVertical: 4, borderRadius: 12, borderWidth: 1.5, gap: 1 },
  dot: { width: 4, height: 4, borderRadius: 2 },
  seg: { flexDirection: 'row', padding: 4, borderRadius: 12, gap: 4 },
  segBtn: { flex: 1, flexDirection: 'row', gap: 6, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  badge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  sec: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 4, marginTop: 2 },
  card: { borderRadius: 12, overflow: 'hidden' },
  task: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingHorizontal: 14 },
  body: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 11, minHeight: 52 },
  cb: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.6, alignItems: 'center', justifyContent: 'center', marginTop: 0 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 0 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  subBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 24, borderRadius: 12, paddingHorizontal: 7 },
  subs: { marginStart: 30, borderStartWidth: 2, paddingStart: 8, paddingBottom: 6, gap: 0 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 },
  subCb: { width: 18, height: 18, borderRadius: 5, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  subX: { width: 26, height: 30, alignItems: 'center', justifyContent: 'center' },
  subIn: { flex: 1, minWidth: 0, height: 34, fontSize: 14, textAlign: 'right', outlineWidth: 0 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 6 },
  quick: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, borderRadius: 12, paddingHorizontal: 12 },
  quickIn: { flex: 1, minWidth: 0, fontSize: 15, textAlign: 'right', outlineWidth: 0, height: 44 },
  fab: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  emptyIcon: { width: 64, height: 64, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
});
