import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Btn, Card, Screen, T } from '../../components/ui';
import { MenuButton } from '../../components/SideMenu';
import { GoalForm } from '../../components/GoalForm';
import { useDataVersion } from '../../lib/bus';
import { readGoals } from '../../lib/goalStore';
import { current, fmtAmount, IDLE_DAYS, idleDays, nextTask, progress, reviewDue } from '../../lib/goals';
import { dateKey } from '../../lib/logic';
import { tint, useTheme } from '../../theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** The goals section: each goal with how far you are and the next step; tap one for its page. */
export default function Goals() {
  const t = useTheme();
  useDataVersion((s) => s.v);
  const today = dateKey();
  const goals = readGoals();
  const [adding, setAdding] = useState(false);

  return (
    <Screen title="الأهداف" action={<MenuButton />}>
      {adding ? <GoalForm onClose={() => setAdding(false)} onSaved={(g) => router.push(`/goals/${g.id}`)} /> : null}
      {!goals.length ? (
        <Card style={{ padding: 20, gap: 12, alignItems: 'center' }}>
          <View style={[s.big, { backgroundColor: tint('#009E73', 0.15) }]}>
            <Ionicons name="flag" size={38} color="#009E73" />
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
              <Pressable key={g.id} onPress={() => router.push(`/goals/${g.id}`)} accessibilityRole="button" accessibilityLabel={`${g.name}: ${Math.floor(p * 100)}%`} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
                <Card style={{ padding: 14, gap: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={[s.icon, { backgroundColor: g.color }]}>
                      <Ionicons name={g.icon as IconName} size={22} color="#FFFFFF" />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <T w="bold" style={{ fontSize: 16.5 }} numberOfLines={1}>{g.name}</T>
                      <T style={{ fontSize: 12.5, color: t.mute }}>{`${fmtAmount(current(g), g.unit)} من ${fmtAmount(g.target, g.unit)}`}</T>
                    </View>
                    <T w="numBold" style={{ fontSize: 22, color: g.color }}>{`${Math.floor(p * 100)}%`}</T>
                  </View>
                  <View style={[s.bar, { backgroundColor: tint(g.color, 0.15) }]}>
                    <View style={{ width: `${p * 100}%`, height: '100%', borderRadius: 4, backgroundColor: g.color }} />
                  </View>
                  {next ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="arrow-back-circle-outline" size={16} color={t.okText} />
                      <T style={{ flex: 1, fontSize: 13 }} numberOfLines={1}>{`الخطوة الجاية: ${next.task.title}`}</T>
                    </View>
                  ) : null}
                  {idle >= IDLE_DAYS || reviewDue(g, today) ? (
                    <View style={[s.nudge, { backgroundColor: t.warnSoft }]}>
                      <Ionicons name="alert-circle" size={15} color={t.warn} />
                      <T style={{ flex: 1, fontSize: 12, color: t.warn }}>{idle >= IDLE_DAYS ? `بقالك ${idle} يوم من غير حركة` : 'مراجعة الأسبوع مستنياك'}</T>
                    </View>
                  ) : null}
                </Card>
              </Pressable>
            );
          })}
          <Btn label="+ هدف جديد" onPress={() => setAdding(true)} />
        </>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  big: { width: 76, height: 76, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  icon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  bar: { height: 8, borderRadius: 4, overflow: 'hidden' },
  nudge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
});
