import React, { useMemo, useState } from 'react';
import { LayoutAnimation, Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { MONTHS_AR, MUSCLE_AR, WEEKDAYS_AR, WEEKDAY_LETTERS_AR, dayFor, dayMuscles, exerciseById, type Muscle } from '../data/program';
import { Card, ColorChip, Label, Pill, Ring, Screen, T } from '../components/ui';
import { MUSCLES, ctxOf, dayInfo, planSets, prSet, toSessions, type Session } from '../lib/gaps';
import { addMonths, countAr, dateKey, monthCells, weekdayOf, DAYS, SETS, TIMES, type DayStatus } from '../lib/logic';
import { storage } from '../lib/storage';
import { useDataVersion } from '../lib/bus';
import { tint, useTheme, type Theme } from '../theme';

// Weeks start Saturday (same as the progress tab); in RTL the first column is the rightmost.
const HEAD = [6, 0, 1, 2, 3, 4, 5].map((wd) => WEEKDAY_LETTERS_AR[wd]);
type Look = DayStatus | 'partial';
const LOOK_AR: Record<Look, string> = { done: 'حضرت', partial: 'حضرت ناقص', missed: 'فوّت', upcoming: 'جاي', off: 'راحة' };
const monthNum = (y: number, m: number) => y * 12 + m;
const animate = () => LayoutAnimation.configureNext(LayoutAnimation.create(160, 'easeInEaseOut', 'opacity'));

export default function Attendance() {
  const t = useTheme();
  const v = useDataVersion((s) => s.v);
  const params = useLocalSearchParams<{ muscle?: string; date?: string }>();
  const now = new Date();
  const today = dateKey(now);
  const cur = { y: now.getFullYear(), m: now.getMonth() };
  const startDate = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today;
  const [view, setView] = useState({ y: +startDate.slice(0, 4), m: +startDate.slice(5, 7) - 1 });
  const [muscle, setMuscle] = useState<Muscle | null>(MUSCLES.includes(params.muscle as Muscle) ? (params.muscle as Muscle) : null);
  const [sel, setSel] = useState<string>(startDate);

  const { byDate, c, prs } = useMemo(() => {
    const sess = toSessions(storage.allSets());
    const byDate = new Map<string, Session[]>();
    for (const s of sess) byDate.set(s.date, [...(byDate.get(s.date) ?? []), s]);
    return { byDate, c: ctxOf(sess, today), prs: prSet(sess) };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- v = data version: re-read storage after writes
  }, [v, today]);
  const info = (k: string) => dayInfo(k, byDate.get(k) ?? [], c, muscle ?? undefined);
  const look = (k: string): Look => {
    const i = info(k);
    return i.status === 'done' && i.partial ? 'partial' : i.status;
  };

  const first = c.since ? { y: +c.since.slice(0, 4), m: +c.since.slice(5, 7) - 1 } : cur;
  const statsFor = (y: number, m: number) => {
    const cells = monthCells(y, m);
    let done = 0, partial = 0, missed = 0, left = 0, sets = 0, planned = 0;
    for (const k of cells) {
      if (!k) continue;
      const i = info(k);
      sets += i.done;
      if (i.status === 'done') {
        done++;
        if (i.partial) partial++;
        planned += i.planned;
      } else if (i.status === 'missed') {
        missed++;
        planned += i.planned;
      } else if (i.status === 'upcoming') left++;
    }
    return { cells, done, partial, missed, left, sets, planned, rate: done + missed ? done / (done + missed) : null };
  };
  const st = statsFor(view.y, view.m);
  const canPrev = monthNum(view.y, view.m) > monthNum(first.y, first.m);
  const canNext = monthNum(view.y, view.m) < monthNum(cur.y, cur.m);
  const go = (delta: number) => setView(addMonths(view.y, view.m, delta));

  // Oldest first, so in RTL time runs right → left like the text.
  const recent = [5, 4, 3, 2, 1, 0].map((back) => {
    const { y, m } = addMonths(cur.y, cur.m, -back);
    return { y, m, ...statsFor(y, m) };
  });

  const weeks: (string | null)[][] = [];
  for (let i = 0; i < st.cells.length; i += 7) weeks.push(st.cells.slice(i, i + 7));

  const cellStyle = (s: Look) =>
    s === 'done'
      ? { backgroundColor: t.ok }
      : s === 'partial'
        ? { backgroundColor: t.okSoft, borderWidth: 1.5, borderColor: t.ok }
        : s === 'missed'
          ? { backgroundColor: t.warnSoft }
          : s === 'upcoming'
            ? { borderWidth: 1.5, borderColor: t.line }
            : null;
  const numColor = (s: Look) => (s === 'done' ? t.onOk : s === 'partial' ? t.okText : s === 'missed' ? t.warn : s === 'upcoming' ? t.fg : t.mute);
  const barColors = (k: string): string[] => {
    const trainedMuscles = [...new Set((byDate.get(k) ?? []).filter((s) => s.done > 0).map((s) => exerciseById(s.exId)?.muscle))].filter(Boolean) as Muscle[];
    return (muscle ? trainedMuscles.filter((m) => m === muscle) : trainedMuscles).map((m) => t.muscle[m]);
  };

  const title = muscle ? MUSCLE_AR[muscle] : null;
  const headline = st.done ? (muscle ? `${title}: اتمرنته ${countAr(st.done, TIMES)}` : `حضرت ${countAr(st.done, DAYS)}`) : muscle ? `${title}: لسه ما اتمرنتهوش` : 'لسه ما حضرتش';

  return (
    <Screen title="الكالندر" sub="شهر بشهر · الأسبوع بيبدأ السبت" onBack={() => router.back()}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        <Pill label="كل العضلات" on={!muscle} onPress={() => setMuscle(null)} />
        {MUSCLES.map((m) => (
          <Pill key={m} label={MUSCLE_AR[m]} color={t.muscle[m]} on={muscle === m} onPress={() => setMuscle(muscle === m ? null : m)} />
        ))}
      </View>

      <Card style={{ padding: 14, gap: 12 }}>
        <View style={s.nav}>
          <NavBtn icon="chevron-forward" label="الشهر اللي فات" disabled={!canPrev} onPress={() => go(-1)} />
          <T w="bold" style={{ fontSize: 17, flex: 1, textAlign: 'center' }}>{`${MONTHS_AR[view.m]} ${view.y}`}</T>
          <NavBtn icon="chevron-back" label="الشهر الجاي" disabled={!canNext} onPress={() => go(1)} />
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Ring value={st.rate ?? 0} size={64} stroke={5} color={muscle ? t.muscle[muscle] : undefined}>
            <T w="numBold" style={{ fontSize: 15, color: t.okText }}>{st.rate == null ? '–' : `${Math.round(st.rate * 100)}%`}</T>
          </Ring>
          <View style={{ flex: 1, gap: 2 }}>
            <T w="bold" style={{ fontSize: 17 }}>{headline}</T>
            <T style={{ color: t.mute, fontSize: 12.5, lineHeight: 19 }}>
              {[
                `فوّت ${st.missed}`,
                st.partial ? `ناقص ${st.partial}` : null,
                st.left ? `فاضل ${st.left}` : null,
                st.planned ? `${st.sets} من ${st.planned} مجموعة` : `${st.sets} مجموعة`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </T>
          </View>
        </View>

        <View style={{ gap: 4 }}>
          <View style={s.row}>
            {HEAD.map((h) => (
              <T key={h} w="medium" style={[s.cell, { color: t.mute, fontSize: 12.5, textAlign: 'center' }]}>{h}</T>
            ))}
          </View>
          {weeks.map((w, wi) => (
            <View key={wi} style={s.row}>
              {w.map((k, i) => {
                if (!k) return <View key={i} style={s.cell} />;
                const lk = look(k);
                const isToday = k === today;
                const on = k === sel;
                return (
                  <Pressable
                    key={i}
                    onPress={() => {
                      animate();
                      setSel(k);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`${+k.slice(8)} ${MONTHS_AR[view.m]} · ${LOOK_AR[lk]}${isToday ? ' · النهارده' : ''}`}
                    style={[s.cell, s.dayCell, on ? { backgroundColor: t.soft } : null]}>
                    <View style={[s.day, cellStyle(lk), isToday ? { borderWidth: 2, borderColor: t.ink } : null]}>
                      <T w={lk === 'done' || isToday ? 'numBold' : 'num'} style={{ fontSize: 14, color: numColor(lk) }}>{String(+k.slice(8))}</T>
                    </View>
                    <View style={s.bar}>
                      {barColors(k).map((col, ci) => (
                        <View key={ci} style={{ flex: 1, backgroundColor: col }} />
                      ))}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>

        <View style={s.legend}>
          <Legend label="حضرت" style={{ backgroundColor: t.ok }} />
          <Legend label="ناقص" style={{ backgroundColor: t.okSoft, borderWidth: 1.5, borderColor: t.ok }} />
          <Legend label="فوّت" style={{ backgroundColor: t.warnSoft, borderWidth: 1, borderColor: t.warn }} />
          <Legend label="جاي" style={{ borderWidth: 1.5, borderColor: t.line }} />
          <Legend label="النهارده" style={{ borderWidth: 2, borderColor: t.ink }} />
        </View>
      </Card>

      <DayDetail date={sel} sessions={byDate.get(sel) ?? []} overall={dayInfo(sel, byDate.get(sel) ?? [], c)} prs={prs} muscle={muscle} t={t} />

      <Label>{muscle ? `آخر 6 شهور · ${title}` : 'آخر 6 شهور'}</Label>
      <Card style={{ padding: 14 }}>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {recent.map((r) => {
            const on = r.y === view.y && r.m === view.m;
            const disabled = monthNum(r.y, r.m) < monthNum(first.y, first.m);
            const fill = muscle ? t.muscle[muscle] : t.ok;
            return (
              <Pressable
                key={`${r.y}-${r.m}`}
                disabled={disabled}
                onPress={() => setView({ y: r.y, m: r.m })}
                accessibilityRole="button"
                accessibilityState={{ selected: on, disabled }}
                accessibilityLabel={`${MONTHS_AR[r.m]} · ${r.rate == null ? 'مفيش تسجيل' : `${Math.round(r.rate * 100)}%`} · حضرت ${r.done}`}
                style={[s.col, on ? { backgroundColor: t.soft } : null]}>
                <T w="numBold" style={{ fontSize: 12.5, color: on ? t.okText : t.fg }}>{r.rate == null ? '–' : `${Math.round(r.rate * 100)}%`}</T>
                <View style={[s.track, { backgroundColor: t.soft }]}>
                  <View style={{ height: `${(r.rate ?? 0) * 100}%`, borderRadius: 6, backgroundColor: on ? fill : tint(fill, 0.4) }} />
                </View>
                <T w="num" style={{ fontSize: 12, color: t.mute }}>{String(r.done)}</T>
                <T w={on ? 'semi' : 'body'} style={{ fontSize: 11, color: on ? t.fg : t.mute, alignSelf: 'stretch', textAlign: 'center' }}>{MONTHS_AR[r.m]}</T>
              </Pressable>
            );
          })}
        </View>
        <T style={{ color: t.mute, fontSize: 12, textAlign: 'center', marginTop: 8 }}>
          {muscle ? `النسبة = الأيام اللي لعبت فيها ${title} من الأيام اللي عليه` : 'النسبة = الأيام اللي حضرتها من أيام التمرين · الرقم تحتها عدد الأيام'}
        </T>
      </Card>
    </Screen>
  );
}

/** What happened on the selected day: each program day logged, every exercise's sets against the plan, and records. */
function DayDetail({ date, sessions, overall, prs, muscle, t }: {
  date: string;
  sessions: Session[];
  overall: ReturnType<typeof dayInfo>;
  prs: Set<string>;
  muscle: Muscle | null;
  t: Theme;
}) {
  const wd = weekdayOf(date);
  const head = `${WEEKDAYS_AR[wd]} ${+date.slice(8)} ${MONTHS_AR[+date.slice(5, 7) - 1]}`;
  const look: Look = overall.status === 'done' && overall.partial ? 'partial' : overall.status;
  const chip = (
    <View style={[s.status, { backgroundColor: look === 'missed' ? t.warnSoft : look === 'done' || look === 'partial' ? t.okSoft : t.soft }]}>
      <T w="semi" style={{ fontSize: 12, color: look === 'missed' ? t.warn : look === 'done' || look === 'partial' ? t.okText : t.mute }}>{LOOK_AR[look]}</T>
    </View>
  );
  const logged = [...new Set(sessions.filter((x) => x.done > 0).map((x) => x.weekday))];

  let body: React.ReactNode;
  if (overall.status === 'done') {
    body = logged.map((lw) => {
      const d = dayFor(lw);
      if (!d) return null;
      const done = sessions.filter((x) => x.weekday === lw).reduce((a, x) => a + x.done, 0);
      return (
        <View key={lw} style={{ gap: 2 }}>
          <T w="semi" style={{ fontSize: 13.5, color: t.mute, marginBottom: 2 }}>{`يوم ${d.titleAr} · ${done} من ${planSets(lw)} مجموعة`}</T>
          {d.exercises.map((e) => {
            const x = sessions.find((y) => y.exId === e.id);
            const n = x?.done ?? 0;
            const pr = prs.has(`${date}|${e.id}`);
            const dim = muscle && e.muscle !== muscle;
            return (
              <View key={e.id} style={[s.exRow, { borderTopColor: t.line, opacity: dim ? 0.4 : 1 }]}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.muscle[e.muscle] }} />
                <T w="num" style={{ fontSize: 14, flex: 1 }} numberOfLines={1}>{e.name}</T>
                {pr ? (
                  <View style={[s.status, { backgroundColor: t.okSoft, flexDirection: 'row', gap: 3 }]}>
                    <Ionicons name="trophy" size={11} color={t.okText} />
                    <T w="semi" style={{ fontSize: 11.5, color: t.okText }}>رقم جديد</T>
                  </View>
                ) : null}
                {n === 0 ? (
                  <T w="semi" style={{ fontSize: 12.5, color: t.warn }}>اتساب</T>
                ) : (
                  <T w="num" style={{ fontSize: 13, color: n < e.sets ? t.warn : t.okText }}>{`${n}/${e.sets}`}</T>
                )}
              </View>
            );
          })}
        </View>
      );
    });
  } else if (overall.status === 'missed' || overall.status === 'upcoming') {
    const d = dayFor(wd)!;
    body = (
      <View style={{ gap: 8 }}>
        <T style={{ fontSize: 14 }}>{`${overall.status === 'missed' ? 'فوّت' : 'جاي'} يوم ${d.titleAr} · ${countAr(planSets(wd), SETS)}`}</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {dayMuscles(wd).map((m) => (
            <ColorChip key={m} label={MUSCLE_AR[m]} color={t.muscle[m]} size={12.5} />
          ))}
        </View>
      </View>
    );
  } else {
    body = <T style={{ color: t.mute, fontSize: 13.5 }}>{dayFor(wd) ? 'قبل ما تبدأ تسجّل.' : 'يوم راحة.'}</T>;
  }

  return (
    <Card style={{ padding: 14, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <T w="bold" style={{ fontSize: 16, flex: 1 }}>{head}</T>
        {chip}
      </View>
      {body}
    </Card>
  );
}

function NavBtn({ icon, label, disabled, onPress }: { icon: 'chevron-forward' | 'chevron-back'; label: string; disabled: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={[s.navBtn, { backgroundColor: t.soft, opacity: disabled ? 0.35 : 1 }]}>
      <Ionicons name={icon} size={20} color={t.fg} />
    </Pressable>
  );
}

function Legend({ label, style }: { label: string; style: object }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={[{ width: 14, height: 14, borderRadius: 7 }, style]} />
      <T style={{ fontSize: 12, color: t.mute }}>{label}</T>
    </View>
  );
}

const s = StyleSheet.create({
  nav: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  navBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row' },
  cell: { flex: 1 },
  dayCell: { alignItems: 'center', gap: 3, paddingVertical: 3, borderRadius: 12, minHeight: 48 },
  day: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  bar: { flexDirection: 'row', width: 18, height: 3, borderRadius: 2, overflow: 'hidden' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 14, rowGap: 6 },
  col: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 6, borderRadius: 12, minHeight: 44 },
  track: { width: 16, height: 80, borderRadius: 6, justifyContent: 'flex-end', overflow: 'hidden' },
  exRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36, borderTopWidth: 1, paddingVertical: 4 },
  status: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2, alignItems: 'center' },
});
