import React, { useState } from 'react';
import { LayoutAnimation, Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { MONTHS_AR, WEEKDAY_LETTERS_AR, WEEKDAYS_AR } from '../../data/program';
import { Btn, Card, Label, Progress, Screen, T } from '../../components/ui';
import { HabitForm } from '../../components/HabitForm';
import { useDataVersion } from '../../lib/bus';
import { addDays, weekStart } from '../../lib/gaps';
import { ALL_DAYS, dayState, FORM_DAYS, habitStats, logKey, nextMark, type DayState, type Habit, type Log } from '../../lib/habits';
import { deleteHabit, readHabitLog, readHabits, setMark } from '../../lib/habitStore';
import { addMonths, dateKey, monthCells } from '../../lib/logic';
import { tap } from '../../lib/timer';
import { tint, useTheme, type Theme } from '../../theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
const HEAD = [6, 0, 1, 2, 3, 4, 5].map((wd) => WEEKDAY_LETTERS_AR[wd]);
const monthNum = (y: number, m: number) => y * 12 + m;
const timeAr = (m: number) => `${Math.floor(m / 60) % 12 || 12}:${String(m % 60).padStart(2, '0')} ${m < 720 ? 'ص' : 'م'}`;
const daysAr = (days: number[]) => (days.length === 7 ? 'كل يوم' : [6, 0, 1, 2, 3, 4, 5].filter((d) => days.includes(d)).map((d) => WEEKDAYS_AR[d]).join('، '));
const pct = (v: number | null) => (v == null ? '–' : `${Math.round(v * 100)}%`);
/** Weeks shown in the "last months" heatmap. */
const HEAT_WEEKS = 26;

/** One habit's results: streaks, rates, the way to 66 days, a month calendar you can tap to fix, 6 months at a glance, weekdays. */
export default function HabitScreen() {
  const t = useTheme();
  useDataVersion((s) => s.v);
  const { id } = useLocalSearchParams<{ id: string }>();
  const h = readHabits().find((x) => x.id === id);
  const log = readHabitLog();
  const today = dateKey();
  const now = new Date();
  const [view, setView] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);

  if (!h) {
    return (
      <Screen title="العادة" onBack={() => router.back()}>
        <T style={{ color: t.mute }}>العادة دي مش موجودة.</T>
      </Screen>
    );
  }
  const st = habitStats(h, log, today);
  const first = { y: +h.start.slice(0, 4), m: +h.start.slice(5, 7) - 1 };
  const canPrev = monthNum(view.y, view.m) > monthNum(first.y, first.m);
  const canNext = monthNum(view.y, view.m) < monthNum(now.getFullYear(), now.getMonth());
  const go = (d: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.create(160, 'easeInEaseOut', 'opacity'));
    setView(addMonths(view.y, view.m, d));
  };

  const cells = monthCells(view.y, view.m);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const states = new Map(cells.filter((k): k is string => !!k).map((k) => [k, dayState(h, log, k, today)]));
  const mDone = [...states.values()].filter((s) => s === 'done').length;
  const mDue = mDone + [...states.values()].filter((s) => s === 'missed').length;

  const tapDay = (k: string) => {
    const s = states.get(k);
    if (!s || s === 'future' || s === 'before') return;
    tap();
    setMark(h.id, k, nextMark(log[logKey(h.id, k)]));
  };

  const weekdays = ALL_DAYS.map((wd) => ({ wd, v: st.byWeekday[wd] })).filter((x) => x.v != null) as { wd: number; v: number }[];
  const weakest = weekdays.length > 1 ? weekdays.reduce((a, b) => (b.v < a.v ? b : a)) : null;

  return (
    <Screen title={h.name} sub={`${daysAr(h.days)}${h.remind != null ? ` · تذكير ${timeAr(h.remind)}` : ''}`} onBack={() => router.back()}>
      {/* Hero: icon, streak and best */}
      <Card style={[s.hero, { backgroundColor: tint(h.color, 0.1), borderWidth: 1, borderColor: tint(h.color, 0.3) }]}>
        <View style={[s.bigIcon, { backgroundColor: h.color, boxShadow: `0px 8px 24px ${tint(h.color, 0.45)}` }]}>
          <Ionicons name={h.icon as IconName} size={30} color="#FFFFFF" />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
          <Ionicons name="flame" size={26} color="#E8590C" style={{ marginBottom: 6 }} />
          <T w="numBold" style={{ fontSize: 44, lineHeight: 52 }}>{st.streak}</T>
          <T style={{ fontSize: 14, color: t.mute, marginBottom: 10 }}>السلسلة</T>
        </View>
        <T style={{ color: t.mute, fontSize: 12 }}>المرات اللي عملتها من غير ما تفوّت يومين ورا بعض</T>
        {st.atRisk ? <T style={{ color: t.warn, fontSize: 13 }}>امبارح فوّتها. متفوّتهاش مرتين: اعملها النهارده</T> : null}
        <View style={s.tiles}>
          <Tile t={t} v={String(st.best)} l="أحسن سلسلة" />
          <Tile t={t} v={pct(st.rate30)} l="آخر 30 يوم" />
          <Tile t={t} v={pct(st.rateAll)} l="من البداية" />
          <Tile t={t} v={String(st.done)} l="مرة" />
        </View>
      </Card>

      {/* The way to 66 days */}
      <Card style={{ padding: 14, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          <T w="bold" style={{ flex: 1, fontSize: 15 }}>{st.formed >= FORM_DAYS ? 'العادة اتبنت ✓' : 'العادة بتتبني'}</T>
          <T w="numBold" style={{ fontSize: 14, color: h.color }}>{`${st.formed} / ${FORM_DAYS}`}</T>
        </View>
        <Progress value={st.formed / FORM_DAYS} color={h.color} height={10} />
        <T style={{ color: t.mute, fontSize: 12, lineHeight: 18 }}>في المتوسط العادة بتبقى تلقائية بعد حوالي 66 مرة. فوات يوم مش بيبوّظها، المهم ما تفوّتهاش يومين ورا بعض.</T>
      </Card>

      {/* Month calendar: done days in the habit's color, joined into runs; tap a day to fix it */}
      <Card style={{ padding: 14, gap: 12 }}>
        <View style={s.nav}>
          <NavBtn t={t} icon="chevron-forward" label="الشهر اللي فات" disabled={!canPrev} onPress={() => go(-1)} />
          <View style={{ flex: 1, alignItems: 'center' }}>
            <T w="bold" style={{ fontSize: 17 }}>{`${MONTHS_AR[view.m]} ${view.y}`}</T>
            <T style={{ fontSize: 12, color: t.mute }}>{mDue ? `${mDone} من ${mDue} · ${Math.round((mDone / mDue) * 100)}%` : 'لسه مفيش أيام'}</T>
          </View>
          <NavBtn t={t} icon="chevron-back" label="الشهر الجاي" disabled={!canNext} onPress={() => go(1)} />
        </View>
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row' }}>
            {HEAD.map((x) => (
              <T key={x} w="medium" style={{ flex: 1, textAlign: 'center', color: t.mute, fontSize: 12.5 }}>{x}</T>
            ))}
          </View>
          {weeks.map((w, wi) => (
            <View key={wi} style={{ flexDirection: 'row' }}>
              {w.map((k, i) => {
                if (!k) return <View key={i} style={s.cell} />;
                const st2 = states.get(k)!;
                const done = st2 === 'done';
                const prevDone = i > 0 && w[i - 1] != null && states.get(w[i - 1]!) === 'done';
                const nextDone = i < 6 && w[i + 1] != null && states.get(w[i + 1]!) === 'done';
                return (
                  <Pressable key={i} onPress={() => tapDay(k)} accessibilityRole="button" accessibilityLabel={`${+k.slice(8)} ${MONTHS_AR[view.m]}: ${STATE_AR[st2]}`} style={s.cell}>
                    {/* Runs: a band joins a done day to its done neighbours in the same week. The two halves sit in a row,
                        so they follow the week's own direction (the previous day's side first). */}
                    {done && (prevDone || nextDone) ? (
                      <View style={s.bands} pointerEvents="none">
                        <View style={[s.half, prevDone ? { backgroundColor: tint(h.color, 0.35) } : null]} />
                        <View style={[s.half, nextDone ? { backgroundColor: tint(h.color, 0.35) } : null]} />
                      </View>
                    ) : null}
                    <View style={[s.day, dayLook(st2, h.color, t), k === today ? { borderWidth: 2, borderColor: done ? t.fg : h.color } : null]}>
                      {st2 === 'skip' ? (
                        <Ionicons name="remove" size={14} color={h.color} />
                      ) : (
                        <T w={done ? 'numBold' : 'num'} style={{ fontSize: 13.5, color: numColor(st2, t) }}>{String(+k.slice(8))}</T>
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
        <View style={s.legend}>
          <Legend t={t} label="عملتها" style={{ backgroundColor: h.color }} />
          <Legend t={t} label="فوّتها" style={{ backgroundColor: tint(t.bad, 0.18) }} />
          <Legend t={t} label="معذور" style={{ borderWidth: 1.5, borderStyle: 'dashed', borderColor: h.color }} />
          <Legend t={t} label="مش عليك" style={{ backgroundColor: t.soft }} />
        </View>
        <T style={{ color: t.mute, fontSize: 12, textAlign: 'center' }}>دوس على أي يوم عشان تعدّله: عملتها ← معذور ← فاضي</T>
      </Card>

      {/* Six months at a glance */}
      <Label>آخر 6 شهور</Label>
      <Card style={{ padding: 12 }}>
        <Heatmap h={h} log={log} today={today} t={t} />
      </Card>

      {/* Weekdays */}
      {weekdays.length > 1 ? (
        <>
          <Label>أيام الأسبوع</Label>
          <Card style={{ padding: 14, gap: 8 }}>
            {[6, 0, 1, 2, 3, 4, 5].filter((wd) => st.byWeekday[wd] != null).map((wd) => (
              <View key={wd} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <T style={{ width: 64, fontSize: 13 }}>{WEEKDAYS_AR[wd]}</T>
                <View style={{ flex: 1 }}>
                  <Progress value={st.byWeekday[wd]!} color={weakest?.wd === wd ? t.warn : h.color} height={8} />
                </View>
                <T w="num" style={{ width: 40, fontSize: 12.5, textAlign: 'center' }}>{pct(st.byWeekday[wd])}</T>
              </View>
            ))}
            {weakest && weakest.v < 0.8 ? <T style={{ color: t.warn, fontSize: 12.5 }}>{`أضعف يوم: ${WEEKDAYS_AR[weakest.wd]}. جهّز لها من بدري اليوم ده`}</T> : null}
          </Card>
        </>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Btn label="عدّل العادة" style={{ flex: 1 }} onPress={() => setEditing(true)} />
        {!confirm ? <Btn label="امسحها" style={{ flex: 1 }} onPress={() => setConfirm(true)} /> : null}
      </View>
      {confirm ? (
        <View style={[s.warn, { backgroundColor: t.warnSoft }]}>
          <T style={{ flex: 1, fontSize: 12.5 }}>هتتمسح العادة وكل اللي اتسجل ليها. متأكد؟</T>
          <Btn label="امسح" kind="solid" onPress={() => { deleteHabit(h.id); router.back(); }} />
          <Btn label="لا" onPress={() => setConfirm(false)} />
        </View>
      ) : null}
      <T style={{ color: t.mute, fontSize: 12, textAlign: 'center' }}>{`بدأتها ${+h.start.slice(8)} ${MONTHS_AR[+h.start.slice(5, 7) - 1]} ${h.start.slice(0, 4)}`}</T>
      {editing ? <HabitForm visible habit={h} onClose={() => setEditing(false)} /> : null}
    </Screen>
  );
}

const STATE_AR: Record<DayState, string> = { done: 'عملتها', skip: 'معذور', missed: 'فوّتها', today: 'النهارده، لسه', off: 'مش عليك', before: 'قبل ما تبدأ', future: 'لسه مجاش' };

function dayLook(s: DayState, color: string, t: Theme) {
  switch (s) {
    case 'done':
      return { backgroundColor: color };
    case 'skip':
      return { borderWidth: 1.5, borderStyle: 'dashed' as const, borderColor: color };
    case 'missed':
      return { backgroundColor: tint(t.bad, 0.14) };
    case 'off':
      return { backgroundColor: t.soft };
    default:
      return null;
  }
}
const numColor = (s: DayState, t: Theme) => (s === 'done' ? '#FFFFFF' : s === 'missed' ? t.bad : s === 'future' || s === 'before' || s === 'off' ? t.mute : t.fg);

/** GitHub-style grid: one column per week (Saturday on top), oldest at the start (right in RTL). */
function Heatmap({ h, log, today, t }: { h: Habit; log: Log; today: string; t: Theme }) {
  const start = addDays(weekStart(today), -(HEAT_WEEKS - 1) * 7);
  const cols = Array.from({ length: HEAT_WEEKS }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)));
  const color = (k: string) => {
    const s = dayState(h, log, k, today);
    return s === 'done' ? h.color : s === 'skip' ? tint(h.color, 0.35) : s === 'missed' ? tint(t.bad, 0.3) : s === 'future' ? 'transparent' : t.soft;
  };
  // Month names over the first week of each month.
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', gap: 2 }}>
        {cols.map((c, i) => {
          const m = +c[0].slice(5, 7) - 1;
          const show = i === 0 || +cols[i - 1][0].slice(5, 7) - 1 !== m;
          return (
            <View key={i} style={{ flex: 1, height: 14, overflow: 'visible' }}>
              {show && i < cols.length - 2 ? <T style={{ position: 'absolute', top: 0, start: 0, width: 56, fontSize: 9.5, color: t.mute }}>{MONTHS_AR[m]}</T> : null}
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: 2 }}>
        {cols.map((c, i) => (
          <View key={i} style={{ flex: 1, gap: 2 }}>
            {c.map((k) => (
              <View key={k} style={{ aspectRatio: 1, borderRadius: 3, backgroundColor: color(k), borderWidth: k === today ? 1 : 0, borderColor: t.fg }} />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

function Tile({ t, v, l }: { t: Theme; v: string; l: string }) {
  return (
    <View style={[s.tile, { backgroundColor: t.card }]}>
      <T w="numBold" style={{ fontSize: 16 }}>{v}</T>
      <T style={{ fontSize: 11, color: t.mute }} numberOfLines={1}>{l}</T>
    </View>
  );
}

function Legend({ t, label, style }: { t: Theme; label: string; style: object }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={[{ width: 14, height: 14, borderRadius: 7 }, style]} />
      <T style={{ fontSize: 12, color: t.mute }}>{label}</T>
    </View>
  );
}

function NavBtn({ t, icon, label, disabled, onPress }: { t: Theme; icon: 'chevron-forward' | 'chevron-back'; label: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} style={[s.navBtn, { backgroundColor: t.soft, opacity: disabled ? 0.35 : 1 }]}>
      <Ionicons name={icon} size={20} color={t.fg} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  hero: { padding: 16, alignItems: 'center', gap: 6 },
  bigIcon: { width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  tiles: { flexDirection: 'row', gap: 6, alignSelf: 'stretch', marginTop: 6 },
  tile: { flex: 1, borderRadius: 12, paddingVertical: 8, alignItems: 'center', gap: 1 },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  navBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  cell: { flex: 1, height: 46, alignItems: 'center', justifyContent: 'center' },
  bands: { position: 'absolute', top: 5, bottom: 5, start: 0, end: 0, flexDirection: 'row' },
  half: { flex: 1 },
  day: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 14, rowGap: 6 },
  warn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, padding: 10 },
});
