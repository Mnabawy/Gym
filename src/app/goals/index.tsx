import React, { useState } from 'react';
import { Item } from '../../components/Motion';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Btn, Card, HeaderBtn, Label, Screen, T } from '../../components/ui';
import { GoalStepsSheet } from '../../components/GoalSteps';
import { MenuButton } from '../../components/SideMenu';
import { GoalForm } from '../../components/GoalForm';
import { ACTION, Swipe } from '../../components/Swipe';
import { Pop } from '../../components/Motion';
import { LogSheet } from './[id]';
import { MONTHS_AR } from '../../data/program';
import { useDataVersion } from '../../lib/bus';
import { deleteGoal, readGoals, saveGoal } from '../../lib/goalStore';
import { taskFollowsStep } from '../../lib/goalTaskStore';
import {
  bringBack, current, FOCUS_MAX, fmtAmount, IDLE_DAYS, idleDays, kidsOf, nextTask, parentOf, progress, putLater, reachDate,
  reviewDue, schedule, toggleTask, umbrellaProgress, WEIGHTS, type Goal,
} from '../../lib/goals';
import { daysBetween } from '../../lib/gaps';
import { confirm } from '../../lib/confirm';
import { dateKey } from '../../lib/logic';
import { showUndo } from '../../lib/undo';
import { tap } from '../../lib/timer';
import { ThemeProvider, tint, useTheme, useWarm, type Theme } from '../../theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
type Tab = 'today' | 'mine' | 'later' | 'done';

const day = (k: string) => `${+k.slice(8)} ${MONTHS_AR[+k.slice(5, 7) - 1]}`;
const month = (k: string) => `${MONTHS_AR[+k.slice(5, 7) - 1]} ${k.slice(0, 4)}`;

export default function GoalsSection() {
  return (
    <ThemeProvider value={useWarm()}>
      <Goals />
    </ThemeProvider>
  );
}

/**
 * The goals section in four parts (the owner's design, Nov 2026): النهارده (how many goals you're on against the
 * focus limit, today's one step for each, and what needs you), أهدافي (every running goal under its big goal),
 * بعدين (goals put off, with «رجّعه») and خلصت (goals reached, and the steps done lately).
 */
function Goals() {
  const t = useTheme();
  useDataVersion((s) => s.v);
  const today = dateKey();
  const goals = readGoals();
  const [tab, setTab] = useState<Tab>('today');
  const [adding, setAdding] = useState(false);
  const [logging, setLogging] = useState<Goal | null>(null);
  const [steps, setSteps] = useState(false);

  const plain = goals.filter((g) => !g.umbrella);
  const running = plain.filter((g) => !g.later && progress(g) < 1);
  const later = plain.filter((g) => g.later);
  const done = plain.filter((g) => !g.later && progress(g) >= 1);

  const toLater = (g: Goal) => {
    saveGoal(putLater(g, today));
    showUndo(`«${g.name}» اتأجّل لبعدين`, () => saveGoal(g));
  };
  const back = (g: Goal) => {
    saveGoal(bringBack(g, today));
    showUndo(`«${g.name}» رجع`, () => saveGoal(g));
  };
  const remove = async (g: Goal) => {
    if (await confirm({ title: 'تمسح الهدف ده؟', body: g.umbrella ? 'هيتشال هو بس، والأهداف اللي تحته هتفضل لوحدها.' : 'هيتشال هو وكل اللي اتسجل فيه.', confirmLabel: 'امسح', danger: true })) deleteGoal(g.id);
  };

  const tabs: [Tab, string, number][] = [
    ['today', 'النهارده', 0],
    ['mine', 'أهدافي', running.length],
    ['later', 'بعدين', later.length],
    ['done', 'خلصت', done.length],
  ];

  return (
    <Screen
      title="الأهداف"
      action={
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <HeaderBtn icon="add" label="هدف جديد" onPress={() => setAdding(true)} />
          <MenuButton />
        </View>
      }>
      {adding ? <GoalForm onClose={() => setAdding(false)} onSaved={(g) => router.push(`/goals/${g.id}`)} /> : null}
      {logging ? <LogSheet g={logging} onClose={() => setLogging(null)} /> : null}
      {steps ? <GoalStepsSheet onClose={() => setSteps(false)} /> : null}

      {!goals.length ? (
        <Card style={{ padding: 16, gap: 8, alignItems: 'center' }}>
          <View style={[s.big, { backgroundColor: tint(t.sec.goals, 0.14) }]}>
            <Ionicons name="flag" size={38} color={t.sec.goals} />
          </View>
          <T w="bold" style={{ fontSize: 19, textAlign: 'center' }}>إيه الهدف الكبير؟</T>
          <T style={{ color: t.mute, textAlign: 'center', lineHeight: 22 }}>
            {'حدّد رقم عايز توصله (فلوس، ساعات تعلّم، كتب…)،\nوهقسّملك الطريق مراحل وخطوات صغيرة،\nوأتابع معاك كل أسبوع لحد ما توصل.'}
          </T>
          <Btn label="حدّد هدفك" kind="solid" onPress={() => setAdding(true)} style={{ alignSelf: 'stretch' }} />
        </Card>
      ) : (
        <>
          <View style={[s.seg, { backgroundColor: t.segBar }]} accessibilityRole="tablist">
            {tabs.map(([k, l, n]) => {
              const on = tab === k;
              return (
                <Pressable key={k} onPress={() => { tap(); setTab(k); }} accessibilityRole="tab" accessibilityState={{ selected: on }} style={[s.segItem, on ? { backgroundColor: t.segOn, boxShadow: '0px 1px 3px rgba(0,0,0,0.12)' } : null]}>
                  <T w={on ? 'semi' : 'medium'} style={{ fontSize: 13, color: on ? t.fg : t.mute }} numberOfLines={1}>{l}</T>
                  {n ? <T w="numBold" style={{ fontSize: 11.5, color: on ? t.okText : t.mute }}>{String(n)}</T> : null}
                </Pressable>
              );
            })}
          </View>
          {tab === 'today' ? <Today t={t} today={today} goals={goals} running={running} later={later} onBack={back} onSteps={() => setSteps(true)} /> : null}
          {tab === 'mine' ? <Mine t={t} today={today} goals={goals} running={running} later={later} onLog={setLogging} onLater={toLater} onRemove={(g) => void remove(g)} onSeeLater={() => setTab('later')} onAdd={() => setAdding(true)} /> : null}
          {tab === 'later' ? <Later t={t} goals={goals} later={later} onBack={back} /> : null}
          {tab === 'done' ? <Done t={t} goals={plain} done={done} /> : null}
        </>
      )}
    </Screen>
  );
}

// ---- النهارده ----

/** How many goals you're on against FOCUS_MAX, one step a goal for today (tick it here), and what needs you. */
function Today({ t, today, goals, running, later, onBack, onSteps }: { t: Theme; today: string; goals: Goal[]; running: Goal[]; later: Goal[]; onBack: (g: Goal) => void; onSteps: () => void }) {
  const n = running.length;
  const over = n > FOCUS_MAX;
  const slots = Math.max(n, FOCUS_MAX);
  const tick = (g: Goal, stepId: string) => {
    tap();
    saveGoal(toggleTask(g, stepId, today));
    taskFollowsStep(g.id, stepId, today);
    showUndo('✓ خطوة خلصت', () => {
      saveGoal(g);
      taskFollowsStep(g.id, stepId, null);
    });
  };
  const review = running.filter((g) => reviewDue(g, today));
  const idle = running.filter((g) => idleDays(g, today) >= IDLE_DAYS);
  const room = n < FOCUS_MAX ? later[0] : undefined;

  return (
    <>
      <Card style={{ padding: 12, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <T w="semi" style={{ flex: 1, fontSize: 15 }}>{n ? `مركّز على ${n} ${n === 1 ? 'هدف' : n === 2 ? 'هدفين' : 'أهداف'}` : 'مفيش أهداف شغالة'}</T>
          <View style={{ flexDirection: 'row', gap: 4 }} accessibilityLabel={`${n} من ${FOCUS_MAX}`}>
            {Array.from({ length: slots }, (_, i) => (
              <View key={i} style={[s.slot, { backgroundColor: i >= n ? tint(t.fg, 0.1) : i >= FOCUS_MAX ? t.warn : t.fg }]} />
            ))}
          </View>
        </View>
        <T style={{ fontSize: 13, lineHeight: 20, color: over ? t.warn : t.mute }}>
          {over
            ? `الحد ${FOCUS_MAX}. أجّل واحد لبعدين لحد ما هدف يخلص، والباقيين هيمشوا أسرع.`
            : n === FOCUS_MAX
              ? 'كده تمام: التركيز على 3 بيوصّل أسرع من كتير في نفس الوقت.'
              : `فاضل مكان لـ ${FOCUS_MAX - n}.`}
        </T>
      </Card>

      {running.length ? (
        <>
          <Label>خطوة النهارده لكل هدف</Label>
          <Card style={{ paddingVertical: 2, overflow: 'hidden' }}>
            {running.map((g, i) => {
              const nx = nextTask(g);
              const when = nx ? nx.task.due ?? schedule(g)?.task[nx.task.id] : undefined;
              const late = !!when && when < today;
              return (
                <Item key={g.id}>
                  <View style={[s.row, { borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderColor: t.line }]}>
                    {nx ? (
                      <Pressable onPress={() => tick(g, nx.task.id)} hitSlop={10} accessibilityRole="checkbox" accessibilityState={{ checked: false }} accessibilityLabel={`خلصت: ${nx.task.title}`} style={[s.ring, { borderColor: g.color }]} />
                    ) : (
                      <View style={[s.ring, { borderColor: tint(g.color, 0.4), borderStyle: 'dashed' }]} />
                    )}
                    <Pressable onPress={() => router.push(`/goals/${g.id}`)} accessibilityRole="button" style={({ pressed }) => [s.rowBody, { opacity: pressed ? 0.6 : 1 }]}>
                      <T style={{ fontSize: 15, color: nx ? t.fg : t.mute }} numberOfLines={2}>{nx ? nx.task.title : 'مفيش خطوة جاية: ضيف واحدة'}</T>
                      <T style={{ fontSize: 12.5, color: late ? t.bad : t.mute }} numberOfLines={1}>
                        {`${g.name}${when ? ` · ${late ? 'متأخرة من' : 'لحد'} ${day(when)}` : ''}`}
                      </T>
                    </Pressable>
                    <Ionicons name="chevron-back" size={16} color={t.mute} />
                  </View>
                </Item>
              );
            })}
          </Card>
        </>
      ) : null}

      <Label>محتاج منك</Label>
      <Card style={{ paddingVertical: 2, overflow: 'hidden' }}>
        {room ? (
          <View style={s.row}>
            <Ionicons name="arrow-undo-outline" size={20} color={t.okText} />
            <T style={{ flex: 1, fontSize: 15 }} numberOfLines={2}>{`فيه مكان: ترجّع «${room.name}»؟`}</T>
            <Pressable onPress={() => onBack(room)} accessibilityRole="button" style={({ pressed }) => [s.pill, { backgroundColor: t.okSoft, opacity: pressed ? 0.6 : 1 }]}>
              <T w="semi" style={{ fontSize: 13.5, color: t.okText }}>رجّعه</T>
            </Pressable>
          </View>
        ) : null}
        {review.map((g, i) => (
          <NeedRow key={`r${g.id}`} t={t} first={!room && !i} icon="chatbubbles-outline" color={t.fg} label={`مراجعة الأسبوع: ${g.name}`} aside="دقيقتين" onPress={() => router.push(`/goals/${g.id}`)} />
        ))}
        {idle.map((g, i) => (
          <NeedRow key={`i${g.id}`} t={t} first={!room && !review.length && !i} icon="alert-circle-outline" color={t.warn} label={g.name} aside={`واقف ${idleDays(g, today)} يوم`} asideColor={t.warn} onPress={() => router.push(`/goals/${g.id}`)} />
        ))}
        <NeedRow t={t} first={!room && !review.length && !idle.length} icon="calendar-outline" color={t.okText} label="حوّل خطوات فترة لمهام" aside="اختار من التقويم" onPress={onSteps} />
      </Card>
    </>
  );
}

function NeedRow({ t, first, icon, color, label, aside, asideColor, onPress }: { t: Theme; first: boolean; icon: IconName; color: string; label: string; aside: string; asideColor?: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}، ${aside}`} style={({ pressed }) => [s.row, { borderTopWidth: first ? 0 : StyleSheet.hairlineWidth, borderColor: t.line, opacity: pressed ? 0.6 : 1 }]}>
      <Ionicons name={icon} size={20} color={color} />
      <T style={{ flex: 1, fontSize: 15 }} numberOfLines={2}>{label}</T>
      <T style={{ fontSize: 12.5, color: asideColor ?? t.mute }}>{aside}</T>
    </Pressable>
  );
}

// ---- أهدافي ----

/** Every running goal, under its big goal (each big goal = one area), then the ones on their own. */
function Mine({ t, today, goals, running, later, onLog, onLater, onRemove, onSeeLater, onAdd }: { t: Theme; today: string; goals: Goal[]; running: Goal[]; later: Goal[]; onLog: (g: Goal) => void; onLater: (g: Goal) => void; onRemove: (g: Goal) => void; onSeeLater: () => void; onAdd: () => void }) {
  const bigs = goals.filter((g) => g.umbrella);
  const alone = running.filter((g) => !parentOf(goals, g));
  const rows = (list: Goal[]) => (
    <Card style={{ paddingVertical: 2, overflow: 'hidden' }}>
      {list.map((g, i) => (
        <Item key={g.id}>
          <GoalRow t={t} g={g} today={today} first={!i} onLog={() => onLog(g)} onLater={() => onLater(g)} onRemove={() => onRemove(g)} />
        </Item>
      ))}
    </Card>
  );
  return (
    <>
      {bigs.map((u) => {
        const kids = kidsOf(goals, u.id);
        const on = kids.filter((k) => running.includes(k));
        const off = kids.filter((k) => k.later).length;
        const p = umbrellaProgress(u, kids);
        return (
          <View key={u.id} style={{ gap: 8 }}>
            <Swipe style={s.swipe} end={[{ icon: 'trash', label: 'امسح', color: ACTION.red, onPress: () => onRemove(u) }]}>
              <Pressable onPress={() => router.push(`/goals/${u.id}`)} accessibilityRole="button" accessibilityLabel={`هدف كبير: ${u.name}، ${Math.floor(p * 100)}%`} style={({ pressed }) => [s.bigTile, { backgroundColor: t.card, opacity: pressed ? 0.7 : 1 }]}>
                <View style={[s.bigIcon, { backgroundColor: u.color }]}>
                  <Ionicons name={u.icon as IconName} size={20} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                    <T w="semi" style={{ flex: 1, fontSize: 12, color: t.mute }}>هدف كبير</T>
                    <T w="numBold" style={{ fontSize: 13, color: t.mute }}>{`${Math.floor(p * 100)}%`}</T>
                  </View>
                  <T w="bold" style={{ fontSize: 17 }} numberOfLines={1}>{u.name}</T>
                  <View style={[s.bar, { backgroundColor: tint(u.color, 0.18) }]}>
                    <View style={{ width: `${Math.max(2, p * 100)}%`, height: 6, borderRadius: 3, backgroundColor: u.color }} />
                  </View>
                </View>
              </Pressable>
            </Swipe>
            {on.length ? rows(on) : <T style={{ fontSize: 12.5, color: t.mute, paddingHorizontal: 4 }}>مفيش أهداف شغالة تحته. افتحه وضيف واحد</T>}
            {off ? (
              <Pressable onPress={onSeeLater} accessibilityRole="button" style={{ paddingHorizontal: 4, minHeight: 32, justifyContent: 'center' }}>
                <T style={{ fontSize: 13, color: t.mute }}>{`تحته كمان ${off} متأجّلين لبعدين ←`}</T>
              </Pressable>
            ) : null}
          </View>
        );
      })}
      {alone.length ? (
        <>
          {bigs.length ? <Label>لوحدها</Label> : null}
          {rows(alone)}
        </>
      ) : null}
      {!running.length && !later.length ? <T style={{ fontSize: 13, color: t.mute, textAlign: 'center' }}>كل أهدافك خلصت 🎉 ضيف الهدف الجاي</T> : null}
      <Btn label="+ هدف جديد" kind="solid" onPress={onAdd} />
    </>
  );
}

/** One goal: icon, name (+ weight, «واقف»), its bar, and «x من y · لحد …»; swipe to log, put off or delete. */
function GoalRow({ t, g, today, first, onLog, onLater, onRemove }: { t: Theme; g: Goal; today: string; first: boolean; onLog: () => void; onLater: () => void; onRemove: () => void }) {
  const p = progress(g);
  const idle = idleDays(g, today) >= IDLE_DAYS;
  return (
    <Swipe
      start={[{ icon: 'add-circle-outline', label: 'سجّل', color: ACTION.green, onPress: onLog }]}
      end={[
        { icon: 'trash', label: 'امسح', color: ACTION.red, onPress: onRemove },
        { icon: 'time-outline', label: 'بعدين', color: ACTION.orange, onPress: onLater },
      ]}>
      <Pressable onPress={() => router.push(`/goals/${g.id}`)} accessibilityRole="button" accessibilityLabel={`${g.name}: ${Math.floor(p * 100)}%`} style={({ pressed }) => [s.goal, { backgroundColor: t.card, borderTopWidth: first ? 0 : StyleSheet.hairlineWidth, borderColor: t.line, opacity: pressed ? 0.7 : 1 }]}>
        <View style={[s.icon, { backgroundColor: tint(g.color, 0.15) }]}>
          <Ionicons name={g.icon as IconName} size={17} color={g.color} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <T style={{ flex: 1, fontSize: 15 }} numberOfLines={1}>{g.name}</T>
            {idle ? <T w="semi" style={{ fontSize: 11.5, color: t.warn }}>واقف</T> : (g.weight ?? 1) > 1 ? <T style={{ fontSize: 11.5, color: t.mute }}>{WEIGHTS[g.weight ?? 1]}</T> : null}
          </View>
          <View style={[s.thin, { backgroundColor: tint(g.color, 0.18) }]}>
            <View style={{ width: `${Math.max(2, p * 100)}%`, height: 4, borderRadius: 2, backgroundColor: g.color }} />
          </View>
          <T style={{ fontSize: 12.5, color: t.mute }} numberOfLines={1}>{`${fmtAmount(current(g), g.unit)} من ${fmtAmount(g.target, g.unit)}${g.due ? ` · لحد ${month(g.due)}` : ''}`}</T>
        </View>
      </Pressable>
    </Swipe>
  );
}

// ---- بعدين ----

function Later({ t, goals, later, onBack }: { t: Theme; goals: Goal[]; later: Goal[]; onBack: (g: Goal) => void }) {
  return (
    <>
      <T style={{ fontSize: 13.5, lineHeight: 21, color: t.mute, paddingHorizontal: 4 }}>أهداف مأجّلة بقرار منك. كل اللي فيها محفوظ، ومش بتتحسب في الشغالة ولا بتيجي في رسالة الصبح.</T>
      {later.length ? (
        <Card style={{ paddingVertical: 2, overflow: 'hidden' }}>
          {later.map((g, i) => {
            const u = parentOf(goals, g);
            return (
              <Item key={g.id}>
                <View style={[s.goal, { borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderColor: t.line }]}>
                  <Pressable onPress={() => router.push(`/goals/${g.id}`)} accessibilityRole="button" style={({ pressed }) => [{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.6 : 1 }]}>
                    <View style={[s.icon, { backgroundColor: t.soft }]}>
                      <Ionicons name={g.icon as IconName} size={17} color={t.mute} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <T style={{ fontSize: 15 }} numberOfLines={1}>{g.name}</T>
                      <T style={{ fontSize: 12.5, color: t.mute }} numberOfLines={1}>{`متأجّل من ${day(g.later!)}${u ? ` · ${u.name}` : ''} · ${Math.floor(progress(g) * 100)}%`}</T>
                    </View>
                  </Pressable>
                  <Pressable onPress={() => onBack(g)} accessibilityRole="button" accessibilityLabel={`رجّع ${g.name}`} style={({ pressed }) => [s.pill, { backgroundColor: t.okSoft, opacity: pressed ? 0.6 : 1 }]}>
                    <T w="semi" style={{ fontSize: 13.5, color: t.okText }}>رجّعه</T>
                  </Pressable>
                </View>
              </Item>
            );
          })}
        </Card>
      ) : (
        <Card style={{ padding: 16, alignItems: 'center', gap: 4 }}>
          <Ionicons name="time-outline" size={28} color={t.mute} />
          <T style={{ fontSize: 14, color: t.mute, textAlign: 'center', lineHeight: 21 }}>مفيش أهداف متأجّلة. لو عندك أكتر من 3 شغالين، اسحب واحد في «أهدافي» واختار «بعدين».</T>
        </Card>
      )}
      <Card style={{ padding: 12, flexDirection: 'row', gap: 10 }}>
        <Ionicons name="information-circle-outline" size={20} color={t.fg} />
        <View style={{ flex: 1, gap: 2 }}>
          <T w="semi" style={{ fontSize: 14.5 }}>إمتى ترجّعهم؟</T>
          <T style={{ fontSize: 13, color: t.mute, lineHeight: 20 }}>{`لما الشغالين يبقوا أقل من ${FOCUS_MAX}. «النهارده» هيقولك لما يبقى فيه مكان.`}</T>
        </View>
      </Card>
    </>
  );
}

// ---- خلصت ----

/** Goals that reached their number (when, and in how long), and the steps ticked lately across all goals. */
function Done({ t, goals, done }: { t: Theme; goals: Goal[]; done: Goal[] }) {
  const recent = goals
    .flatMap((g) => g.stages.flatMap((st) => st.tasks.filter((x) => x.done).map((x) => ({ g, x }))))
    .sort((a, b) => (a.x.done! < b.x.done! ? 1 : -1))
    .slice(0, 10);
  return (
    <>
      {done.length ? (
        <Card style={{ paddingVertical: 2, overflow: 'hidden' }}>
          {done.map((g, i) => {
            const at = reachDate(g, g.target) ?? g.startDate;
            return (
              <Pressable key={g.id} onPress={() => router.push(`/goals/${g.id}`)} accessibilityRole="button" style={({ pressed }) => [s.goal, { borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderColor: t.line, opacity: pressed ? 0.6 : 1 }]}>
                <View style={[s.icon, { backgroundColor: tint(g.color, 0.15) }]}>
                  <Ionicons name="trophy" size={17} color={g.color} />
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <T style={{ fontSize: 15 }} numberOfLines={1}>{g.name}</T>
                  <T style={{ fontSize: 12.5, color: t.mute }}>{`وصلت ${day(at)} ${at.slice(0, 4)} · في ${Math.max(1, daysBetween(g.startDate, at))} يوم`}</T>
                </View>
                <Ionicons name="chevron-back" size={16} color={t.mute} />
              </Pressable>
            );
          })}
        </Card>
      ) : (
        <Card style={{ padding: 18, alignItems: 'center', gap: 6 }}>
          <Ionicons name="trophy-outline" size={32} color="#B26A12" />
          <T w="semi" style={{ fontSize: 16 }}>لسه مفيش هدف خلص</T>
          <T style={{ fontSize: 13, color: t.mute, textAlign: 'center', lineHeight: 20 }}>أول ما هدف يوصل للآخر بيتنقل هنا بتاريخه وقد إيه أخد، ويسيب مكانه لهدف من «بعدين».</T>
        </Card>
      )}
      {recent.length ? (
        <>
          <Label>آخر خطوات خلصت</Label>
          <Card style={{ paddingVertical: 2, overflow: 'hidden' }}>
            {recent.map(({ g, x }, i) => (
              <Pressable key={`${g.id}${x.id}`} onPress={() => router.push(`/goals/${g.id}`)} accessibilityRole="button" style={({ pressed }) => [s.row, { borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderColor: t.line, opacity: pressed ? 0.6 : 1 }]}>
                <View style={[s.doneDot, { backgroundColor: tint(g.color, 0.18) }]}>
                  <Pop value="done"><Ionicons name="checkmark" size={14} color={g.color} /></Pop>
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                  <T style={{ fontSize: 15 }} numberOfLines={1}>{x.title}</T>
                  <T style={{ fontSize: 12.5, color: t.mute }} numberOfLines={1}>{g.name}</T>
                </View>
                <T style={{ fontSize: 12.5, color: t.mute }}>{day(x.done!)}</T>
              </Pressable>
            ))}
          </Card>
        </>
      ) : null}
    </>
  );
}

const s = StyleSheet.create({
  big: { width: 76, height: 76, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  seg: { flexDirection: 'row', padding: 2, borderRadius: 9, gap: 2 },
  segItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, height: 32, borderRadius: 7 },
  slot: { width: 20, height: 8, borderRadius: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 12, paddingVertical: 6 },
  rowBody: { flex: 1, minWidth: 0, gap: 2 },
  ring: { width: 26, height: 26, borderRadius: 13, borderWidth: 2 },
  pill: { height: 34, paddingHorizontal: 14, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  swipe: { borderRadius: 12, overflow: 'hidden' },
  bigTile: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12 },
  bigIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  bar: { height: 6, borderRadius: 3, overflow: 'hidden' },
  goal: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingHorizontal: 12, paddingVertical: 8 },
  icon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  thin: { height: 4, borderRadius: 2, overflow: 'hidden' },
  doneDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
