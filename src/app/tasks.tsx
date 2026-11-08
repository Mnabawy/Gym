import React, { useEffect, useRef, useState } from 'react';
import { LayoutAnimation, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ring, Screen, T, useKeyboardShown } from '../components/ui';
import { MenuButton } from '../components/SideMenu';
import { MonthCalendar } from '../components/MonthCalendar';
import { dueAr, TaskSheet } from '../components/TaskSheet';
import { MONTHS_AR, WEEKDAYS_AR } from '../data/program';
import { useDataVersion } from '../lib/bus';
import { dateKey, weekdayOf } from '../lib/logic';
import { addSub, allView, counts, removeSub, toggleSub, dayTasks, doneOn, dueCounts, PRIORITY, REPEAT_AR, tagColor, taskId, timeAr, todayView, toggleTask, type Task } from '../lib/tasks';
import { pruneDone, readTasks, saveTask, writeTasks } from '../lib/taskStore';
import { showUndo } from '../lib/undo';
import { tap } from '../lib/timer';
import { F, ThemeProvider, tint, useTheme, useWarm, type Theme } from '../theme';

type Tab = 'today' | 'calendar' | 'all';
const stamp = () => Date.now();
const ease = () => {
  if (Platform.OS !== 'web') LayoutAnimation.configureNext(LayoutAnimation.create(200, 'easeInEaseOut', 'opacity'));
};
const LATE = '#C0392B';

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
  const list = readTasks();
  const [tab, setTab] = useState<Tab>('today');
  const [day, setDay] = useState(today);
  const [editing, setEditing] = useState<Task | null>(null);
  const [adding, setAdding] = useState<{ title: string } | null>(null);
  const [quick, setQuick] = useState('');
  const [openSubs, setOpenSubs] = useState<string | null>(null);
  const quickRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  useEffect(() => pruneDone(dateKey()), []);

  // The day a new task goes to: today, the day picked on the calendar, or none on «الكل».
  const target = tab === 'today' ? today : tab === 'calendar' ? day : null;
  const toggle = (x: Task) => {
    tap();
    ease();
    const before = readTasks();
    writeTasks(toggleTask(before, x.id, today, taskId(stamp())));
    if (!x.done) showUndo(x.repeat ? `✓ ${x.title} · الجاية ${REPEAT_AR[x.repeat]}` : `✓ ${x.title}`, () => writeTasks(before));
  };
  const addQuick = () => {
    const title = quick.trim();
    if (!title) return;
    tap();
    ease();
    saveTask({ id: taskId(stamp()), title, due: target, time: null, priority: 3, subs: [], repeat: null, remind: false, done: null, created: today });
    setQuick('');
    quickRef.current?.focus();
  };

  const c = counts(list, today);
  const tv = todayView(list, today);
  const todayAll = tv.overdue.length + tv.day.length + tv.done.length;
  const row = (x: Task, last: boolean, showDate: boolean) => <TaskRow key={x.id} t={t} x={x} today={today} last={last} showDate={showDate} onToggle={() => toggle(x)} onOpen={() => setEditing(x)} subsOpen={openSubs === x.id} onSubs={() => { ease(); setOpenSubs(openSubs === x.id ? null : x.id); }} />;
  const group = (key: string, label: string, items: Task[], o: { color?: string; showDate?: boolean } = {}) =>
    items.length ? (
      <View key={key} style={{ gap: 6 }}>
        <View style={s.sec}>
          <T w="semi" style={{ fontSize: 13.5, color: o.color ?? t.mute }}>{label}</T>
          <T w="num" style={{ fontSize: 12, color: o.color ?? t.mute }}>{String(items.length)}</T>
        </View>
        <View style={[s.card, { backgroundColor: t.card, borderColor: t.border }]}>{items.map((x, i) => row(x, i === items.length - 1, !!o.showDate))}</View>
      </View>
    ) : null;

  const dayLabel = (d: string) => `${WEEKDAYS_AR[weekdayOf(d)]} ${+d.slice(8)} ${MONTHS_AR[+d.slice(5, 7) - 1]}`;
  const head: Record<Tab, [string, string]> = {
    today: ['النهارده', dayLabel(today)],
    calendar: ['التقويم', day === today ? 'النهارده' : dueAr(day, today)],
    all: ['كل المهام', c.open ? `${c.open} مفتوحة` : 'مفيش حاجة مفتوحة'],
  };
  const placeholder = target == null ? 'مهمة جديدة (من غير تاريخ)' : target === today ? 'مهمة جديدة للنهارده' : `مهمة جديدة لـ ${dueAr(target, today)}`;

  return (
    <Screen
      title="مهامي"
      action={<MenuButton />}
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
              style={[s.quickIn, { color: t.fg, fontFamily: F.body }]}
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
            style={({ pressed }) => [s.fab, { backgroundColor: t.ok, boxShadow: `0px 8px 22px ${tint(t.ok, 0.4)}`, transform: [{ scale: pressed ? 0.94 : 1 }] }]}>
            <Ionicons name="add" size={30} color={t.onOk} />
          </Pressable>
        </View>
      }>
      {editing ? <TaskSheet task={editing} onClose={() => setEditing(null)} /> : null}
      {adding ? <TaskSheet initial={adding.title} day={target} onClose={() => setAdding(null)} /> : null}

      <View style={s.hd}>
        <View style={{ flex: 1 }}>
          <T style={{ color: t.mute, fontSize: 13 }}>{head[tab][1]}</T>
          <T w="bold" style={{ fontSize: 30, lineHeight: 42 }}>{head[tab][0]}</T>
        </View>
        {tab === 'today' && todayAll ? (
          <Ring value={tv.done.length / todayAll} size={58} stroke={6} color={t.ok}>
            <T w="numBold" style={{ fontSize: 13 }}>{`${tv.done.length}/${todayAll}`}</T>
          </Ring>
        ) : null}
      </View>

      <View style={[s.seg, { backgroundColor: t.soft }]}>
        {(
          [
            ['today', 'النهارده', c.today],
            ['calendar', 'التقويم', null],
            ['all', 'الكل', c.open],
          ] as [Tab, string, number | null][]
        ).map(([k, l, n]) => {
          const on = tab === k;
          return (
            <Pressable key={k} onPress={() => { ease(); setTab(k); }} accessibilityRole="tab" accessibilityState={{ selected: on }} style={[s.segBtn, on ? { backgroundColor: t.card, boxShadow: '0px 2px 8px rgba(0,0,0,0.08)' } : null]}>
              <T w="semi" style={{ fontSize: 14, color: on ? t.fg : t.mute }} numberOfLines={1}>{l}</T>
              {n ? (
                <View style={[s.badge, { backgroundColor: on ? t.ok : tint(t.mute, 0.18) }]}>
                  <T w="numBold" style={{ fontSize: 11, color: on ? t.onOk : t.mute }}>{String(n)}</T>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {tab === 'today' ? (
        todayAll ? (
          <>
            {group('late', 'متأخرة', tv.overdue, { color: LATE, showDate: true })}
            {group('day', 'النهارده', tv.day)}
            {group('done', 'خلصت', tv.done)}
          </>
        ) : (
          <Empty t={t} icon="sunny-outline" title="يومك فاضي" sub="اكتب مهمة تحت، أو دوس ＋ لو عايز تحدّد ميعاد وتفاصيل" />
        )
      ) : null}

      {tab === 'calendar' ? (
        <>
          <View style={[s.card, { backgroundColor: t.card, borderColor: t.border, paddingVertical: 10, paddingHorizontal: 6 }]}>
            <MonthCalendar value={day} today={today} marks={dueCounts(list)} onPick={(d) => { tap(); ease(); setDay(d); }} />
          </View>
          {day === today && tv.overdue.length ? group('late', 'متأخرة', tv.overdue, { color: LATE, showDate: true }) : null}
          {dayTasks(list, day).length || doneOn(list, day).length ? (
            <>
              {group('day', dueAr(day, today), dayTasks(list, day))}
              {group('done', 'خلصت', doneOn(list, day))}
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
      <View style={{ height: 8 }} />
    </Screen>
  );
}

function Empty({ t, icon, title, sub }: { t: Theme; icon: React.ComponentProps<typeof Ionicons>['name']; title: string; sub: string }) {
  return (
    <View style={{ alignItems: 'center', gap: 6, paddingVertical: 36 }}>
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
function TaskRow({ t, x, today, last, showDate, onToggle, onOpen, subsOpen, onSubs }: { t: Theme; x: Task; today: string; last: boolean; showDate: boolean; onToggle: () => void; onOpen: () => void; subsOpen: boolean; onSubs: () => void }) {
  const c = PRIORITY[x.priority].color;
  const done = !!x.done;
  const meta: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string; color?: string }[] = [];
  if (showDate && x.due) meta.push({ icon: 'calendar-outline', text: dueAr(x.due, today), color: x.due < today && !done ? LATE : undefined });
  if (x.time != null) meta.push({ icon: 'time-outline', text: timeAr(x.time) });
  if (x.repeat) meta.push({ icon: 'repeat', text: REPEAT_AR[x.repeat] });
  if (x.remind) meta.push({ icon: 'notifications-outline', text: '' });
  if (x.note) meta.push({ icon: 'document-text-outline', text: '' });
  const subsDone = x.subs.filter((y) => y.done).length;
  return (
    <View style={{ borderBottomWidth: last ? 0 : 1, borderColor: t.line }}>
    <View style={s.task}>
      <Pressable onPress={onToggle} hitSlop={12} accessibilityRole="checkbox" accessibilityState={{ checked: done }} accessibilityLabel={x.title} style={[s.cb, { borderColor: done ? t.mute : c, backgroundColor: done ? t.mute : tint(c, 0.1) }]}>
        {done ? <Ionicons name="checkmark" size={16} color={t.bg} /> : null}
      </Pressable>
      <Pressable onPress={onOpen} accessibilityRole="button" accessibilityHint="افتح وعدّل" style={({ pressed }) => ({ flex: 1, minWidth: 0, opacity: pressed ? 0.6 : 1, gap: 3 })}>
        <T style={{ fontSize: 15.5, lineHeight: 23, color: done ? t.mute : t.fg, textDecorationLine: done ? 'line-through' : 'none' }}>{x.title}</T>
        {(meta.length || x.tag) && !done ? (
          <View style={s.meta}>
            {meta.map((m) => (
              <View key={m.icon} style={s.metaItem}>
                <Ionicons name={m.icon} size={13} color={m.color ?? t.mute} />
                {m.text ? <T style={{ fontSize: 12, color: m.color ?? t.mute }}>{m.text}</T> : null}
              </View>
            ))}
            {x.tag ? <T w="semi" style={{ fontSize: 12, color: tagColor(x.tag) }}>{`# ${x.tag}`}</T> : null}
          </View>
        ) : null}
      </Pressable>
      {!done && (x.subs.length || subsOpen) ? (
        <Pressable onPress={onSubs} hitSlop={6} accessibilityRole="button" accessibilityLabel={`المهام الفرعية ${subsDone} من ${x.subs.length}`} accessibilityState={{ expanded: subsOpen }} style={({ pressed }) => [s.subBtn, { backgroundColor: subsOpen ? tint(t.ok, 0.14) : t.soft, opacity: pressed ? 0.7 : 1 }]}>
          <T w="numBold" style={{ fontSize: 12, color: subsOpen ? t.okText : t.mute }}>{`${subsDone}/${x.subs.length}`}</T>
          <Ionicons name={subsOpen ? 'chevron-up' : 'chevron-down'} size={14} color={subsOpen ? t.okText : t.mute} />
        </Pressable>
      ) : !done ? (
        <Pressable onPress={onSubs} hitSlop={8} accessibilityRole="button" accessibilityLabel="ضيف مهمة فرعية" style={({ pressed }) => [s.subAddBtn, { opacity: pressed ? 0.6 : 1 }]}>
          <Ionicons name="git-branch-outline" size={17} color={t.mute} />
        </Pressable>
      ) : null}
      {x.priority <= 2 && !done ? <View style={[s.flag, { backgroundColor: c }]} /> : null}
    </View>
    {subsOpen && !done ? <SubList t={t} x={x} /> : null}
    </View>
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
        <View key={y.id} style={s.subRow}>
          <Pressable onPress={() => { tap(); saveTask(toggleSub(x, y.id)); }} hitSlop={10} accessibilityRole="checkbox" accessibilityState={{ checked: y.done }} accessibilityLabel={y.title} style={[s.subCb, { borderColor: y.done ? t.mute : t.ok, backgroundColor: y.done ? t.mute : 'transparent' }]}>
            {y.done ? <Ionicons name="checkmark" size={12} color={t.bg} /> : null}
          </Pressable>
          <T style={{ flex: 1, fontSize: 14.5, lineHeight: 21, color: y.done ? t.mute : t.fg, textDecorationLine: y.done ? 'line-through' : 'none' }}>{y.title}</T>
          <Pressable onPress={() => { ease(); saveTask(removeSub(x, y.id)); }} hitSlop={10} accessibilityRole="button" accessibilityLabel={`امسح ${y.title}`} style={s.subX}>
            <Ionicons name="close" size={16} color={t.mute} />
          </Pressable>
        </View>
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
          style={[s.subIn, { color: t.fg, fontFamily: F.body }]}
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
  hd: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  seg: { flexDirection: 'row', padding: 4, borderRadius: 16, gap: 4 },
  segBtn: { flex: 1, flexDirection: 'row', gap: 6, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  badge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  sec: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 6, marginTop: 4 },
  card: { borderRadius: 20, paddingHorizontal: 14, borderWidth: 1 },
  task: { flexDirection: 'row', gap: 12, paddingVertical: 12, alignItems: 'flex-start' },
  cb: { width: 26, height: 26, borderRadius: 13, borderWidth: 2.2, alignItems: 'center', justifyContent: 'center', marginTop: 0 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 10, rowGap: 2 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  subBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 28, borderRadius: 14, paddingHorizontal: 8, marginTop: 0 },
  subAddBtn: { width: 32, height: 28, alignItems: 'center', justifyContent: 'center' },
  subs: { marginStart: 38, borderStartWidth: 2, paddingStart: 10, paddingBottom: 10, gap: 2 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40 },
  subCb: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  subX: { width: 28, height: 36, alignItems: 'center', justifyContent: 'center' },
  subIn: { flex: 1, minWidth: 0, height: 40, fontSize: 14.5, textAlign: 'right', outlineWidth: 0 },
  flag: { width: 4, alignSelf: 'stretch', borderRadius: 2, marginVertical: 3 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 8 },
  quick: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 54, borderRadius: 18, borderWidth: 1, paddingHorizontal: 12 },
  quickIn: { flex: 1, minWidth: 0, fontSize: 15, textAlign: 'right', outlineWidth: 0, height: 54 },
  fab: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  emptyIcon: { width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
});
