import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Card, Label, Ring, Screen, T } from '../components/ui';
import { dayFor, dayTitle, MONTHS_AR, WEEKDAYS_AR } from '../data/program';
import { useDataVersion } from '../lib/bus';
import { CAL_SOURCES, daysIn, quitLabel, goalMarks, goalSpans, weekPieces, type Span, gymMarks, habitMarks, monthSummary, quitMarks, type CalSource, type DayMark, type Marks } from '../lib/calendar';
import { readGoals } from '../lib/goalStore';
import { readHabitLog, readHabitParts, readHabits } from '../lib/habitStore';
import { dateKey, weekdayOf } from '../lib/logic';
import { readQuits } from '../lib/quitStore';
import { storage } from '../lib/storage';
import { addMonths, monthGrid, WEEK_START } from '../lib/tasks';
import { addDays } from '../lib/gaps';
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
    src === 'habits' ? readHabits().map((h) => ({ id: h.id, name: h.name })) : src === 'goals' ? readGoals().filter((g) => !g.later).map((g) => ({ id: g.id, name: g.name })) : src === 'quit' ? readQuits().map((q, i) => ({ id: q.id, name: quitLabel(q, i) })) : [];
  const pick = only && items.some((x) => x.id === only) ? only : undefined;

  let marks: Marks = {};
  if (src === 'gym') marks = gymMarks(storage.trainedDays(), dayTitle);
  else if (src === 'habits') marks = habitMarks(readHabits(), readHabitLog(), readHabitParts(), days, today, pick);
  else if (src === 'goals') marks = goalMarks(readGoals().filter((g) => !g.later), today, pick);
  else marks = quitMarks(readQuits(), days, today, pick);

  // Goals: each step's time as a bar across the days it runs (one color per step, one lane per goal).
  const spans: Span[] = src === 'goals' ? goalSpans(readGoals().filter((g) => !g.later), pick) : [];
  const lanes = spans.reduce((a, x) => Math.max(a, x.lane + 1), 0);
  const monthSpans = spans.filter((x) => x.to >= days[0] && x.from <= days[days.length - 1]);
  const daySpans = spans.filter((x) => x.from <= day && x.to >= day);

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
      <View style={[s.seg, { backgroundColor: t.segBar }]} accessibilityRole="tablist">
        {CAL_SOURCES.map((x) => {
          const on = x.key === src;
          return (
            <Pressable key={x.key} onPress={() => choose(x.key)} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={x.label} style={[s.segBtn, on ? { backgroundColor: t.segOn, boxShadow: '0px 1px 3px rgba(0,0,0,0.12)' } : null]}>
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
            <View key={i}>
              <View style={s.row}>
                {w.map((d, j) => (d ? <Day key={d} d={d} m={src === 'goals' && marks[d]?.tone !== 'done' ? undefined : marks[d]} color={color} today={today} on={d === day} onPress={() => { tap(); setDay(d); }} /> : <View key={j} style={s.cell} />))}
              </View>
              {lanes ? <WeekBars week={weekDates(w)} spans={spans} lanes={lanes} today={today} /> : null}
            </View>
          ))}
        </Animated.View>
        {src !== 'goals' ? <Legend color={color} src={src} /> : null}
      </Card>

      {src === 'goals' && monthSpans.length ? (
        <>
          <Label>الخطوات في الشهر ده</Label>
          <Card style={{ paddingVertical: 4 }}>
            {monthSpans.map((x, i) => (
              <StepRow key={`${x.goal}-${x.id}`} x={x} today={today} sep={i > 0} />
            ))}
          </Card>
        </>
      ) : src === 'goals' && items.length && !spans.length ? (
        <T style={{ fontSize: 12.5, color: t.mute, paddingHorizontal: 16 }}>حدّد مدة للهدف (من «عدّل الهدف») عشان خطواته تتوزع وتظهر هنا</T>
      ) : null}

      <Label>{`${WEEKDAYS_AR[weekdayOf(day)]} ${+day.slice(8)} ${MONTHS_AR[+day.slice(5, 7) - 1]}`}</Label>
      <Card style={{ paddingVertical: 6 }}>
        {!items.length && src !== 'gym' ? (
          <T style={s.line}>{empty}</T>
        ) : src === 'goals' && daySpans.length ? (
          daySpans.map((x, i) => <StepRow key={`${x.goal}-${x.id}`} x={x} today={today} sep={i > 0} />)
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

/** The 7 dates of a calendar row (its empty cells are the days of the months around it). */
function weekDates(w: (string | null)[]): string[] {
  const k = w.findIndex(Boolean);
  const d0 = w[k] as string;
  return w.map((_, j) => addDays(d0, j - k));
}

/**
 * The steps under a week: one thin row per lane (goal), each step a bar in its color across the days it runs. The
 * bars sit in the same right-to-left row of 7 as the days above, so they line up on both phones and the web.
 */
function WeekBars({ week, spans, lanes, today }: { week: string[]; spans: Span[]; lanes: number; today: string }) {
  const pieces = weekPieces(spans, week);
  return (
    <View style={{ gap: 2, marginBottom: 4 }}>
      {Array.from({ length: lanes }, (_, l) => {
        const mine = pieces.filter((p) => p.lane === l).sort((a, b) => a.c0 - b.c0);
        const row: React.ReactNode[] = [];
        let c = 0;
        for (const p of mine) {
          if (p.c0 < c) continue;
          if (p.c0 > c) row.push(<View key={`gap${c}`} style={{ flex: p.c0 - c }} />);
          const startsHere = p.span.from >= week[0];
          const endsHere = p.span.to <= week[6];
          const late = !p.span.done && p.span.to < today;
          row.push(
            <View key={p.span.id} style={{ flex: p.c1 - p.c0 + 1, paddingStart: startsHere ? 2 : 0, paddingEnd: endsHere ? 2 : 0 }}>
              <View style={[s.bar, { backgroundColor: p.span.color, opacity: p.span.done ? 0.45 : 1, borderTopStartRadius: startsHere ? 5 : 0, borderBottomStartRadius: startsHere ? 5 : 0, borderTopEndRadius: endsHere ? 5 : 0, borderBottomEndRadius: endsHere ? 5 : 0 }, late ? { borderWidth: 1.5, borderColor: '#FF3B30' } : null]}>
                {startsHere ? <T numberOfLines={1} style={{ alignSelf: 'flex-start', fontSize: 9, lineHeight: 12, color: '#FFFFFF', ...font('numBold') }}>{p.span.done ? `✓${p.span.n}` : String(p.span.n)}</T> : null}
              </View>
            </View>,
          );
          c = p.c1 + 1;
        }
        if (c < 7) row.push(<View key="end" style={{ flex: 7 - c }} />);
        return (
          <View key={l} style={{ flexDirection: 'row', height: 14 }}>
            {row}
          </View>
        );
      })}
    </View>
  );
}

const shortDay = (d: string) => `${+d.slice(8)} ${MONTHS_AR[+d.slice(5, 7) - 1]}`;

/** A step in the list under the calendar: its color and number, title, its days, and how it stands. */
function StepRow({ x, today, sep }: { x: Span; today: string; sep: boolean }) {
  const t = useTheme();
  const status = x.done ? 'خلصت ✓' : x.to < today ? 'متأخرة' : x.from <= today ? 'دلوقتي' : '';
  return (
    <View style={[s.step, sep ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line } : null]}>
      <View style={[s.stepNum, { backgroundColor: x.color, opacity: x.done ? 0.5 : 1 }]}>
        <T style={{ fontSize: 11, color: '#FFFFFF', ...font('numBold') }}>{String(x.n)}</T>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <T numberOfLines={1} style={{ fontSize: 14, color: x.done ? t.mute : t.fg, textDecorationLine: x.done ? 'line-through' : 'none' }}>{x.title}</T>
        <T style={{ fontSize: 12, color: t.mute }}>{`${shortDay(x.from)} ← ${shortDay(x.to)}`}</T>
      </View>
      {status ? <T w="semi" style={{ fontSize: 12, color: status === 'متأخرة' ? t.bad : status === 'دلوقتي' ? t.okText : t.mute }}>{status}</T> : null}
    </View>
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
  bar: { flex: 1, height: 13, justifyContent: 'center', paddingHorizontal: 4 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 8 },
  stepNum: { width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  line: { fontSize: 14, lineHeight: 21, paddingHorizontal: 14, paddingVertical: 8 },
});
