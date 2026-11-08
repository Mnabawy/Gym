import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Card, Label, Ring, Screen, T } from '../components/ui';
import { dayFor, MONTHS_AR, WEEKDAYS_AR } from '../data/program';
import { useDataVersion } from '../lib/bus';
import { CAL_SOURCES, daysIn, goalMarks, gymMarks, habitMarks, monthSummary, quitMarks, type CalSource, type DayMark, type Marks } from '../lib/calendar';
import { readGoals } from '../lib/goalStore';
import { readHabitLog, readHabitParts, readHabits } from '../lib/habitStore';
import { dateKey, weekdayOf } from '../lib/logic';
import { readQuits } from '../lib/quitStore';
import { storage } from '../lib/storage';
import { addMonths, monthGrid, WEEK_START } from '../lib/tasks';
import { tap } from '../lib/timer';
import { font, tint, useTheme } from '../theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
const SHORT = ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'];
const HEAD = Array.from({ length: 7 }, (_, i) => SHORT[(WEEK_START + i) % 7]);
const SRC_KEY = 'calendar.source';

/**
 * التقويم: one calendar for the whole app. Pick what it shows (الجيم / العادات / الأهداف / بطّل, remembered), and for
 * habits, goals and quitting one of them or all; every day gets a mark for how it went (filled = done, a ring = part
 * of it, outlined = planned, red = missed or slipped, green = clean). Tap a day for what happened; the month's line
 * sums it up. `?source=` opens on one.
 */
export default function CalendarScreen() {
  const t = useTheme();
  useDataVersion((s) => s.v);
  const params = useLocalSearchParams<{ source?: string }>();
  const today = dateKey();
  const [src, setSrc] = useState<CalSource>(() => {
    const p = params.source ?? storage.getMeta(SRC_KEY);
    return CAL_SOURCES.some((x) => x.key === p) ? (p as CalSource) : 'gym';
  });
  const [only, setOnly] = useState<string | undefined>(undefined);
  const [ym, setYm] = useState(today.slice(0, 7));
  const [day, setDay] = useState(today);

  const weeks = monthGrid(ym);
  const days = daysIn(`${ym}-01`, weeks.flat().filter(Boolean).pop() as string);
  const color = src === 'gym' ? t.sec.gym : src === 'habits' ? t.sec.habits : src === 'goals' ? t.sec.goals : t.sec.quit;

  // What can be picked inside the source (one habit / goal / quit, or all).
  const items: { id: string; name: string }[] =
    src === 'habits' ? readHabits().map((h) => ({ id: h.id, name: h.name })) : src === 'goals' ? readGoals().map((g) => ({ id: g.id, name: g.name })) : src === 'quit' ? readQuits().map((q) => ({ id: q.id, name: q.name })) : [];
  const pick = only && items.some((x) => x.id === only) ? only : undefined;

  let marks: Marks = {};
  if (src === 'gym') marks = gymMarks(storage.trainedDays(), (w) => dayFor(w)?.titleAr ?? '');
  else if (src === 'habits') marks = habitMarks(readHabits(), readHabitLog(), readHabitParts(), days, today, pick);
  else if (src === 'goals') marks = goalMarks(readGoals(), today, pick);
  else marks = quitMarks(readQuits(), days, today, pick);

  const choose = (k: CalSource) => {
    if (k === src) return;
    tap();
    storage.setMeta(SRC_KEY, k);
    setSrc(k);
    setOnly(undefined);
  };
  const sel = marks[day];
  const empty = src === 'habits' ? 'مفيش عادات لسه' : src === 'goals' ? 'مفيش أهداف لسه' : src === 'quit' ? 'مفيش حاجة بتبطّلها لسه' : '';

  return (
    <Screen title="التقويم" sub={monthSummary(src, marks, days, today)} onBack={() => (router.canGoBack() ? router.back() : router.replace('/sections'))}>
      {/* What the calendar shows. */}
      <View style={[s.seg, { backgroundColor: t.soft }]} accessibilityRole="tablist">
        {CAL_SOURCES.map((x) => {
          const on = x.key === src;
          return (
            <Pressable key={x.key} onPress={() => choose(x.key)} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={x.label} style={[s.segBtn, on ? { backgroundColor: t.card, boxShadow: '0px 1px 3px rgba(0,0,0,0.12)' } : null]}>
              <Ionicons name={x.icon as IconName} size={15} color={on ? t.fg : t.mute} />
              <T w={on ? 'semi' : 'medium'} numberOfLines={1} style={{ fontSize: 13, color: on ? t.fg : t.mute }}>{x.label}</T>
            </Pressable>
          );
        })}
      </View>

      {items.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
          {[{ id: '', name: 'الكل' }, ...items].map((x) => {
            const on = (pick ?? '') === x.id;
            return (
              <Pressable key={x.id || 'all'} onPress={() => { tap(); setOnly(x.id || undefined); }} accessibilityRole="button" accessibilityState={{ selected: on }} style={[s.chip, { backgroundColor: on ? color : t.card }]}>
                <T w="medium" numberOfLines={1} style={{ fontSize: 13, color: on ? '#FFFFFF' : t.fg }}>{x.name}</T>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      <Card style={{ padding: 10, gap: 6 }}>
        <View style={s.head}>
          <Pressable onPress={() => setYm(addMonths(ym, -1))} hitSlop={8} accessibilityRole="button" accessibilityLabel="الشهر اللي فات" style={s.arrow}>
            <Ionicons name="chevron-forward" size={20} color={t.ok} />
          </Pressable>
          <T w="bold" style={{ flex: 1, textAlign: 'center', fontSize: 16 }}>{`${MONTHS_AR[+ym.slice(5) - 1]} ${ym.slice(0, 4)}`}</T>
          {ym !== today.slice(0, 7) ? (
            <Pressable onPress={() => { setYm(today.slice(0, 7)); setDay(today); }} hitSlop={6} accessibilityRole="button" style={[s.now, { backgroundColor: t.soft }]}>
              <T w="semi" style={{ fontSize: 12, color: t.okText }}>النهارده</T>
            </Pressable>
          ) : null}
          <Pressable onPress={() => setYm(addMonths(ym, 1))} hitSlop={8} accessibilityRole="button" accessibilityLabel="الشهر الجاي" style={s.arrow}>
            <Ionicons name="chevron-back" size={20} color={t.ok} />
          </Pressable>
        </View>
        <View style={s.row}>
          {HEAD.map((d) => (
            <View key={d} style={s.cell}>
              <T style={{ fontSize: 12, color: t.mute }}>{d}</T>
            </View>
          ))}
        </View>
        <Animated.View key={`${src}-${pick ?? ''}-${ym}`} entering={FadeIn.duration(200)} style={{ gap: 4 }}>
          {weeks.map((w, i) => (
            <View key={i} style={s.row}>
              {w.map((d, j) => (d ? <Day key={d} d={d} m={marks[d]} color={color} today={today} on={d === day} onPress={() => { tap(); setDay(d); }} /> : <View key={j} style={s.cell} />))}
            </View>
          ))}
        </Animated.View>
        <Legend color={color} src={src} />
      </Card>

      <Label>{`${WEEKDAYS_AR[weekdayOf(day)]} ${+day.slice(8)} ${MONTHS_AR[+day.slice(5, 7) - 1]}`}</Label>
      <Card style={{ paddingVertical: 6 }}>
        {!items.length && src !== 'gym' ? (
          <T style={s.line}>{empty}</T>
        ) : sel?.lines.length ? (
          sel.lines.map((l, i) => (
            <T key={i} style={[s.line, i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line } : null]}>{l}</T>
          ))
        ) : (
          <T style={[s.line, { color: t.mute }]}>{day > today ? 'مفيش حاجة متخططة لليوم ده' : 'مفيش حاجة في اليوم ده'}</T>
        )}
      </Card>
    </Screen>
  );
}

/** One day: its number on a mark (filled done, a ring for part, outlined planned, red missed/slipped, green clean). */
function Day({ d, m, color, today, on, onPress }: { d: string; m?: DayMark; color: string; today: string; on: boolean; onPress: () => void }) {
  const t = useTheme();
  const n = String(+d.slice(8));
  const bad = t.bad;
  const green = t.green;
  const bg = !m ? 'transparent' : m.tone === 'done' ? color : m.tone === 'bad' ? tint(bad, 0.14) : m.tone === 'clean' ? tint(green, 0.18) : m.tone === 'part' ? tint(color, 0.12) : 'transparent';
  const fg = m?.tone === 'done' ? '#FFFFFF' : m?.tone === 'bad' ? bad : d > today ? t.mute : t.fg;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${n} ${MONTHS_AR[+d.slice(5, 7) - 1]}${m?.lines.length ? `، ${m.lines.join('، ')}` : ''}`} style={s.cell}>
      <View style={[s.dayWrap, on ? { borderColor: t.fg } : d === today ? { borderColor: tint(t.fg, 0.35) } : null]}>
        {m?.tone === 'part' ? (
          <Ring value={m.v} size={34} stroke={3} color={color} track={tint(color, 0.15)} animated={false}>
            <T style={{ fontSize: 13.5, color: fg, ...font(d === today ? 'numBold' : 'num') }}>{n}</T>
          </Ring>
        ) : (
          <View style={[s.dot, { backgroundColor: bg }, m?.tone === 'plan' ? { borderWidth: 1.5, borderColor: color, borderStyle: 'dashed' } : null]}>
            <T style={{ fontSize: 13.5, color: fg, ...font(d === today || m?.tone === 'done' ? 'numBold' : 'num') }}>{n}</T>
          </View>
        )}
      </View>
    </Pressable>
  );
}

function Legend({ color, src }: { color: string; src: CalSource }) {
  const t = useTheme();
  const items: [string, React.ReactNode][] =
    src === 'gym'
      ? [['اتمرنت', <View key="a" style={[s.key, { backgroundColor: color }]} />]]
      : src === 'quit'
        ? [['نضيف', <View key="a" style={[s.key, { backgroundColor: tint(t.green, 0.35) }]} />], ['وقعت', <View key="b" style={[s.key, { backgroundColor: tint(t.bad, 0.3) }]} />]]
        : src === 'goals'
          ? [['اتعمل', <View key="a" style={[s.key, { backgroundColor: color }]} />], ['متخطط', <View key="b" style={[s.key, { borderWidth: 1.5, borderColor: color, borderStyle: 'dashed' }]} />], ['اتأخر', <View key="c" style={[s.key, { backgroundColor: tint(t.bad, 0.3) }]} />]]
          : [['كله', <View key="a" style={[s.key, { backgroundColor: color }]} />], ['جزء', <View key="b" style={[s.key, { borderWidth: 2, borderColor: color }]} />], ['فاتت', <View key="c" style={[s.key, { backgroundColor: tint(t.bad, 0.3) }]} />]];
  return (
    <View style={s.legend}>
      {items.map(([l, k]) => (
        <View key={l} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {k}
          <T style={{ fontSize: 11.5, color: t.mute }}>{l}</T>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  seg: { flexDirection: 'row', borderRadius: 9, padding: 2, gap: 2 },
  segBtn: { flex: 1, minHeight: 34, borderRadius: 7, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  chip: { height: 32, borderRadius: 16, paddingHorizontal: 12, justifyContent: 'center', maxWidth: 180 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  arrow: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  now: { borderRadius: 12, paddingHorizontal: 10, height: 26, justifyContent: 'center' },
  row: { flexDirection: 'row' },
  cell: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 40 },
  dayWrap: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  dot: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  legend: { flexDirection: 'row', justifyContent: 'center', gap: 14, paddingTop: 4 },
  key: { width: 12, height: 12, borderRadius: 6 },
  line: { fontSize: 14, lineHeight: 21, paddingHorizontal: 14, paddingVertical: 8 },
});
