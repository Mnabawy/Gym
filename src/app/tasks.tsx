import React, { useEffect, useState } from 'react';
import { LayoutAnimation, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ring, Screen, Sheet, T } from '../components/ui';
import { MenuButton } from '../components/SideMenu';
import { dueAr, TaskSheet } from '../components/TaskSheet';
import { MONTHS_AR, WEEKDAYS_AR } from '../data/program';
import { useDataVersion } from '../lib/bus';
import { addDays } from '../lib/gaps';
import { dateKey, weekdayOf } from '../lib/logic';
import { anytime, counts, moveToQuadrant, parseQuick, PRIORITY, QUADRANTS, quadrantOf, REPEAT_AR, tagColor, taskId, timeAr, todayView, toggleTask, upcoming, type Task } from '../lib/tasks';
import { pruneDone, readTasks, saveTask, writeTasks } from '../lib/taskStore';
import { tap } from '../lib/timer';
import { F, ThemeProvider, tint, useTheme, useWarm, type Theme } from '../theme';

type View_ = 'today' | 'upcoming' | 'anytime' | 'matrix';
const stamp = () => Date.now();
const ease = () => {
  if (Platform.OS !== 'web') LayoutAnimation.configureNext(LayoutAnimation.create(220, 'easeInEaseOut', 'opacity'));
};

export default function TasksSection() {
  return (
    <ThemeProvider value={useWarm()}>
      <Tasks />
    </ThemeProvider>
  );
}

/** مهامي: today (overdue, the day, the evening, done), upcoming by day, any time, and the urgent × important matrix. */
function Tasks() {
  const t = useTheme();
  useDataVersion((s) => s.v);
  const inset = useSafeAreaInsets();
  const today = dateKey();
  const list = readTasks();
  const c = counts(list, today);
  const [view, setView] = useState<View_>('today');
  const [editing, setEditing] = useState<Task | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [quick, setQuick] = useState('');
  const [moving, setMoving] = useState<Task | null>(null);
  const [day, setDay] = useState<string | null>(null);
  useEffect(() => pruneDone(dateKey()), []);

  const toggle = (x: Task) => {
    tap();
    ease();
    writeTasks(toggleTask(readTasks(), x.id, today, taskId(stamp())));
  };
  const addQuick = () => {
    const p = parseQuick(quick, today);
    if (!p.title) return;
    tap();
    ease();
    saveTask({ id: taskId(stamp()), title: p.title, due: p.due ?? (view === 'today' ? today : p.repeat ? today : null), time: p.time, ...(p.evening ? { evening: true } : {}), priority: p.priority ?? 3, ...(p.tag ? { tag: p.tag } : {}), subs: [], repeat: p.repeat, remind: false, done: null, created: today });
    setQuick('');
  };

  const row = (x: Task, last: boolean) => <TaskRow key={x.id} t={t} x={x} today={today} last={last} onToggle={() => toggle(x)} onOpen={() => setEditing(x)} onLong={view === 'matrix' ? () => setMoving(x) : undefined} hideDue={view === 'upcoming'} />;
  const group = (label: string, items: Task[], color?: string, icon?: string) =>
    items.length ? (
      <View key={label} style={{ gap: 6 }}>
        <View style={s.sec}>
          {icon ? <T style={{ fontSize: 13 }}>{icon}</T> : null}
          <T w="semi" style={{ fontSize: 13, color: color ?? t.mute }}>{label}</T>
          <T w="num" style={{ fontSize: 12, color: color ?? t.mute }}>{String(items.length)}</T>
        </View>
        <View style={[s.card, { backgroundColor: t.card, borderColor: t.border }]}>{items.map((x, i) => row(x, i === items.length - 1))}</View>
      </View>
    ) : null;

  const tv = todayView(list, today);
  const todayTotal = tv.overdue.length + tv.day.length + tv.evening.length + tv.done.length;
  const up = upcoming(list, today);
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const perDay = (d: string) => (d === today ? tv.day.length + tv.evening.length + tv.overdue.length : up.find((x) => x.date === d)?.tasks.length ?? 0);
  const titles: Record<View_, string> = { today: 'النهارده', upcoming: 'الجاي', anytime: 'أي وقت', matrix: 'المصفوفة' };
  const subs: Record<View_, string> = {
    today: `${WEEKDAYS_AR[weekdayOf(today)]} · ${+today.slice(8)} ${MONTHS_AR[+today.slice(5, 7) - 1]}`,
    upcoming: `${MONTHS_AR[+today.slice(5, 7) - 1]} ${today.slice(0, 4)}`,
    anytime: 'من غير ميعاد',
    matrix: 'رتّب بالأهمية',
  };

  return (
    <Screen
      title="مهامي"
      action={<MenuButton />}
      footer={
        <View style={[s.bar, { paddingBottom: Math.max(inset.bottom, 10) + 4, backgroundColor: t.bg }]}>
          <View style={[s.quick, { backgroundColor: t.card, borderColor: t.border }]}>
            <Ionicons name="create-outline" size={18} color={t.mute} />
            <TextInput
              value={quick}
              onChangeText={setQuick}
              onSubmitEditing={addQuick}
              submitBehavior="submit"
              returnKeyType="done"
              placeholder="اكتب مهمة… «بكره 5 العصر !1 #شغل»"
              placeholderTextColor={t.mute}
              maxLength={140}
              accessibilityLabel="مهمة سريعة"
              style={[s.quickIn, { color: t.fg, fontFamily: F.body }]}
            />
            {quick.trim() ? (
              <Pressable onPress={addQuick} hitSlop={8} accessibilityRole="button" accessibilityLabel="ضيف">
                <Ionicons name="arrow-up-circle" size={30} color={t.ok} />
              </Pressable>
            ) : null}
          </View>
          <Pressable onPress={() => { setAdding(quick); setQuick(''); }} accessibilityRole="button" accessibilityLabel="مهمة جديدة بالتفاصيل" style={({ pressed }) => [s.fab, { backgroundColor: t.ok, boxShadow: `0px 8px 22px ${tint(t.ok, 0.45)}`, transform: [{ scale: pressed ? 0.94 : 1 }] }]}>
            <Ionicons name="add" size={32} color={t.onOk} />
          </Pressable>
        </View>
      }>
      {editing ? <TaskSheet task={editing} onClose={() => setEditing(null)} /> : null}
      {adding != null ? <TaskSheet initial={adding} onClose={() => setAdding(null)} /> : null}
      {moving ? (
        <Sheet visible onClose={() => setMoving(null)} title="انقلها لـ" sub={moving.title}>
          {QUADRANTS.map((q) => (
            <Pressable key={q.key} onPress={() => { ease(); saveTask(moveToQuadrant(moving, q.key)); setMoving(null); }} accessibilityRole="button" style={({ pressed }) => [s.qBtn, { backgroundColor: tint(q.color, 0.12), borderColor: tint(q.color, 0.35), opacity: pressed ? 0.7 : 1 }]}>
              <T w="bold" style={{ color: q.color, fontSize: 15, flex: 1 }}>{q.title}</T>
              <T style={{ color: t.mute, fontSize: 12.5 }}>{q.sub}</T>
              {quadrantOf(moving, today) === q.key ? <Ionicons name="checkmark" size={18} color={q.color} /> : null}
            </Pressable>
          ))}
        </Sheet>
      ) : null}

      <View style={s.hd}>
        <View style={{ flex: 1 }}>
          <T style={{ color: t.mute, fontSize: 13 }}>{subs[view]}</T>
          <T w="bold" style={{ fontSize: 30, lineHeight: 42 }}>{titles[view]}</T>
        </View>
        {view === 'today' && todayTotal ? (
          <Ring value={tv.done.length / todayTotal} size={58} stroke={6} color={t.ok}>
            <T w="numBold" style={{ fontSize: 13 }}>{`${tv.done.length}/${todayTotal}`}</T>
          </Ring>
        ) : null}
      </View>

      <View style={s.seg}>
        {(
          [
            ['today', 'النهارده', c.today],
            ['upcoming', 'الجاي', c.upcoming],
            ['anytime', 'أي وقت', c.anytime],
            ['matrix', 'المصفوفة', null],
          ] as [View_, string, number | null][]
        ).map(([k, l, n]) => {
          const on = view === k;
          return (
            <Pressable key={k} onPress={() => { ease(); setView(k); }} accessibilityRole="tab" accessibilityState={{ selected: on }} style={({ pressed }) => [s.segBtn, { backgroundColor: on ? t.fg : t.card, opacity: pressed ? 0.8 : 1 }]}>
              <T w="semi" style={{ fontSize: 13, color: on ? t.bg : t.mute }} numberOfLines={1}>{l}</T>
              {n ? <T w="num" style={{ fontSize: 11, color: on ? tint(t.bg, 0.7) : t.mute }}>{String(n)}</T> : null}
            </Pressable>
          );
        })}
      </View>

      {view === 'today' ? (
        todayTotal ? (
          <>
            {group('متأخرة', tv.overdue, '#C0392B', '⚠')}
            {group('النهارده', tv.day, undefined, '☀️')}
            {group('بالليل', tv.evening, undefined, '🌙')}
            {group('خلصت', tv.done, undefined, '✓')}
          </>
        ) : (
          <Empty t={t} icon="sunny-outline" title="يومك فاضي" sub="اكتب أول مهمة تحت، أو دوس + للتفاصيل" />
        )
      ) : null}

      {view === 'upcoming' ? (
        <>
          <View style={s.week}>
            {week.map((d) => {
              const on = (day ?? null) === d;
              const n = perDay(d);
              return (
                <Pressable key={d} onPress={() => setDay(on ? null : d)} accessibilityRole="button" accessibilityState={{ selected: on }} style={[s.wd, { backgroundColor: on ? t.ok : t.card }]}>
                  <T style={{ fontSize: 11, color: on ? t.onOk : t.mute }}>{WEEKDAYS_AR[weekdayOf(d)]}</T>
                  <T w="numBold" style={{ fontSize: 17, color: on ? t.onOk : t.fg }}>{String(+d.slice(8))}</T>
                  <View style={{ flexDirection: 'row', gap: 3, height: 5 }}>
                    {Array.from({ length: Math.min(4, n) }, (_, i) => <View key={i} style={[s.dot, { backgroundColor: on ? t.onOk : t.ok }]} />)}
                  </View>
                </Pressable>
              );
            })}
          </View>
          {(day ? up.filter((x) => x.date === day) : up).map((d) => group(dueAr(d.date, today) + (d.date === addDays(today, 1) ? ` · ${WEEKDAYS_AR[weekdayOf(d.date)]} ${+d.date.slice(8)}` : ''), d.tasks))}
          {day === today ? group('النهارده', [...tv.overdue, ...tv.day, ...tv.evening]) : null}
          {!up.length && !day ? <Empty t={t} icon="calendar-outline" title="مفيش حاجة جاية" sub="اكتب «بكره» أو اسم يوم في المهمة، وهتظهر هنا" /> : null}
        </>
      ) : null}

      {view === 'anytime' ? (anytime(list).length ? group('من غير ميعاد', anytime(list)) : <Empty t={t} icon="file-tray-outline" title="فاضية" sub="المهام اللي ملهاش ميعاد بتتجمع هنا" />) : null}

      {view === 'matrix' ? (
        <>
          <T style={{ fontSize: 12.5, color: t.mute, marginTop: -4 }}>دوسة طويلة على مهمة تنقلها لمربع تاني · العاجل = لحد بكره</T>
          <View style={s.mx}>
            {QUADRANTS.map((q) => {
              const items = list.filter((x) => !x.done && quadrantOf(x, today) === q.key).sort((a, b) => a.priority - b.priority);
              return <QuadrantBox key={q.key} t={t} q={q} items={items} onToggle={toggle} onOpen={setEditing} onLong={setMoving} />;
            })}
          </View>
        </>
      ) : null}
      <View style={{ height: 8 }} />
    </Screen>
  );
}

function Empty({ t, icon, title, sub }: { t: Theme; icon: React.ComponentProps<typeof Ionicons>['name']; title: string; sub: string }) {
  return (
    <View style={{ alignItems: 'center', gap: 6, paddingVertical: 40 }}>
      <View style={[s.emptyIcon, { backgroundColor: tint(t.ok, 0.1) }]}>
        <Ionicons name={icon} size={30} color={t.ok} />
      </View>
      <T w="bold" style={{ fontSize: 17 }}>{title}</T>
      <T style={{ color: t.mute, fontSize: 13, textAlign: 'center' }}>{sub}</T>
    </View>
  );
}

/** One task: a round check in its priority's color, the title, and a line of chips (day, time, steps, repeat, tag). */
function TaskRow({ t, x, today, last, onToggle, onOpen, onLong, hideDue }: { t: Theme; x: Task; today: string; last: boolean; onToggle: () => void; onOpen: () => void; onLong?: () => void; hideDue?: boolean }) {
  const c = PRIORITY[x.priority].color;
  const done = !!x.done;
  const late = !done && x.due != null && x.due < today;
  const subsDone = x.subs.filter((s_) => s_.done).length;
  const chips: { text: string; color?: string; bg?: string }[] = [];
  if (late) chips.push({ text: dueAr(x.due, today), color: '#C0392B', bg: tint('#D93B3B', 0.13) });
  else if (x.due && x.due !== today && !done && !hideDue) chips.push({ text: `📅 ${dueAr(x.due, today)}` });
  if (x.time != null) chips.push({ text: `⏰ ${timeAr(x.time)}` });
  if (x.subs.length) chips.push({ text: `☑ ${subsDone}/${x.subs.length}` });
  if (x.repeat) chips.push({ text: `🔁 ${REPEAT_AR[x.repeat]}` });
  if (x.remind) chips.push({ text: '🔔' });
  if (x.tag) chips.push({ text: `# ${x.tag}`, color: tagColor(x.tag), bg: tint(tagColor(x.tag), 0.13) });
  return (
    <View style={[s.task, { borderBottomWidth: last ? 0 : 1, borderColor: t.line }]}>
      <Pressable onPress={onToggle} hitSlop={10} accessibilityRole="checkbox" accessibilityState={{ checked: done }} accessibilityLabel={x.title} style={[s.cb, { borderColor: done ? t.mute : c, backgroundColor: done ? t.mute : tint(c, 0.1) }]}>
        {done ? <Ionicons name="checkmark" size={15} color={t.bg} /> : null}
      </Pressable>
      <Pressable onPress={onOpen} onLongPress={onLong} delayLongPress={350} accessibilityRole="button" accessibilityHint="افتح التفاصيل" style={({ pressed }) => ({ flex: 1, minWidth: 0, opacity: pressed ? 0.6 : 1 })}>
        <T style={{ fontSize: 15.5, lineHeight: 23, color: done ? t.mute : t.fg, textDecorationLine: done ? 'line-through' : 'none' }}>{x.title}</T>
        {chips.length && !done ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 4 }}>
            {chips.map((ch) => (
              <View key={ch.text} style={[s.chip, { backgroundColor: ch.bg ?? t.soft }]}>
                <T style={{ fontSize: 11.5, color: ch.color ?? t.mute }}>{ch.text}</T>
              </View>
            ))}
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

function QuadrantBox({ t, q, items, onToggle, onOpen, onLong }: { t: Theme; q: (typeof QUADRANTS)[number]; items: Task[]; onToggle: (x: Task) => void; onOpen: (x: Task) => void; onLong: (x: Task) => void }) {
  return (
    <View style={[s.q, { backgroundColor: tint(q.color, 0.1), borderColor: tint(q.color, 0.28) }]}>
      <T w="bold" style={{ color: q.color, fontSize: 14.5 }}>{q.title}</T>
      <T style={{ color: t.mute, fontSize: 11 }}>{q.sub}</T>
      {items.slice(0, 8).map((x) => (
        <View key={x.id} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 7, marginTop: 8 }}>
          <Pressable onPress={() => onToggle(x)} hitSlop={8} accessibilityRole="checkbox" accessibilityState={{ checked: false }} accessibilityLabel={x.title} style={[s.qcb, { borderColor: q.color }]} />
          <Pressable onPress={() => onOpen(x)} onLongPress={() => onLong(x)} delayLongPress={350} style={{ flex: 1 }}>
            <T style={{ fontSize: 13, lineHeight: 19 }} numberOfLines={2}>{x.title}</T>
          </Pressable>
        </View>
      ))}
      {items.length > 8 ? <T style={{ color: t.mute, fontSize: 11.5, marginTop: 6 }}>{`+${items.length - 8} كمان`}</T> : null}
      {!items.length ? <T style={{ color: t.mute, fontSize: 12, marginTop: 8 }}>فاضي</T> : null}
    </View>
  );
}

const s = StyleSheet.create({
  hd: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  seg: { flexDirection: 'row', gap: 6 },
  segBtn: { flex: 1, flexDirection: 'row', gap: 4, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  sec: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 6, marginTop: 4 },
  card: { borderRadius: 22, paddingHorizontal: 14, borderWidth: 1, boxShadow: '0px 4px 18px rgba(80, 60, 30, 0.06)' },
  task: { flexDirection: 'row', gap: 12, paddingVertical: 12, alignItems: 'flex-start' },
  cb: { width: 25, height: 25, borderRadius: 13, borderWidth: 2.2, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  chip: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 8 },
  quick: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 56, borderRadius: 20, borderWidth: 1, paddingHorizontal: 14 },
  quickIn: { flex: 1, minWidth: 0, fontSize: 14.5, textAlign: 'right', outlineWidth: 0, height: 56 },
  fab: { width: 56, height: 56, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  week: { flexDirection: 'row', gap: 5 },
  wd: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 15, gap: 1 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  mx: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  q: { width: '47.5%', flexGrow: 1, minHeight: 220, borderRadius: 22, borderWidth: 1, padding: 12 },
  qcb: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, marginTop: 2 },
  qBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52, borderRadius: 16, borderWidth: 1, paddingHorizontal: 14 },
  emptyIcon: { width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
});
