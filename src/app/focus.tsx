import React, { useEffect, useState } from 'react';
import { LayoutAnimation, Platform, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Ring, Screen, Sheet, Stepper, T } from '../components/ui';
import { MenuButton } from '../components/SideMenu';
import { useDataVersion } from '../lib/bus';
import { dateKey, weekdayOf } from '../lib/logic';
import { clock, countOn, KINDS, minAr, minutesOn, paused, PHASE_AR, phaseMs, remaining, running, streak, week, type Kind } from '../lib/focus';
import { endPhase, pauseFocus, readCfg, readFocus, readSessions, resetFocus, saveCfg, setFocus, startFocus, tickFocus } from '../lib/focusStore';
import { allView } from '../lib/tasks';
import { readTasks } from '../lib/taskStore';
import { useNow } from '../lib/useNow';
import { tap } from '../lib/timer';
import { ThemeProvider, tint, useTheme, useWarm, type Theme } from '../theme';

const ease = () => {
  if (Platform.OS !== 'web') LayoutAnimation.configureNext(LayoutAnimation.create(200, 'easeInEaseOut', 'opacity'));
};
const WD = ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'];
const hm = (ms: number) => {
  const d = new Date(ms);
  return `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export default function FocusSection() {
  return (
    <ThemeProvider value={useWarm()}>
      <Focus />
    </ThemeProvider>
  );
}

/**
 * بومودورو: one ring with the time left (focus in the section color, breaks in green), the round's dots, and three
 * buttons (reset, start/pause, skip). Above it what you're on (شغل / مذاكرة, and a task from مهامي); under it today,
 * the streak, the week, today's blocks and the lengths.
 */
function Focus() {
  const t = useTheme();
  useDataVersion((s) => s.v);
  const now = useNow(1000);
  const today = dateKey();
  const cfg = readCfg();
  const s = readFocus();
  const list = readSessions();
  const [picking, setPicking] = useState(false);
  const [setup, setSetup] = useState(false);
  const on = running(s);

  useEffect(() => tickFocus(now), [now]);
  useEffect(() => {
    if (Platform.OS === 'web' || !on) return;
    activateKeepAwakeAsync('focus').catch(() => {});
    return () => void deactivateKeepAwake('focus').catch(() => {});
  }, [on]);

  const left = remaining(s, cfg, now);
  const total = phaseMs(s.phase, cfg);
  const color = s.phase === 'focus' ? t.sec.focus : t.sec.goals;
  const todayMin = minutesOn(list, today);
  const days = week(list, today);
  const top = Math.max(30, ...days.map((d) => d.min));
  const todays = list.filter((x) => x.date === today).sort((a, b) => b.end - a.end);
  const tasks = allView(readTasks(), today).flatMap((g) => g.tasks).slice(0, 30);

  return (
    <Screen
      dense
      title="بومودورو"
      action={<MenuButton />}
      aside={
        todayMin ? (
          <View style={[s_.chip, { backgroundColor: tint(t.sec.focus, 0.14) }]}>
            <T w="numBold" style={{ fontSize: 11.5, color: t.sec.focus }}>{`${minAr(todayMin)} النهارده`}</T>
          </View>
        ) : null
      }>
      {picking ? (
        <Sheet visible onClose={() => setPicking(false)} title="بتشتغل على إيه؟" sub="اختار مهمة من مهامي، أو من غير">
          <Pressable onPress={() => { setFocus({ task: undefined }); setPicking(false); }} style={[s_.pick, { borderColor: t.line }]} accessibilityRole="button">
            <Ionicons name="remove-circle-outline" size={18} color={t.mute} />
            <T style={{ flex: 1, fontSize: 14.5, color: t.mute }}>من غير مهمة</T>
            {!s.task ? <Ionicons name="checkmark" size={18} color={t.ok} /> : null}
          </Pressable>
          {tasks.map((x) => (
            <Pressable key={x.id} onPress={() => { tap(); setFocus({ task: x.title }); setPicking(false); }} style={[s_.pick, { borderColor: t.line }]} accessibilityRole="button">
              <Ionicons name="ellipse-outline" size={16} color={t.mute} />
              <T style={{ flex: 1, fontSize: 14.5 }} numberOfLines={1}>{x.title}</T>
              {s.task === x.title ? <Ionicons name="checkmark" size={18} color={t.ok} /> : null}
            </Pressable>
          ))}
          {!tasks.length ? <T style={{ color: t.mute, fontSize: 13 }}>مفيش مهام مفتوحة في مهامي</T> : null}
        </Sheet>
      ) : null}

      <View style={s_.row}>
        <View style={[s_.seg, { backgroundColor: t.soft }]}>
          {(Object.keys(KINDS) as Kind[]).map((k) => {
            const sel = s.kind === k;
            return (
              <Pressable key={k} onPress={() => { tap(); setFocus({ kind: k }); }} accessibilityRole="tab" accessibilityState={{ selected: sel }} style={[s_.segBtn, sel ? { backgroundColor: t.card, boxShadow: '0px 1px 6px rgba(0,0,0,0.08)' } : null]}>
                <Ionicons name={k === 'work' ? 'briefcase-outline' : 'book-outline'} size={14} color={sel ? t.fg : t.mute} />
                <T w="semi" style={{ fontSize: 13, color: sel ? t.fg : t.mute }}>{KINDS[k]}</T>
              </Pressable>
            );
          })}
        </View>
        <Pressable onPress={() => setPicking(true)} accessibilityRole="button" accessibilityLabel={s.task ? `المهمة: ${s.task}` : 'اختار مهمة'} style={({ pressed }) => [s_.task, { backgroundColor: t.soft, opacity: pressed ? 0.7 : 1 }]}>
          <Ionicons name="checkbox-outline" size={15} color={s.task ? t.fg : t.mute} />
          <T style={{ flex: 1, fontSize: 13, color: s.task ? t.fg : t.mute }} numberOfLines={1}>{s.task ?? 'على أنهي مهمة؟'}</T>
          <Ionicons name="chevron-down" size={13} color={t.mute} />
        </Pressable>
      </View>

      <View style={[s_.card, { backgroundColor: t.card, borderColor: t.border }]}>
        <Ring value={1 - left / total} size={188} stroke={8} color={color} track={tint(color, 0.13)} animated={false}>
          <View style={{ alignItems: 'center' }}>
            <T w="semi" style={{ fontSize: 13, color }}>{PHASE_AR[s.phase]}</T>
            <T w="numBold" style={{ fontSize: 42, lineHeight: 50, letterSpacing: 1 }}>{clock(left)}</T>
            <View style={s_.dots}>
              {Array.from({ length: cfg.every }, (_, i) => (
                <View key={i} style={[s_.dot, { backgroundColor: i < s.round ? t.sec.focus : 'transparent', borderColor: tint(t.sec.focus, 0.6) }]} />
              ))}
            </View>
          </View>
        </Ring>
        <View style={s_.ctrls}>
          <Pressable onPress={() => { tap(); resetFocus(); }} disabled={!on && !paused(s)} accessibilityRole="button" accessibilityLabel="من الأول" style={({ pressed }) => [s_.side, { backgroundColor: t.soft, opacity: !on && !paused(s) ? 0.4 : pressed ? 0.7 : 1 }]}>
            <Ionicons name="refresh" size={20} color={t.fg} />
          </Pressable>
          <Pressable onPress={() => { tap(); if (on) pauseFocus(); else startFocus(); }} accessibilityRole="button" accessibilityLabel={on ? 'وقّف' : paused(s) ? 'كمّل' : 'ابدأ'} style={({ pressed }) => [s_.main, { backgroundColor: color, boxShadow: `0px 6px 18px ${tint(color, 0.4)}`, transform: [{ scale: pressed ? 0.95 : 1 }] }]}>
            <Ionicons name={on ? 'pause' : 'play'} size={25} color="#FFFFFF" style={on ? null : { marginStart: 3 }} />
          </Pressable>
          <Pressable onPress={() => { tap(); ease(); endPhase(false); }} accessibilityRole="button" accessibilityLabel={s.phase === 'focus' ? 'خلّص التركيز' : 'فوّت الراحة'} style={({ pressed }) => [s_.side, { backgroundColor: t.soft, opacity: pressed ? 0.7 : 1 }]}>
            <Ionicons name="play-skip-back" size={19} color={t.fg} />
          </Pressable>
        </View>
        <T style={{ fontSize: 12, color: t.mute, textAlign: 'center' }}>
          {s.phase === 'focus' ? `${cfg.focus} دقيقة تركيز، وبعدها ${s.round + 1 >= cfg.every ? `راحة ${cfg.long} دقيقة` : `راحة ${cfg.short} دقايق`}` : 'قوم اتحرك، اشرب ماية، وبعّد عن الموبايل'}
        </T>
      </View>

      <View style={s_.stats}>
        <Stat t={t} value={minAr(todayMin)} label="النهارده" />
        <Stat t={t} value={String(countOn(list, today))} label="جلسات" />
        <Stat t={t} value={`${streak(list, today)}`} label="أيام ورا بعض" icon="flame" />
      </View>

      <View style={[s_.card, { backgroundColor: t.card, borderColor: t.border, paddingVertical: 6, gap: 3 }]}>
        <View style={s_.bars}>
          {days.map((d) => (
            <View key={d.date} style={{ flex: 1, alignItems: 'center', gap: 3 }}>
              <View style={{ height: 34, justifyContent: 'flex-end', width: '100%', alignItems: 'center' }}>
                <View style={[s_.bar, { height: Math.max(3, (d.min / top) * 34), backgroundColor: d.min ? (d.date === today ? t.sec.focus : tint(t.sec.focus, 0.45)) : t.soft }]} />
              </View>
              <T style={{ fontSize: 10.5, color: d.date === today ? t.fg : t.mute }}>{WD[weekdayOf(d.date)]}</T>
            </View>
          ))}
        </View>
        <T style={{ fontSize: 11.5, color: t.mute, textAlign: 'center' }}>{`آخر 7 أيام: ${minAr(days.reduce((a, d) => a + d.min, 0))}`}</T>
      </View>

      {todays.length ? (
        <View style={[s_.card, { backgroundColor: t.card, borderColor: t.border, paddingVertical: 2, alignItems: 'stretch' }]}>
          {todays.map((x, i) => (
            <View key={x.id} style={[s_.sess, { borderTopWidth: i ? 1 : 0, borderColor: t.line }]}>
              <Ionicons name={x.kind === 'work' ? 'briefcase-outline' : 'book-outline'} size={14} color={t.sec.focus} />
              <T style={{ flex: 1, fontSize: 13.5 }} numberOfLines={1}>{x.task ?? KINDS[x.kind]}</T>
              <T w="num" style={{ fontSize: 12, color: t.mute }}>{hm(x.start)}</T>
              <T w="numBold" style={{ fontSize: 12.5, color: t.sec.focus, minWidth: 44, textAlign: 'left' }}>{minAr(x.min)}</T>
            </View>
          ))}
        </View>
      ) : null}

      <Pressable onPress={() => { ease(); setSetup(!setup); }} accessibilityRole="button" accessibilityState={{ expanded: setup }} style={s_.setupBtn}>
        <Ionicons name="options-outline" size={15} color={t.mute} />
        <T w="semi" style={{ fontSize: 13, color: t.mute }}>{`المدد: ${cfg.focus} / ${cfg.short} / ${cfg.long} · راحة طويلة كل ${cfg.every}`}</T>
        <Ionicons name={setup ? 'chevron-up' : 'chevron-down'} size={14} color={t.mute} />
      </Pressable>
      {setup ? (
        <View style={[s_.card, { backgroundColor: t.card, borderColor: t.border, alignItems: 'stretch', paddingVertical: 4 }]}>
          <Line t={t} label="التركيز"><Stepper compact value={cfg.focus} min={5} max={120} step={5} onChange={(v) => saveCfg({ ...cfg, focus: v })} label="التركيز" format={(v) => `${v} د`} /></Line>
          <Line t={t} label="الراحة القصيرة"><Stepper compact value={cfg.short} min={1} max={30} onChange={(v) => saveCfg({ ...cfg, short: v })} label="الراحة القصيرة" format={(v) => `${v} د`} /></Line>
          <Line t={t} label="الراحة الطويلة"><Stepper compact value={cfg.long} min={5} max={60} step={5} onChange={(v) => saveCfg({ ...cfg, long: v })} label="الراحة الطويلة" format={(v) => `${v} د`} /></Line>
          <Line t={t} label="الراحة الطويلة بعد"><Stepper compact value={cfg.every} min={2} max={8} onChange={(v) => saveCfg({ ...cfg, every: v })} label="الراحة الطويلة بعد" format={(v) => `${v} جلسات`} /></Line>
          <Pressable onPress={() => saveCfg({ ...cfg, auto: !cfg.auto })} accessibilityRole="switch" accessibilityState={{ checked: cfg.auto }} accessibilityLabel="ابدأ اللي بعده لوحده" style={s_.line}>
            <T w="medium" style={{ flex: 1, fontSize: 14 }}>ابدأ اللي بعده لوحده</T>
            {/* RTL: off = thumb at the start (right), on = end (left), like settings. */}
            <View style={[s_.track, { backgroundColor: cfg.auto ? t.ok : t.line, alignItems: cfg.auto ? 'flex-end' : 'flex-start' }]}>
              <View style={s_.thumb} />
            </View>
          </Pressable>
        </View>
      ) : null}
    </Screen>
  );
}

function Line({ t, label, children }: { t: Theme; label: string; children: React.ReactNode }) {
  return (
    <View style={[s_.line, { borderBottomWidth: 1, borderColor: t.line }]}>
      <T w="medium" style={{ flex: 1, fontSize: 14 }}>{label}</T>
      {children}
    </View>
  );
}

function Stat({ t, value, label, icon }: { t: Theme; value: string; label: string; icon?: React.ComponentProps<typeof Ionicons>['name'] }) {
  return (
    <View style={[s_.stat, { backgroundColor: t.card, borderColor: t.border }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
        {icon ? <Ionicons name={icon} size={14} color={t.sec.focus} /> : null}
        <T w="numBold" style={{ fontSize: 17 }}>{value}</T>
      </View>
      <T style={{ fontSize: 11, color: t.mute }}>{label}</T>
    </View>
  );
}

const s_ = StyleSheet.create({
  chip: { borderRadius: 9, paddingHorizontal: 7, height: 20, justifyContent: 'center' },
  row: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  seg: { flexDirection: 'row', padding: 3, borderRadius: 12, gap: 2 },
  segBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 28, borderRadius: 9, paddingHorizontal: 10 },
  task: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, borderRadius: 11, paddingHorizontal: 10 },
  card: { borderRadius: 16, borderWidth: 1, padding: 8, alignItems: 'center', gap: 6 },
  dots: { flexDirection: 'row', gap: 5, marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1.5 },
  ctrls: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  side: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  main: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },
  stats: { flexDirection: 'row', gap: 5 },
  stat: { flex: 1, borderRadius: 12, borderWidth: 1, paddingVertical: 4, alignItems: 'center', gap: 0 },
  bars: { flexDirection: 'row', gap: 6, width: '100%' },
  bar: { width: '70%', borderRadius: 4 },
  sess: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 30 },
  setupBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 26 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 6 },
  track: { width: 44, height: 26, borderRadius: 13, padding: 2, justifyContent: 'center' },
  thumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFFFFF', boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.25)' },
  pick: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, borderBottomWidth: 1 },
});
