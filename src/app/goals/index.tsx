import React, { useState } from 'react';
import { Item } from '../../components/Motion';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Btn, Card, Ring, Screen, T } from '../../components/ui';
import { MenuButton } from '../../components/SideMenu';
import { GoalForm } from '../../components/GoalForm';
import { ACTION, Swipe } from '../../components/Swipe';
import { LogSheet } from './[id]';
import { useDataVersion } from '../../lib/bus';
import { deleteGoal, readGoals } from '../../lib/goalStore';
import { activeKids, current, FOCUS_MAX, fmtAmount, IDLE_DAYS, idleDays, kidsOf, needsYou, nextTask, parentOf, progress, reviewDue, stalled, sumsUp, umbrellaProgress, umbrellaValue, type Goal } from '../../lib/goals';
import { confirm } from '../../lib/confirm';
import { dateKey } from '../../lib/logic';
import { glow, ThemeProvider, tint, useTheme, useWarm } from '../../theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];


export default function GoalsSection() {
  return (
    <ThemeProvider value={useWarm()}>
      <Goals />
    </ThemeProvider>
  );
}

/** The goals section: each goal as a glowing tile with how far you are and the next step; tap one for its page. */
function Goals() {
  const t = useTheme();
  useDataVersion((s) => s.v);
  const today = dateKey();
  const goals = readGoals();
  const [adding, setAdding] = useState(false);
  const [logging, setLogging] = useState<Goal | null>(null);
  const remove = async (g: Goal) => {
    if (await confirm({ title: 'تمسح الهدف ده؟', body: g.umbrella ? 'هيتشال هو بس، والأهداف اللي تحته هتفضل لوحدها.' : 'هيتشال هو وكل اللي اتسجل فيه.', confirmLabel: 'امسح', danger: true })) deleteGoal(g.id);
  };

  return (
    <Screen title="الأهداف" action={<MenuButton />}>
      {adding ? <GoalForm onClose={() => setAdding(false)} onSaved={(g) => router.push(`/goals/${g.id}`)} /> : null}
      {logging ? <LogSheet g={logging} onClose={() => setLogging(null)} /> : null}
      {!goals.length ? (
        <Card style={{ padding: 16, gap: 8, alignItems: 'center' }}>
          <View style={[s.big, { backgroundColor: tint(t.sec.goals, 0.14), borderColor: tint(t.sec.goals, 0.6), boxShadow: glow(t, t.sec.goals, 18) }]}>
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
          {/* Big goals first, each with the goals under it; then the goals on their own. */}
          {goals.filter((g) => g.umbrella).map((u) => <BigTile key={u.id} u={u} kids={kidsOf(goals, u.id)} today={today} onRemove={() => void remove(u)} />)}
          {goals.filter((g) => !g.umbrella && !parentOf(goals, g)).map((g) => (
            <Item key={g.id}><GoalTile g={g} today={today} onLog={() => setLogging(g)} onRemove={() => void remove(g)} /></Item>
          ))}
          <Btn label="+ هدف جديد" onPress={() => setAdding(true)} />
        </>
      )}
    </Screen>
  );
}

/** One goal: icon, name, where you are, its ring, the next step and a nudge when it's idle or the review is due. */
function GoalTile({ g, today, onLog, onRemove }: { g: Goal; today: string; onLog: () => void; onRemove: () => void }) {
  const t = useTheme();
            const p = progress(g);
  const next = nextTask(g);
  const idle = idleDays(g, today);
  return (
    <Swipe
      style={s.swipe}
      start={[{ icon: 'add-circle-outline', label: 'سجّل', color: ACTION.green, onPress: onLog }]}
      end={[
        { icon: 'trash', label: 'امسح', color: ACTION.red, onPress: onRemove },
        { icon: 'open-outline', label: 'افتح', color: ACTION.grey, onPress: () => router.push(`/goals/${g.id}`) },
      ]}><Pressable
      onPress={() => router.push(`/goals/${g.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`${g.name}: ${Math.floor(p * 100)}%`}
      style={({ pressed }) => [s.tile, { backgroundColor: t.card, borderColor: tint(g.color, 0.6), transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={[s.icon, { backgroundColor: tint(g.color, 0.14), borderColor: tint(g.color, 0.6) }]}>
          <Ionicons name={g.icon as IconName} size={20} color={g.color} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
          <T w="semi" style={{ fontSize: 15 }} numberOfLines={2}>{g.name}</T>
          <T style={{ fontSize: 12, color: t.mute }}>{`${fmtAmount(current(g), g.unit)} من ${fmtAmount(g.target, g.unit)}`}</T>
        </View>
        <View>
          <Ring value={p} size={46} stroke={4} color={g.color} track={tint(g.color, 0.15)}>
            <T w="numBold" style={{ fontSize: 12, color: g.color }}>{`${Math.floor(p * 100)}%`}</T>
          </Ring>
        </View>
      </View>
      {next ? (
        <View style={[s.next, { backgroundColor: tint(g.color, 0.08) }]}>
          <Ionicons name="arrow-back-circle" size={15} color={g.color} />
          <T style={{ flex: 1, fontSize: 12.5 }} numberOfLines={1}>{`الخطوة الجاية: ${next.task.title}`}</T>
        </View>
      ) : null}
      {idle >= IDLE_DAYS || reviewDue(g, today) ? (
        <View style={[s.nudge, { backgroundColor: t.warnSoft }]}>
          <Ionicons name="alert-circle" size={15} color={t.warn} />
          <T style={{ flex: 1, fontSize: 12, color: t.warn }}>{idle >= IDLE_DAYS ? `بقالك ${idle} يوم من غير حركة` : 'مراجعة الأسبوع مستنياك'}</T>
        </View>
      ) : null}
    </Pressable></Swipe>
  );
}

/**
 * A big goal: its number (or the share of the way) and ring, then each goal under it as a row with its share, a red
 * «واقف» when nothing moved for two weeks, and «ابدأ بده» on the one that most needs you today.
 */
function BigTile({ u, kids, today, onRemove }: { u: Goal; kids: Goal[]; today: string; onRemove: () => void }) {
  const t = useTheme();
  const p = umbrellaProgress(u, kids);
  const sum = sumsUp(u, kids);
  const focus = needsYou(kids, today);
  const running = activeKids(kids).length;
  return (
    <Item>
      <Swipe
        style={s.swipe}
        end={[
          { icon: 'trash', label: 'امسح', color: ACTION.red, onPress: onRemove },
          { icon: 'open-outline', label: 'افتح', color: ACTION.grey, onPress: () => router.push(`/goals/${u.id}`) },
        ]}>
        <View style={[s.tile, { backgroundColor: t.card, borderColor: tint(u.color, 0.6), gap: 8 }]}>
          <Pressable onPress={() => router.push(`/goals/${u.id}`)} accessibilityRole="button" accessibilityLabel={`${u.name}: ${Math.floor(p * 100)}%`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={[s.icon, { backgroundColor: u.color, borderColor: u.color }]}>
              <Ionicons name={u.icon as IconName} size={20} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
              <T style={{ fontSize: 11.5, color: u.color }} w="semi">هدف كبير</T>
              <T w="bold" style={{ fontSize: 16 }} numberOfLines={2}>{u.name}</T>
              <T style={{ fontSize: 12, color: t.mute }}>{sum || !kids.length ? `${fmtAmount(sum ? umbrellaValue(u, kids) : current(u), u.unit)} من ${fmtAmount(u.target, u.unit)}` : `${kids.length} أهداف تحته`}</T>
            </View>
            <Ring value={p} size={50} stroke={4.5} color={u.color} track={tint(u.color, 0.15)}>
              <T w="numBold" style={{ fontSize: 12.5, color: u.color }}>{`${Math.floor(p * 100)}%`}</T>
            </Ring>
          </Pressable>
          {kids.length ? (
            <View style={[s.kids, { borderColor: t.line }]}>
              {kids.map((k) => {
                const kp = progress(k);
                const st = stalled(k, today);
                return (
                  <Pressable key={k.id} onPress={() => router.push(`/goals/${k.id}`)} accessibilityRole="button" style={({ pressed }) => [s.kid, { opacity: pressed ? 0.6 : 1 }]}>
                    <Ionicons name={k.icon as IconName} size={16} color={k.color} />
                    <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <T style={{ fontSize: 13.5, flexShrink: 1 }} numberOfLines={1}>{k.name}</T>
                        {focus?.id === k.id ? <T w="semi" style={{ fontSize: 11, color: t.okText }}>ابدأ بده</T> : null}
                        {st ? <T w="semi" style={{ fontSize: 11, color: t.bad }}>واقف</T> : null}
                      </View>
                      <View style={[s.kidBar, { backgroundColor: tint(k.color, 0.15) }]}>
                        <View style={{ width: `${kp * 100}%`, height: 4, borderRadius: 2, backgroundColor: k.color }} />
                      </View>
                    </View>
                    <T w="numBold" style={{ fontSize: 12, color: t.mute }}>{`${Math.floor(kp * 100)}%`}</T>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <T style={{ fontSize: 12.5, color: t.mute }}>مفيش أهداف تحته لسه. افتحه وضيف الأهداف اللي هتوصّلك له</T>
          )}
          {running > FOCUS_MAX ? <T style={{ fontSize: 12, color: t.warn }}>{`${running} أهداف شغالة في نفس الوقت. ركّز على ${FOCUS_MAX} وأجّل الباقي`}</T> : null}
        </View>
      </Swipe>
    </Item>
  );
}

const s = StyleSheet.create({
  big: { width: 76, height: 76, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  swipe: { borderRadius: 12, overflow: 'hidden' },
  tile: { padding: 10, borderRadius: 12, borderWidth: 1, gap: 6 },
  icon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  next: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  kids: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 6, gap: 2 },
  kid: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  kidBar: { height: 4, borderRadius: 2, overflow: 'hidden' },
  nudge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
});
