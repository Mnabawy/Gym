import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { dayMuscles, MONTHS_AR, PLAN_WEEKDAYS, WEEKDAY_LETTERS_AR } from '../data/program';
import { Card, Label, Ring, Screen, T } from '../components/ui';
import { addMonths, dateKey, dayStatus, monthCells, monthStats, type DayStatus } from '../lib/logic';
import { storage } from '../lib/storage';
import { useDataVersion } from '../lib/bus';
import { tint, useTheme } from '../theme';

// Weeks start Saturday (same as the progress tab); in RTL the first column is the rightmost.
const HEAD = [6, 0, 1, 2, 3, 4, 5].map((wd) => WEEKDAY_LETTERS_AR[wd]);
const STATUS_AR: Record<DayStatus, string> = { done: 'حضرت', missed: 'فوّت', upcoming: 'جاي', off: 'راحة' };
const monthNum = (y: number, m: number) => y * 12 + m;
const daysAr = (n: number) => (n === 1 ? 'يوم' : n === 2 ? 'يومين' : n >= 3 && n <= 10 ? `${n} أيام` : `${n} يوم`);

export default function Attendance() {
  const t = useTheme();
  useDataVersion((s) => s.v);
  const now = new Date();
  const today = dateKey(now);
  const cur = { y: now.getFullYear(), m: now.getMonth() };
  const [view, setView] = useState(cur);

  const days = storage.trainedDays();
  const byDate = new Map(days.map((d) => [d.date, d]));
  const trained = new Set(byDate.keys());
  const since = days[0]?.date;
  const first = since ? { y: +since.slice(0, 4), m: +since.slice(5, 7) - 1 } : cur;

  const statsFor = (y: number, m: number) => {
    const cells = monthCells(y, m);
    const prefix = `${y}-${String(m + 1).padStart(2, '0')}`;
    const sets = days.reduce((a, d) => a + (d.date.startsWith(prefix) ? d.sets : 0), 0);
    return { cells, sets, ...monthStats(cells, trained, PLAN_WEEKDAYS, today, since) };
  };
  const st = statsFor(view.y, view.m);
  const canPrev = monthNum(view.y, view.m) > monthNum(first.y, first.m);
  const canNext = monthNum(view.y, view.m) < monthNum(cur.y, cur.m);

  // Oldest first, so in RTL time runs right → left like the text.
  const recent = [5, 4, 3, 2, 1, 0].map((back) => {
    const { y, m } = addMonths(cur.y, cur.m, -back);
    return { y, m, ...statsFor(y, m) };
  });

  const weeks: (string | null)[][] = [];
  for (let i = 0; i < st.cells.length; i += 7) weeks.push(st.cells.slice(i, i + 7));

  const cellStyle = (s: DayStatus) =>
    s === 'done' ? { backgroundColor: t.ok } : s === 'missed' ? { backgroundColor: t.warnSoft } : s === 'upcoming' ? { borderWidth: 1.5, borderColor: t.line } : null;
  const numColor = (s: DayStatus) => (s === 'done' ? '#FFFFFF' : s === 'missed' ? t.warn : s === 'upcoming' ? t.fg : t.mute);

  return (
    <Screen title="الحضور" sub="شهر بشهر · الأسبوع بيبدأ السبت" onBack={() => router.back()}>
      <Card style={{ padding: 14, gap: 12 }}>
        <View style={s.nav}>
          <NavBtn icon="chevron-forward" label="الشهر اللي فات" disabled={!canPrev} onPress={() => setView(addMonths(view.y, view.m, -1))} />
          <T w="bold" style={{ fontSize: 17, flex: 1, textAlign: 'center' }}>{`${MONTHS_AR[view.m]} ${view.y}`}</T>
          <NavBtn icon="chevron-back" label="الشهر الجاي" disabled={!canNext} onPress={() => setView(addMonths(view.y, view.m, 1))} />
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Ring value={st.rate ?? 0} size={64} stroke={5}>
            <T w="numBold" style={{ fontSize: 15, color: t.okText }}>{st.rate == null ? '–' : `${Math.round(st.rate * 100)}%`}</T>
          </Ring>
          <View style={{ flex: 1, gap: 2 }}>
            <T w="bold" style={{ fontSize: 18 }}>{st.done ? `حضرت ${daysAr(st.done)}` : 'لسه ما حضرتش'}</T>
            <T style={{ color: t.mute, fontSize: 12.5 }}>
              {[`فوّت ${st.missed}`, st.left ? `فاضل ${st.left}` : null, `${st.sets} مجموعة`].filter(Boolean).join(' · ')}
            </T>
          </View>
        </View>

        <View style={{ gap: 6 }}>
          <View style={s.row}>
            {HEAD.map((h) => (
              <T key={h} w="medium" style={[s.cell, { color: t.mute, fontSize: 12.5, textAlign: 'center' }]}>{h}</T>
            ))}
          </View>
          {weeks.map((w, wi) => (
            <View key={wi} style={s.row}>
              {w.map((k, i) => {
                if (!k) return <View key={i} style={s.cell} />;
                const status = dayStatus(k, trained, PLAN_WEEKDAYS, today, since);
                const colors = status === 'done' ? [...new Set(byDate.get(k)!.weekdays.flatMap(dayMuscles))].map((m) => t.muscle[m]) : [];
                const isToday = k === today;
                return (
                  <View key={i} style={[s.cell, { alignItems: 'center', gap: 3 }]} accessible accessibilityLabel={`${+k.slice(8)} ${MONTHS_AR[view.m]} · ${STATUS_AR[status]}${isToday ? ' · النهارده' : ''}`}>
                    <View style={[s.day, cellStyle(status), isToday ? { borderWidth: 2, borderColor: t.ink } : null]}>
                      <T w={status === 'done' || isToday ? 'numBold' : 'num'} style={{ fontSize: 14, color: numColor(status) }}>{String(+k.slice(8))}</T>
                    </View>
                    <View style={s.bar}>
                      {colors.map((c, ci) => (
                        <View key={ci} style={{ flex: 1, backgroundColor: c }} />
                      ))}
                    </View>
                  </View>
                );
              })}
            </View>
          ))}
        </View>

        <View style={s.legend}>
          <Legend label="حضرت" style={{ backgroundColor: t.ok }} />
          <Legend label="فوّت" style={{ backgroundColor: t.warnSoft, borderWidth: 1, borderColor: t.warn }} />
          <Legend label="يوم تمرين جاي" style={{ borderWidth: 1.5, borderColor: t.line }} />
          <Legend label="النهارده" style={{ borderWidth: 2, borderColor: t.ink }} />
        </View>
      </Card>

      <Label>آخر 6 شهور</Label>
      <Card style={{ padding: 14 }}>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {recent.map((r) => {
            const on = r.y === view.y && r.m === view.m;
            const disabled = monthNum(r.y, r.m) < monthNum(first.y, first.m);
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
                  <View style={{ height: `${(r.rate ?? 0) * 100}%`, borderRadius: 6, backgroundColor: on ? t.ok : tint(t.ok, 0.4) }} />
                </View>
                <T w="num" style={{ fontSize: 12, color: t.mute }}>{String(r.done)}</T>
                <T w={on ? 'semi' : 'body'} style={{ fontSize: 11, color: on ? t.fg : t.mute, alignSelf: 'stretch', textAlign: 'center' }}>{MONTHS_AR[r.m]}</T>
              </Pressable>
            );
          })}
        </View>
        <T style={{ color: t.mute, fontSize: 12, textAlign: 'center', marginTop: 8 }}>النسبة = الأيام اللي حضرتها من أيام التمرين · الرقم تحتها عدد الأيام</T>
      </Card>
    </Screen>
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
  day: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  bar: { flexDirection: 'row', width: 18, height: 3, borderRadius: 2, overflow: 'hidden' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 14, rowGap: 6 },
  col: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 6, borderRadius: 12, minHeight: 44 },
  track: { width: 16, height: 80, borderRadius: 6, justifyContent: 'flex-end', overflow: 'hidden' },
});
