// The page of a big goal (هدف كبير): its number or share of the way, where to start today, and the goals under it
// with how much each adds, its weight and whether it stalled. Goals are added under it from here (new or existing).
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Btn, Screen, Sheet, T } from './ui';
import { GoalForm } from './GoalForm';
import { GoalHeader } from './GoalHeader';
import { activeKids, current, FOCUS_MAX, fmtAmount, kidsOf, needsYou, nextTask, parentOf, progress, share, stalled, STALL_DAYS, sumsUp, umbrellaProgress, umbrellaValue, WEIGHTS, type Goal } from '../lib/goals';
import { readGoals, saveGoal } from '../lib/goalStore';
import { tap } from '../lib/timer';
import { tint, useTheme, type Theme } from '../theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function BigGoalPage({ u, today, onLog }: { u: Goal; today: string; onLog: () => void }) {
  const t = useTheme();
  const goals = readGoals();
  const kids = kidsOf(goals, u.id);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [linking, setLinking] = useState(false);
  const p = umbrellaProgress(u, kids);
  const sum = sumsUp(u, kids);
  const value = sum ? umbrellaValue(u, kids) : current(u);
  const focus = needsYou(kids, today);
  const step = focus ? nextTask(focus) : null;
  const running = activeKids(kids).length;
  const loose = goals.filter((g) => !g.umbrella && !parentOf(goals, g));

  return (
    <Screen title={u.name} header={<GoalHeader g={u} onMore={() => setEditing(true)} />}>
      {editing ? <GoalForm goal={u} onClose={() => setEditing(false)} /> : null}
      {adding ? <GoalForm parent={u.id} onClose={() => setAdding(false)} /> : null}
      {linking ? <LinkSheet t={t} u={u} loose={loose} onClose={() => setLinking(false)} /> : null}

      <View style={{ gap: 2 }}>
        <T w="numBold" style={{ fontSize: 36, lineHeight: 46, alignSelf: 'flex-start', maxWidth: '100%' }} numberOfLines={1} adjustsFontSizeToFit>
          {sum || !kids.length ? fmtAmount(value, u.unit) : `${Math.floor(p * 100)}%`}
        </T>
        <T style={{ fontSize: 12.5, color: t.mute }}>
          {p >= 1 ? 'وصلت 🎉' : sum || !kids.length ? `من ${fmtAmount(u.target, u.unit)} · فاضل ${fmtAmount(Math.abs(u.target - value), u.unit)}` : 'متوسط اللي قطعته في الأهداف اللي تحته، كل واحد بوزنه'}
        </T>
      </View>
      <View style={[s.bar, { backgroundColor: tint(u.color, 0.15) }]}>
        <View style={{ width: `${p * 100}%`, height: 10, borderRadius: 5, backgroundColor: u.color }} />
      </View>

      {/* Where to start today: the goal that most needs you, and its next step. */}
      {focus ? (
        <Pressable onPress={() => router.push(`/goals/${focus.id}`)} accessibilityRole="button" style={({ pressed }) => [s.focus, { backgroundColor: tint(t.ok, 0.1), opacity: pressed ? 0.7 : 1 }]}>
          <Ionicons name="navigate-circle" size={22} color={t.okText} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <T w="semi" style={{ fontSize: 12.5, color: t.okText }}>ابدأ النهارده بـ</T>
            <T w="semi" style={{ fontSize: 15 }} numberOfLines={1}>{focus.name}</T>
            {step ? <T style={{ fontSize: 12.5, color: t.mute }} numberOfLines={1}>{`الخطوة الجاية: ${step.task.title}`}</T> : null}
          </View>
          <Ionicons name="chevron-back" size={18} color={t.mute} />
        </Pressable>
      ) : null}

      <T w="semi" style={{ fontSize: 13, color: t.mute, marginTop: 6 }}>{kids.length ? `الأهداف اللي تحته · ${running} شغالة` : 'الأهداف اللي تحته'}</T>
      {kids.length ? (
        <View style={[s.card, { backgroundColor: t.card }]}>
          {kids.map((k, i) => {
            const kp = progress(k);
            const st = stalled(k, today);
            const nx = nextTask(k);
            const add = share(u, kids, k);
            return (
              <Pressable key={k.id} onPress={() => router.push(`/goals/${k.id}`)} accessibilityRole="button" style={({ pressed }) => [s.kid, { borderBottomWidth: i < kids.length - 1 ? StyleSheet.hairlineWidth : 0, borderColor: t.line, opacity: pressed ? 0.6 : 1 }]}>
                <View style={[s.kidIcon, { backgroundColor: tint(k.color, 0.14) }]}>
                  <Ionicons name={k.icon as IconName} size={17} color={k.color} />
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <T w="semi" style={{ fontSize: 14.5, flexShrink: 1 }} numberOfLines={1}>{k.name}</T>
                    {(k.weight ?? 1) > 1 ? <T style={{ fontSize: 11, color: t.mute }}>{WEIGHTS[k.weight ?? 1]}</T> : null}
                    {st ? <T w="semi" style={{ fontSize: 11, color: t.bad }}>{`واقف ${STALL_DAYS}+ يوم`}</T> : null}
                  </View>
                  <View style={[s.kidBar, { backgroundColor: tint(k.color, 0.15) }]}>
                    <View style={{ width: `${kp * 100}%`, height: 5, borderRadius: 3, backgroundColor: k.color }} />
                  </View>
                  <T style={{ fontSize: 12, color: t.mute }} numberOfLines={1}>
                    {`${kp >= 1 ? 'خلص ✓' : `${Math.floor(kp * 100)}%`} · بيضيف ${sum ? fmtAmount(current(k) - k.start, u.unit) : `${Math.round(add * 100)}%`} للكبير${nx && kp < 1 ? ` · ${nx.task.title}` : ''}`}
                  </T>
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <T style={{ fontSize: 13, color: t.mute, lineHeight: 20 }}>ضيف 2 أو 3 أهداف هتوصّلك له، زي «زوّد دخلي» أو «مشروع جانبي». كل واحد ليه طريقه ومراحله.</T>
      )}
      {running > FOCUS_MAX ? (
        <View style={[s.warn, { backgroundColor: t.warnSoft }]}>
          <Ionicons name="alert-circle" size={16} color={t.warn} />
          <T style={{ flex: 1, fontSize: 12.5, color: t.warn }}>{`${running} أهداف شغالة في نفس الوقت. ركّز على ${FOCUS_MAX} وأجّل الباقي لحد ما واحد يخلص`}</T>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Btn label="+ هدف جديد تحته" kind="solid" onPress={() => setAdding(true)} style={{ flex: 1 }} />
        {loose.length ? <Btn label="ضم هدف موجود" onPress={() => setLinking(true)} style={{ flex: 1 }} /> : null}
      </View>
      <Btn label={sum || !kids.length ? '+ سجّل تقدّم من بره الأهداف' : '+ سجّل تقدّم'} onPress={onLog} />
      <View style={{ height: 8 }} />
    </Screen>
  );
}

/** Put a goal that's on its own under this big goal. */
function LinkSheet({ t, u, loose, onClose }: { t: Theme; u: Goal; loose: Goal[]; onClose: () => void }) {
  return (
    <Sheet visible onClose={onClose} title="ضم هدف موجود" sub={`يبقى تحت «${u.name}»`}>
      {loose.map((g) => (
        <Pressable
          key={g.id}
          onPress={() => {
            tap();
            saveGoal({ ...g, parent: u.id });
            onClose();
          }}
          accessibilityRole="button"
          style={({ pressed }) => [s.pick, { backgroundColor: pressed ? t.soft : tint(g.color, 0.08) }]}>
          <Ionicons name={g.icon as IconName} size={18} color={g.color} />
          <T style={{ flex: 1, fontSize: 15 }} numberOfLines={1}>{g.name}</T>
          <T style={{ fontSize: 12, color: t.mute }}>{g.unit === u.unit ? 'نفس الوحدة' : g.unit || '—'}</T>
        </Pressable>
      ))}
    </Sheet>
  );
}

/** «جزء من …» at the top of a goal that sits under a big one. */
export function ParentLink({ g }: { g: Goal }) {
  const u = parentOf(readGoals(), g);
  if (!u) return null;
  return (
    <Pressable onPress={() => router.push(`/goals/${u.id}`)} accessibilityRole="button" style={({ pressed }) => [s.parent, { backgroundColor: tint(u.color, 0.1), opacity: pressed ? 0.6 : 1 }]}>
      <Ionicons name={u.icon as IconName} size={14} color={u.color} />
      <T style={{ fontSize: 12.5, color: u.color }} numberOfLines={1}>{`جزء من «${u.name}»`}</T>
      <Ionicons name="chevron-back" size={14} color={u.color} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  bar: { height: 10, borderRadius: 5, overflow: 'hidden' },
  focus: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, padding: 12 },
  card: { borderRadius: 12, overflow: 'hidden' },
  kid: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  kidIcon: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  kidBar: { height: 5, borderRadius: 3, overflow: 'hidden' },
  warn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, padding: 10 },
  pick: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, borderRadius: 12, paddingHorizontal: 12 },
  parent: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', borderRadius: 14, paddingHorizontal: 10, height: 28 },
});
