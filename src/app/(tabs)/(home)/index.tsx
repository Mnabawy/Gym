import React, { useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { MONTHS_AR, WEEKDAYS_AR } from '../../../data/program';
import { Btn, Card, HeaderBtn, INPUT, Ring, Screen, Sep, T } from '../../../components/ui';
import { MenuButton } from '../../../components/SideMenu';
import { HomeSwitch } from '../../../components/GymSwitch';
import { BlockSheet, PlanSheet, TopSheet, type BlockTarget } from '../../../components/DaySheets';
import { Item } from '../../../components/Motion';
import { buildDay, firstFree, hm, nextItem, nowItem, placeAt, splitPast, spanAr, suggest, TOP_MAX, topFor, type PlanItem } from '../../../lib/dayPlan';
import { dayFixed } from '../../../lib/dayFixed';
import { addDays, weekdayOf } from '../../../lib/dates';
import { readTasks, saveTask } from '../../../lib/taskStore';
import { useDataVersion } from '../../../lib/bus';
import { useSettings } from '../../../lib/settings';
import { tickStep, tickTask } from '../../../lib/goalTaskStore';
import { ideaFor, readIdeas, readIntent, setIntent } from '../../../lib/plans';
import { readQuits } from '../../../lib/quitStore';
import { SlipSheet, UrgeScreen } from '../../../components/QuitSheets';
import { clean, milestone, runLabel, type Quit } from '../../../lib/quit';
import { quitLabel } from '../../../lib/calendar';
import { readGoals } from '../../../lib/goalStore';
import { nextTask, progress } from '../../../lib/goals';
import { isPlanKind, PLAN_KINDS, PRIORITY, REPEAT_AR, taskId, type PlanKindKey, type Task } from '../../../lib/tasks';
import { setFocus } from '../../../lib/focusStore';
import { showUndo } from '../../../lib/undo';
import { useToday } from '../../../lib/useToday';
import { useNow } from '../../../lib/useNow';
import { useTheme } from '../../../theme';

const minutesNow = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

/** The clock in minutes, moved on every minute (the «now» line and the current block). */
function useMinute(): number {
  const [m, setM] = useState(minutesNow);
  useEffect(() => {
    const id = setInterval(() => setM(minutesNow()), 30_000);
    return () => clearInterval(id);
  }, []);
  return m;
}

/**
 * يومي (`/`, what the app opens on; أسبوعك is next to it on the switch; `?date=` shows another day, from the week's
 * rings; `?plan=1` opens «+ خطة», with `planKind` / `planTitle` filled in from دفتر الأفكار). About your day, not food (the owner's choice): «نيّة النهارده», what's on now (or
 * what to start in the free time you have: a «أهم ٣» pick, or one of your ideas when there's a long stretch), late
 * tasks, «أهم ٣», بطّل (clean days, «جاتلي رغبة»), the next step of each running goal, and the day as one timeline —
 * prayers, work hours and the workout put themselves on it, tasks and plans (مشوار، خروجة، زيارة، هواية، راحة) with a
 * time are blocks, what's over folds under «فات», and a free gap opens a sheet to put a task in it. Logic in
 * src/lib/dayPlan.ts and src/lib/plans.ts; the evening plan for tomorrow is src/app/plan.tsx.
 */
export default function DayScreen() {
  const t = useTheme();
  useDataVersion((s) => s.v);
  // Settings that move things on the timeline.
  useSettings((s) => `${s.prayer}|${s.place?.lat}|${s.prayerMethod}|${s.reminderTime}|${s.reminderDays.join()}|${s.workOn}|${s.workFrom}|${s.workTo}|${s.workDays.join()}`);
  const today = useToday();
  const params = useLocalSearchParams<{ date?: string; plan?: string; planKind?: string; planTitle?: string }>();
  const q = params.date;
  const date = typeof q === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : today;
  const isToday = date === today;
  const clock = useMinute();
  const [block, setBlock] = useState<BlockTarget | null>(null);
  const [topOpen, setTopOpen] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [plan, setPlan] = useState<{ start?: { kind: PlanKindKey; title: string; date?: string; at?: number } } | null>(null);
  // `?plan=1` (أسبوعك's nudge, خطّط بكرة) opens the plan sheet; closing it clears the link.
  const planOpen = plan != null || params.plan === '1';
  const closePlan = () => {
    setPlan(null);
    if (params.plan) router.setParams({ plan: undefined, planKind: undefined, planTitle: undefined });
  };

  const tasks = readTasks();
  const { fixed } = dayFixed(date, today);
  // A past day has no free time left; another day has no «now».
  const now = isToday ? clock : null;
  const items = buildDay({ date, fixed, tasks, now: date < today ? 24 * 60 : now });
  const top = topFor(tasks, date);
  const cur = now != null ? nowItem(items, now) : null;
  const next = now != null ? nextItem(items, now) : null;
  const sug = now != null ? suggest(items, top, now, date) : null;
  // A long free stretch now (2 hours, or 1 on Friday) and nothing to suggest: one of your ideas.
  const freeNow = now != null && !cur ? items.find((i) => i.kind === 'free' && i.at <= now + 15 && i.end - Math.max(i.at, now) >= (weekdayOf(date) === 5 ? 60 : 120)) : undefined;
  const idea = !sug && freeNow ? ideaFor(readIdeas(), Math.floor(Date.parse(`${date}T12:00:00`) / 86400000) + Math.floor(clock / 120)) : null;
  const { past, rest } = now != null ? splitPast(items, now) : { past: [], rest: items };
  const nowAt = now != null ? rest.findIndex((i) => i.at > now) : -2;
  const late = isToday ? tasks.filter((x) => !x.done && x.due != null && x.due < today).length : 0;
  const plansNoTime = tasks.filter((x) => x.kind && x.due === date && x.time == null && (!x.done || x.done === date));

  const tick = (x: Task) => {
    const undo = tickTask(x.id, date, taskId());
    if (!x.done) showUndo(x.repeat ? `✓ ${x.title} · الجاية ${REPEAT_AR[x.repeat]}` : `✓ ${x.title}`, undo);
  };
  const focus = (title: string) => {
    setFocus({ task: title });
    router.push('/focus');
  };
  // «ركّز» on a suggestion: put the task on the timeline from now, then start a focus block on it.
  const startNow = (x: Task, end: number) => {
    const at = Math.floor(clock / 5) * 5;
    saveTask(placeAt(x, today, at, Math.min(x.mins ?? 50, Math.max(25, end - at))));
    focus(x.title);
  };
  const placeTask = (x: Task) => {
    const base = Math.ceil((now ?? 9 * 60) / 15) * 15;
    const slot = firstFree(items, x.mins ?? (x.kind ? 120 : 50)) ?? { at: base, end: base + 60 };
    setBlock({ slot, pick: x.id });
  };
  // Free slots a plan could start in, for the plan sheet.
  const slotsOn = (d: string) =>
    buildDay({ date: d, fixed: dayFixed(d, today).fixed, tasks: readTasks(), now: d === today ? clock : d < today ? 24 * 60 : null })
      .filter((i) => i.kind === 'free')
      .map((i) => i.at);
  const dayAr = (d: string) => `${WEEKDAYS_AR[weekdayOf(d)]} ${+d.slice(8)} ${MONTHS_AR[+d.slice(5, 7) - 1]}`;
  const title = isToday ? 'النهارده' : date === addDays(today, -1) ? 'امبارح' : date === addDays(today, 1) ? 'بكرة' : WEEKDAYS_AR[weekdayOf(date)];

  return (
    <Screen
      title={title}
      sub={dayAr(date)}
      action={
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {isToday ? <HeaderBtn icon="moon-outline" label="خطّط بكرة" onPress={() => router.push('/plan')} /> : <HeaderBtn icon="today-outline" label="ارجع للنهارده" onPress={() => router.replace('/')} />}
          <MenuButton />
        </View>
      }>
      <HomeSwitch value="day" />

      {date >= today ? <IntentCard date={date} label={isToday ? 'نيّة النهارده' : 'نيّة اليوم ده'} /> : null}

      {isToday ? (
        <Card style={{ paddingVertical: 8, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {cur ? (
            <Ring value={(clock - cur.at) / Math.max(1, cur.end - cur.at)} size={46} stroke={4}>
              <T w="numBold" style={{ fontSize: 11.5, color: t.okText }}>{cur.end - clock >= 60 ? `${Math.floor((cur.end - clock) / 60)}س` : `${cur.end - clock}د`}</T>
            </Ring>
          ) : (
            <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: t.soft, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={sug ? 'flash-outline' : idea ? PLAN_KINDS[idea.kind].icon : 'time-outline'} size={22} color={sug || idea ? t.fg : t.mute} />
            </View>
          )}
          <View style={{ flex: 1, gap: 1 }}>
            {sug ? (
              <>
                <T style={{ fontSize: 12, color: t.mute }}>{`عندك ${spanAr(sug.end - clock)} ${cur ? 'في الشغل' : 'فاضيين'}`}</T>
                <T w="bold" style={{ fontSize: 16 }} numberOfLines={1}>{`ابدأ: ${sug.task.title}`}</T>
                <T style={{ fontSize: 12, color: t.mute }} numberOfLines={1}>{next ? `بعد كده ${next.title} ${hm(next.at)}` : 'من أهم ٣ النهارده'}</T>
              </>
            ) : idea && freeNow ? (
              <>
                <T style={{ fontSize: 12, color: t.mute }}>{`عندك ${spanAr(freeNow.end - clock)} فاضيين`}</T>
                <T w="bold" style={{ fontSize: 16 }} numberOfLines={1}>{`إيه رأيك: ${idea.title}؟`}</T>
                <T style={{ fontSize: 12, color: t.mute }} numberOfLines={1}>{`${PLAN_KINDS[idea.kind].label} من أفكارك`}</T>
              </>
            ) : (
              <>
                <T style={{ fontSize: 12, color: t.mute }}>{cur ? 'دلوقتي' : next ? `الجاي الساعة ${hm(next.at)}` : 'النهارده'}</T>
                <T w="bold" style={{ fontSize: 16 }} numberOfLines={1}>{cur ? cur.title : next ? next.title : 'يومك فاضي'}</T>
                <T style={{ fontSize: 12, color: t.mute }} numberOfLines={1}>
                  {cur ? `فاضل ${spanAr(cur.end - clock)}${next ? ` · بعد كده ${next.title} ${hm(next.at)}` : ''}` : next ? `بعد ${spanAr(next.at - clock)}` : 'حط خطة أو مهمة في وقت فاضي'}
                </T>
              </>
            )}
          </View>
          {sug ? <Btn kind="solid" label="ركّز" onPress={() => startNow(sug.task, sug.end)} /> : null}
          {!sug && idea && freeNow ? <Btn kind="solid" label="حطها" onPress={() => setPlan({ start: { kind: idea.kind, title: idea.title, date: today, at: freeNow.at } })} /> : null}
          {!sug && !idea && cur?.kind === 'task' ? <Btn kind="solid" label="ركّز" onPress={() => focus(cur.title)} /> : null}
          {!sug && !idea && cur?.kind === 'gym' ? <Btn kind="solid" label="افتح" onPress={() => router.navigate('/workout')} /> : null}
        </Card>
      ) : null}

      {late ? (
        <Pressable onPress={() => router.push('/plan')} accessibilityRole="button" style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 12, paddingVertical: 0 }}>
            <Ionicons name="alert-circle" size={20} color={t.warn} />
            <T style={{ flex: 1, fontSize: 14 }}>{`عندك ${late} ${late === 1 ? 'مهمة متأخرة' : late === 2 ? 'مهمتين متأخرين' : 'مهام متأخرة'}`}</T>
            <T style={{ fontSize: 12.5, color: t.mute }}>رتّبهم</T>
            <Ionicons name="chevron-back" size={16} color={t.mute} />
          </Card>
        </Pressable>
      ) : null}

      <Card style={{ paddingVertical: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 40, paddingHorizontal: 12 }}>
          <T w="bold" style={{ fontSize: 14 }}>{isToday ? 'أهم ٣ النهارده' : 'أهم ٣'}</T>
          <T w="num" style={{ fontSize: 12, color: t.mute }}>{`⁦${top.filter((x) => x.done).length} / ${TOP_MAX}⁩`}</T>
        </View>
        {top.map((x) => (
          <Item key={x.id}>
            <Sep />
            <TaskLine
              x={x}
              onTick={() => tick(x)}
              onPress={() => setTopOpen(true)}
              end={x.done ? null : x.time != null && x.due === date ? <T style={{ fontSize: 12, color: t.mute }}>{hm(x.time)}</T> : date >= today ? <SetTime onPress={() => placeTask(x)} /> : null}
            />
          </Item>
        ))}
        {top.length < TOP_MAX && date >= today ? (
          <>
            <Sep />
            <Pressable onPress={() => setTopOpen(true)} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, paddingHorizontal: 12, opacity: pressed ? 0.6 : 1 })}>
              <Ionicons name="add" size={22} color={t.mute} />
              <T style={{ fontSize: 14, color: t.mute }}>{top.length ? 'اختار كمان' : `اختار أهم ٣ حاجات ${isToday ? 'النهارده' : 'لليوم ده'}`}</T>
            </Pressable>
          </>
        ) : null}
      </Card>

      {isToday ? <QuitStrip /> : null}
      {isToday ? <GoalSteps today={today} /> : null}

      <Card style={{ paddingVertical: 0, overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, paddingHorizontal: 12 }}>
          <T w="bold" style={{ fontSize: 14 }}>اليوم</T>
          {date >= today ? (
            <Pressable onPress={() => setPlan({ start: undefined })} hitSlop={8} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 4, height: 30, paddingHorizontal: 10, borderRadius: 8, backgroundColor: t.okSoft, opacity: pressed ? 0.7 : 1 })}>
              <Ionicons name="add" size={16} color={t.okText} />
              <T w="semi" style={{ fontSize: 13, color: t.okText }}>خطة</T>
            </Pressable>
          ) : null}
        </View>
        {plansNoTime.map((x) => (
          <React.Fragment key={x.id}>
            <Sep />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 12 }}>
              <Tick on={!!x.done} color={t.mute} onPress={() => tick(x)} label={x.title} />
              <Ionicons name={PLAN_KINDS[x.kind!].icon} size={16} color={t.mute} />
              <T style={{ flex: 1, fontSize: 14.5, color: x.done ? t.mute : t.fg, textDecorationLine: x.done ? 'line-through' : 'none' }} numberOfLines={1}>{x.title}</T>
              {!x.done && date >= today ? <SetTime onPress={() => placeTask(x)} /> : null}
            </View>
          </React.Fragment>
        ))}
        {items.length ? <Sep /> : <T style={{ fontSize: 13.5, color: t.mute, paddingHorizontal: 12, paddingBottom: 12 }}>مفيش حاجة على اليوم.</T>}
        {past.length ? (
          <>
            <Pressable onPress={() => setShowPast(!showPast)} accessibilityRole="button" accessibilityState={{ expanded: showPast }} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 36, paddingHorizontal: 12, opacity: pressed ? 0.6 : 1 })}>
              <Ionicons name={showPast ? 'chevron-down' : 'chevron-back'} size={15} color={t.mute} />
              <T style={{ flex: 1, fontSize: 13, color: t.mute }}>{`فات ${past.length}`}</T>
            </Pressable>
            {showPast
              ? past.map((it) => (
                  <React.Fragment key={it.id}>
                    <Sep />
                    <Line it={it} live={false} onTick={it.task ? () => tick(it.task!) : undefined} onPress={() => open(it)} />
                  </React.Fragment>
                ))
              : null}
            {rest.length ? <Sep /> : null}
          </>
        ) : null}
        {rest.map((it, i) => (
          <React.Fragment key={it.id}>
            {i > 0 ? <Sep /> : null}
            {i === nowAt && now != null ? <NowLine now={now} /> : null}
            <Line it={it} live={cur?.id === it.id} onTick={it.task ? () => tick(it.task!) : undefined} onPress={() => open(it)} />
          </React.Fragment>
        ))}
        {nowAt === -1 && now != null && rest.length ? <NowLine now={now} /> : null}
      </Card>

      <BlockSheet date={date} target={block} onClose={() => setBlock(null)} />
      <TopSheet date={date} label={isToday ? 'النهارده' : 'لليوم ده'} visible={topOpen} onClose={() => setTopOpen(false)} />
      <PlanSheet visible={planOpen} onClose={closePlan} today={today} slots={slotsOn} start={plan?.start ?? (params.planTitle ? { kind: isPlanKind(params.planKind) ? params.planKind : 'outing', title: params.planTitle, date } : date !== today ? { kind: 'outing', title: '', date } : undefined)} />
    </Screen>
  );

  function open(it: PlanItem) {
    if (it.kind === 'free') setBlock({ slot: { at: it.at, end: it.end } });
    else if (it.kind === 'work' && now != null && it.end > now) setBlock({ slot: { at: Math.max(it.at, Math.ceil(now / 15) * 15), end: it.end } });
    else if (it.kind === 'work' && date > today) setBlock({ slot: { at: it.at, end: it.end } });
    else if (it.kind === 'task' && it.task && !it.task.done) setBlock({ task: it.task });
    else if (it.kind === 'gym') router.navigate('/workout');
  }
}

/** «نيّة النهارده»: one line you write for the day; tap to write or change it. */
function IntentCard({ date, label }: { date: string; label: string }) {
  const t = useTheme();
  const saved = readIntent(date);
  const [text, setText] = useState<string | null>(null);
  const editing = text != null;
  const save = () => {
    if (text != null && text.trim() !== saved) {
      const undo = setIntent(date, text);
      if (!text.trim() && saved) showUndo('النيّة اتشالت', undo);
    }
    setText(null);
  };
  return (
    <Card style={{ paddingVertical: 0 }}>
      {editing ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 12 }}>
          <Ionicons name="compass-outline" size={20} color={t.fg} />
          <TextInput
            autoFocus
            value={text}
            onChangeText={setText}
            onBlur={save}
            onSubmitEditing={save}
            placeholder="النهارده هركز على…"
            placeholderTextColor={t.mute}
            returnKeyType="done"
            style={[INPUT, { flex: 1, fontSize: 15, color: t.fg, textAlign: 'right', minHeight: 40 }]}
          />
        </View>
      ) : (
        <Pressable onPress={() => setText(saved)} accessibilityRole="button" accessibilityLabel={saved ? `${label}: ${saved}` : `اكتب ${label}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 12, opacity: pressed ? 0.7 : 1 })}>
          <Ionicons name="compass-outline" size={20} color={saved ? t.fg : t.mute} />
          <View style={{ flex: 1 }}>
            {saved ? <T style={{ fontSize: 11.5, color: t.mute }}>{label}</T> : null}
            <T w={saved ? 'semi' : 'body'} style={{ fontSize: saved ? 15 : 14, color: saved ? t.fg : t.mute }} numberOfLines={2}>{saved || `${label}: هتركز على إيه؟`}</T>
          </View>
          {saved ? <Ionicons name="pencil" size={15} color={t.mute} /> : null}
        </Pressable>
      )}
    </Card>
  );
}

/**
 * بطّل on يومي: each running quit by its code name (never its real one), its clean run, and «جاتلي رغبة» (the urge
 * screen right here, like on the بطّل tab). Nothing here opens a quit's details: tapping the row goes to the بطّل tab,
 * where a protected one asks for its password.
 */
function QuitStrip() {
  const t = useTheme();
  const now = useNow(60_000);
  const [urge, setUrge] = useState<Quit | null>(null);
  const [slip, setSlip] = useState<Quit | null>(null);
  const quits = readQuits();
  if (!quits.length) return null;
  return (
    <Card style={{ paddingVertical: 0 }}>
      {quits.map((q, i) => {
        const c = clean(q, now);
        const m = milestone(c.ms);
        return (
          <React.Fragment key={q.id}>
            {i ? <Sep /> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 12 }}>
              <Pressable onPress={() => router.navigate('/quit')} accessibilityRole="button" accessibilityHint="يفتح تاب بطّل" style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, opacity: pressed ? 0.7 : 1 })}>
                <Ring value={m.share} size={34} stroke={3.5} color={q.color}>
                  <Ionicons name={q.password ? 'lock-closed' : 'shield-checkmark'} size={13} color={q.color} />
                </Ring>
                <View style={{ flex: 1 }}>
                  <T w="semi" style={{ fontSize: 14.5 }} numberOfLines={1}>{`نضيف ${runLabel(c.ms)}`}</T>
                  <T style={{ fontSize: 12, color: t.mute }} numberOfLines={1}>{`${quitLabel(q, i)} · الجاية ${m.next} يوم`}</T>
                </View>
              </Pressable>
              <Pressable onPress={() => setUrge(q)} accessibilityRole="button" style={({ pressed }) => ({ height: 32, paddingHorizontal: 10, borderRadius: 8, backgroundColor: q.color, justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
                <T w="semi" style={{ fontSize: 12.5, color: '#FFFFFF' }}>جاتلي رغبة</T>
              </Pressable>
            </View>
          </React.Fragment>
        );
      })}
      {urge ? <UrgeScreen q={urge} onClose={() => setUrge(null)} onSlip={() => { setSlip(urge); setUrge(null); }} /> : null}
      {slip ? <SlipSheet q={slip} onClose={() => setSlip(null)} /> : null}
    </Card>
  );
}

/** The next step of each running goal: tick it here (its task in مهامي follows), tap to open the goal. */
function GoalSteps({ today }: { today: string }) {
  const t = useTheme();
  const running = readGoals().filter((g) => !g.umbrella && !g.later && progress(g) < 1);
  if (!running.length) return null;
  return (
    <Card style={{ paddingVertical: 0 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 40, paddingHorizontal: 12 }}>
        <T w="bold" style={{ fontSize: 14 }}>أهدافك النهارده</T>
        <Pressable onPress={() => router.navigate('/goals')} hitSlop={8} accessibilityRole="button">
          <T style={{ fontSize: 12.5, color: t.mute }}>كلها</T>
        </Pressable>
      </View>
      {running.map((g) => {
        const nx = nextTask(g);
        return (
          <Item key={g.id}>
            <Sep />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: 12 }}>
              {nx ? (
                <Pressable
                  onPress={() => {
                    const undo = tickStep(g.id, nx.task.id, today);
                    if (undo) showUndo('✓ خطوة خلصت', undo);
                  }}
                  hitSlop={10}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: false }}
                  accessibilityLabel={`خلصت: ${nx.task.title}`}
                  style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: g.color }}
                />
              ) : (
                <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderStyle: 'dashed', borderColor: g.color, opacity: 0.5 }} />
              )}
              <Pressable onPress={() => router.push(`/goals/${g.id}`)} accessibilityRole="button" style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.7 : 1 })}>
                <T style={{ fontSize: 14.5, color: nx ? t.fg : t.mute }} numberOfLines={1}>{nx ? nx.task.title : 'مفيش خطوة جاية: ضيف واحدة'}</T>
                <T style={{ fontSize: 12, color: t.mute }} numberOfLines={1}>{g.name}</T>
              </Pressable>
            </View>
          </Item>
        );
      })}
    </Card>
  );
}

/** «حط وقت»: a small tinted button at the end of a «أهم ٣» row that has no time yet. */
function SetTime({ onPress }: { onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" style={({ pressed }) => ({ height: 28, paddingHorizontal: 10, borderRadius: 8, backgroundColor: t.okSoft, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
      <T w="semi" style={{ fontSize: 12.5, color: t.okText }}>حط وقت</T>
    </Pressable>
  );
}

/** A task row with its priority ring to tick (أهم ٣). */
function TaskLine({ x, onTick, onPress, end }: { x: Task; onTick: () => void; onPress: () => void; end: React.ReactNode }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, paddingHorizontal: 12, opacity: pressed ? 0.7 : 1 })}>
      <Tick on={!!x.done} color={PRIORITY[x.priority].color} onPress={onTick} label={x.title} />
      <T style={{ flex: 1, fontSize: 14.5, color: x.done ? t.mute : t.fg, textDecorationLine: x.done ? 'line-through' : 'none' }} numberOfLines={1}>{x.title}</T>
      {end}
    </Pressable>
  );
}

function Tick({ on, color, onPress, label }: { on: boolean; color: string; onPress: () => void; label: string }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={label}>
      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: on ? 0 : 2, borderColor: color, backgroundColor: on ? t.ok : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
        {on ? <Ionicons name="checkmark" size={14} color={t.onOk} /> : null}
      </View>
    </Pressable>
  );
}

/** The red «now» line between two rows. */
function NowLine({ now }: { now: number }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 14 }} accessibilityLabel={`دلوقتي ${hm(now)}`}>
      <T w="numBold" style={{ width: 44, fontSize: 11, color: t.bad }}>{hm(now)}</T>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.bad }} />
      <View style={{ flex: 1, height: 1.5, backgroundColor: t.bad }} />
    </View>
  );
}

/** One line on the timeline: time, a small mark, what it is. */
function Line({ it, live, onPress, onTick }: { it: PlanItem; live: boolean; onPress: () => void; onTick?: () => void }) {
  const t = useTheme();
  const time = <T w="num" style={{ width: 44, fontSize: 12, color: t.mute }}>{hm(it.at)}</T>;
  if (it.kind === 'prayer') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 32, paddingHorizontal: 12 }}>
        {time}
        <Ionicons name="moon-outline" size={15} color={t.mute} />
        <T style={{ flex: 1, fontSize: 13, color: t.mute }}>{it.title}</T>
      </View>
    );
  }
  if (it.kind === 'free') {
    return (
      <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 12, opacity: pressed ? 0.6 : 1 })}>
        {time}
        <Ionicons name="add" size={16} color={t.mute} />
        <T style={{ flex: 1, fontSize: 14, color: t.mute }}>{`فاضي ${spanAr(it.end - it.at)} · حط مهمة`}</T>
      </Pressable>
    );
  }
  const color = it.kind === 'task' && it.task ? PRIORITY[it.task.priority].color : it.kind === 'gym' ? t.sec.gym : it.kind === 'work' ? t.mute : t.sec.focus;
  const sub = it.kind === 'task' ? `${hm(it.at)} – ${hm(it.end)} · ${spanAr(it.end - it.at)}` : it.kind === 'work' ? `${it.sub} · حط مهمة شغل فيه` : it.sub;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 12, backgroundColor: live ? t.soft : 'transparent', opacity: pressed ? 0.7 : 1 })}>
      {time}
      {onTick ? <Tick on={it.done} color={color} onPress={onTick} label={it.title} /> : <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, marginHorizontal: 3 }} />}
      {it.task?.kind ? <Ionicons name={PLAN_KINDS[it.task.kind].icon} size={16} color={t.mute} /> : null}
      <View style={{ flex: 1 }}>
        <T w={live ? 'semi' : 'body'} style={{ fontSize: 14.5, color: it.done ? t.mute : t.fg, textDecorationLine: it.done && it.kind === 'task' ? 'line-through' : 'none' }} numberOfLines={1}>{it.title}</T>
        {sub ? <T style={{ fontSize: 12, color: t.mute }} numberOfLines={1}>{sub}</T> : null}
      </View>
      {live ? <T w="semi" style={{ fontSize: 12 }}>دلوقتي</T> : it.done && !onTick && it.kind !== 'task' ? <Ionicons name="checkmark" size={17} color={t.fg} /> : null}
    </Pressable>
  );
}
