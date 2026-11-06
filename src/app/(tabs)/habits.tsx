import React, { useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Btn, Card, Ring, Screen, T } from '../../components/ui';
import { MenuButton } from '../../components/SideMenu';
import { HabitForm } from '../../components/HabitForm';
import { useDataVersion } from '../../lib/bus';
import { addDays } from '../../lib/gaps';
import { dayState, habitStats, isDue, logKey, type DayState, type Habit, type Log } from '../../lib/habits';
import { readHabitLog, readHabits, setMark } from '../../lib/habitStore';
import { dateKey } from '../../lib/logic';
import { tap } from '../../lib/timer';
import { usePop } from '../../lib/motion';
import { tint, useTheme, type Theme } from '../../theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** The habits tab: today's habits to tick (long-press = excused), each with its streak and last 7 days; tap one for its page. */
export default function Habits() {
  const t = useTheme();
  useDataVersion((s) => s.v);
  const today = dateKey();
  const habits = readHabits();
  const log = readHabitLog();
  const [adding, setAdding] = useState(false);

  const due = habits.filter((h) => isDue(h, today));
  const rest = habits.filter((h) => !isDue(h, today));
  const doneToday = due.filter((h) => log[logKey(h.id, today)] === 'done').length;
  const risky = due.filter((h) => habitStats(h, log, today).atRisk);

  return (
    <Screen title="العادات" dense action={<MenuButton />}>
      {habits.length ? (
        <>
          <Card style={{ paddingVertical: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Ring value={due.length ? doneToday / due.length : 0} size={52} stroke={5}>
              <T w="numBold" style={{ fontSize: 13, color: t.okText }}>{`${doneToday}/${due.length}`}</T>
            </Ring>
            <View style={{ flex: 1, gap: 2 }}>
              <T w="bold" style={{ fontSize: 16 }}>{!due.length ? 'مفيش عادات عليك النهارده' : doneToday === due.length ? 'كمّلت عادات النهارده ✓' : `فاضل ${due.length - doneToday} النهارده`}</T>
              <T style={{ color: t.mute, fontSize: 12 }}>دوس ✓ لما تعملها · دوسة طويلة = معذور النهارده</T>
            </View>
          </Card>

          {risky.length ? (
            <View style={[s.risk, { backgroundColor: t.warnSoft }]}>
              <Ionicons name="alert-circle" size={16} color={t.warn} />
              <T style={{ flex: 1, fontSize: 12.5, color: t.warn }}>{`امبارح فوّت ${risky.map((h) => h.name).join(' و')}. متفوّتهاش مرتين ورا بعض: النهارده مهم`}</T>
            </View>
          ) : null}

          {due.map((h) => (
            <HabitRow key={h.id} h={h} log={log} today={today} t={t} />
          ))}
          {rest.length ? (
            <>
              <T w="medium" style={{ color: t.mute, fontSize: 13, marginTop: 4 }}>مش عليك النهارده</T>
              {rest.map((h) => (
                <HabitRow key={h.id} h={h} log={log} today={today} t={t} dim />
              ))}
            </>
          ) : null}
          <Btn label="+ عادة جديدة" onPress={() => setAdding(true)} style={{ marginTop: 4 }} />
        </>
      ) : (
        <View style={s.empty}>
          <View style={[s.emptyIcon, { backgroundColor: t.okSoft }]}>
            <Ionicons name="checkmark-done" size={40} color={t.okText} />
          </View>
          <T w="bold" style={{ fontSize: 18, textAlign: 'center' }}>ابدأ أول عادة</T>
          <T style={{ color: t.mute, fontSize: 13.5, textAlign: 'center', lineHeight: 22 }}>
            اكتب أي حاجة عايز تواظب عليها، وعلّم عليها كل يوم. العادة بتتبني في حوالي 66 يوم، وفوات يوم واحد مش بيبوّظها.
          </T>
          <Btn label="+ عادة جديدة" kind="solid" onPress={() => setAdding(true)} style={{ alignSelf: 'stretch' }} />
        </View>
      )}
      {adding ? <HabitForm visible habit={null} onClose={() => setAdding(false)} /> : null}
    </Screen>
  );
}

const DOT: Record<DayState, (t: Theme, c: string) => object> = {
  done: (_t, c) => ({ backgroundColor: c }),
  skip: (_t, c) => ({ borderWidth: 1.5, borderColor: c, borderStyle: 'dashed' }),
  missed: (t) => ({ backgroundColor: tint(t.bad, 0.35) }),
  today: (t) => ({ borderWidth: 1.5, borderColor: t.fg }),
  off: (t) => ({ backgroundColor: t.soft }),
  before: (t) => ({ backgroundColor: t.soft, opacity: 0.4 }),
  future: (t) => ({ backgroundColor: t.soft }),
};

function HabitRow({ h, log, today, t, dim }: { h: Habit; log: Log; today: string; t: Theme; dim?: boolean }) {
  const st = habitStats(h, log, today);
  const mark = log[logKey(h.id, today)];
  const on = mark === 'done';
  const pop = usePop(on, 0.8);
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const toggle = () => {
    tap();
    setMark(h.id, today, on ? undefined : 'done');
  };
  const excuse = () => {
    tap();
    setMark(h.id, today, mark === 'skip' ? undefined : 'skip');
  };
  return (
    <Pressable onPress={() => router.push({ pathname: '/habit/[id]', params: { id: h.id } })} accessibilityRole="button" accessibilityLabel={`${h.name}، افتح النتايج`} style={({ pressed }) => ({ opacity: pressed ? 0.85 : dim ? 0.75 : 1 })}>
      <Card style={[s.row, on ? { borderWidth: 1, borderColor: tint(h.color, 0.5) } : null]}>
        <View style={[s.icon, { backgroundColor: tint(h.color, 0.15) }]}>
          <Ionicons name={h.icon as IconName} size={20} color={h.color} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <T w="semi" style={{ fontSize: 15 }} numberOfLines={1}>{h.name}</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {st.streak ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                <Ionicons name="flame" size={13} color="#E8590C" />
                <T w="numBold" style={{ fontSize: 12 }}>{st.streak}</T>
              </View>
            ) : null}
            {/* Last 7 days, oldest first (in RTL: right → left, like the text). */}
            <View style={{ flexDirection: 'row', gap: 3 }}>
              {week.map((d) => (
                <View key={d} style={[s.dot, DOT[dayState(h, log, d, today)](t, h.color)]} />
              ))}
            </View>
            {st.rate30 != null ? <T w="num" style={{ fontSize: 11.5, color: t.mute }}>{`${Math.round(st.rate30 * 100)}%`}</T> : null}
          </View>
        </View>
        {mark === 'skip' ? (
          <Pressable onPress={excuse} onLongPress={excuse} hitSlop={4} accessibilityRole="button" accessibilityLabel={`${h.name}: معذور النهارده، دوس ترجعها`} style={[s.check, { borderWidth: 1.5, borderStyle: 'dashed', borderColor: h.color }]}>
            <T w="semi" style={{ fontSize: 10.5, color: h.color }}>معذور</T>
          </Pressable>
        ) : (
          <Pressable onPress={toggle} onLongPress={excuse} delayLongPress={450} hitSlop={4} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`عملت ${h.name}`} accessibilityHint="دوسة طويلة: معذور النهارده">
            <Animated.View style={[s.check, { transform: [{ scale: pop }] }, on ? { backgroundColor: h.color, boxShadow: `0px 4px 12px ${tint(h.color, 0.45)}` } : { backgroundColor: t.soft }]}>
              <Ionicons name="checkmark" size={24} color={on ? '#FFFFFF' : t.mute} />
            </Animated.View>
          </Pressable>
        )}
      </Card>
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12 },
  icon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 9, height: 9, borderRadius: 3 },
  check: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  risk: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12 },
  empty: { alignItems: 'center', gap: 12, paddingTop: 60, paddingHorizontal: 12 },
  emptyIcon: { width: 84, height: 84, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
});
