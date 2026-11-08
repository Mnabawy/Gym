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
import { current, fmtAmount, IDLE_DAYS, idleDays, nextTask, progress, reviewDue, type Goal } from '../../lib/goals';
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
    if (await confirm({ title: 'تمسح الهدف ده؟', body: 'هيتشال هو وكل اللي اتسجل فيه.', confirmLabel: 'امسح', danger: true })) deleteGoal(g.id);
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
          {goals.map((g) => {
            const p = progress(g);
            const next = nextTask(g);
            const idle = idleDays(g, today);
            return (
              <Item key={g.id}><Swipe
                style={s.swipe}
                start={[{ icon: 'add-circle-outline', label: 'سجّل', color: ACTION.green, onPress: () => setLogging(g) }]}
                end={[
                  { icon: 'trash', label: 'امسح', color: ACTION.red, onPress: () => void remove(g) },
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
              </Pressable></Swipe></Item>
            );
          })}
          <Btn label="+ هدف جديد" onPress={() => setAdding(true)} />
        </>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  big: { width: 76, height: 76, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  swipe: { borderRadius: 12, overflow: 'hidden' },
  tile: { padding: 10, borderRadius: 12, borderWidth: 1, gap: 6 },
  icon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  next: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  nudge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
});
