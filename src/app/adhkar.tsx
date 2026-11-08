import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Btn, Card, Label, MiniSwitch, Progress, Ring, Screen, T } from '../components/ui';
import { Press } from '../components/Motion';
import { confirm } from '../lib/confirm';
import type { AdhkarTime, Dhikr } from '../data/adhkar';
import { useDataVersion } from '../lib/bus';
import { ADHKAR_AR, ADHKAR_KEY, adhkarKey, adhkarNow, adhkarPart, adhkarProgress, countDhikr, doneDhikr, listFor, parseAdhkarLog, pruneAdhkar, said, type AdhkarLog } from '../lib/adhkar';
import { partsDone } from '../lib/habits';
import { readHabitLog, readHabitParts, readHabits, setPart } from '../lib/habitStore';
import { dateKey } from '../lib/logic';
import { storage } from '../lib/storage';
import { tap } from '../lib/timer';
import { useSettings } from '../lib/settings';
import { F, font, tint, useTheme } from '../theme';

const readLog = (): AdhkarLog => parseAdhkarLog(storage.getMeta(ADHKAR_KEY));
const times = (n: number) => (n === 1 ? 'مرة واحدة' : n === 2 ? 'مرتين' : n <= 10 ? `${n} مرات` : `${n} مرة`);
/** Arabic-Indic digits inside a left-to-right isolate, so "5/23" never flips around in Arabic text. */
const num = (s: string) => `⁦${s}⁩`;

/**
 * أذكار الصباح / المساء: a switch between the two lists, a bar of how far you are, the current dhikr as one big card you
 * tap to count (a ring fills; long-press takes one back; when it's full the next one comes in), and the whole list
 * as a road of beads like a goal's (done filled, current lit, later grey; tap one to jump to it). Finishing the list
 * ticks that part of the adhkar habit. Opens on morning or evening by the time of day, or `?time=`.
 */
export default function AdhkarScreen() {
  const t = useTheme();
  useDataVersion((s) => s.v);
  const haptics = useSettings((s) => s.haptics);
  const params = useLocalSearchParams<{ time?: string }>();
  const [time, setTime] = useState<AdhkarTime>(() => (params.time === 'morning' || params.time === 'evening' ? params.time : adhkarNow(new Date().getHours())));
  const today = dateKey();
  const key = adhkarKey(today, time);
  const list = listFor(time);
  const log = readLog();
  const counts = log[key];
  const pr = adhkarProgress(list, counts);
  const [cur, setCur] = useState<number>(() => Math.max(0, pr.next));
  const i = Math.min(cur, list.length - 1);
  const d = list[i];
  const n = said(counts, d);

  // The other list: start from its first one not finished.
  const switchTo = (v: AdhkarTime) => {
    setTime(v);
    setCur(Math.max(0, adhkarProgress(listFor(v), readLog()[adhkarKey(today, v)]).next));
  };

  const write = (next: AdhkarLog) => {
    storage.setMeta(ADHKAR_KEY, JSON.stringify(pruneAdhkar(next, today)));
    useDataVersion.getState().bump();
  };
  /** Ticks (or, after a reset, unticks) the habit part for this list. */
  const syncHabit = (finished: boolean) => {
    const link = adhkarPart(readHabits(), time);
    if (!link) return;
    const isOn = partsDone(link.h, readHabitLog(), readHabitParts(), today).includes(link.i);
    if (isOn !== finished) setPart(link.h, today, link.i);
  };

  const count = () => {
    if (n >= d.count) return;
    const next = countDhikr(log, key, d, 1);
    write(next);
    const full = n + 1 >= d.count;
    if (!full) {
      tap();
      return;
    }
    if (haptics) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const p = adhkarProgress(list, next[key]);
    if (p.finished) syncHabit(true);
    else setCur(p.next);
  };
  const back = () => {
    if (!n) return;
    tap();
    write(countDhikr(log, key, d, -1));
    syncHabit(false);
  };
  const reset = async () => {
    if (!(await confirm({ title: `تبدأ أذكار ${ADHKAR_AR[time]} من الأول؟`, body: 'العدّ بتاع النهارده هيتمسح.', confirmLabel: 'من الأول' }))) return;
    write({ ...log, [key]: {} });
    syncHabit(false);
    setCur(0);
  };

  return (
    <Screen
      title={`أذكار ${ADHKAR_AR[time]}`}
      sub={pr.finished ? 'خلّصتها النهارده ✓ تقبّل الله' : `${num(`${pr.done}/${pr.total}`)} · فاضل ${num(String(pr.totalTaps - pr.taps))} تسبيحة`}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/habits'))}
      aside={<MiniSwitch options={[['morning', ADHKAR_AR.morning], ['evening', ADHKAR_AR.evening]]} value={time} onChange={(v) => { tap(); switchTo(v); }} label="الأذكار" />}>
      <Progress value={pr.taps / Math.max(1, pr.totalTaps)} height={6} />

      {pr.finished ? (
        <Card style={s.doneCard}>
          <Ionicons name="checkmark-circle" size={44} color={t.green} />
          <T w="bold" style={{ fontSize: 18 }}>{`خلّصت أذكار ${ADHKAR_AR[time]}`}</T>
          <T style={{ color: t.mute, fontSize: 13.5 }}>تقبّل الله منك</T>
          <View style={{ flexDirection: 'row', gap: 8, alignSelf: 'stretch', marginTop: 4 }}>
            <Btn label={time === 'morning' ? 'أذكار المساء' : 'أذكار الصباح'} onPress={() => switchTo(time === 'morning' ? 'evening' : 'morning')} style={{ flex: 1 }} />
            <Btn label="رجوع" kind="solid" onPress={() => (router.canGoBack() ? router.back() : router.replace('/habits'))} style={{ flex: 1 }} />
          </View>
        </Card>
      ) : (
        <Press onPress={count} onLongPress={back} delayLongPress={450} scale={0.985} accessibilityRole="button" accessibilityLabel={`${d.text}. ${num(`${n}/${d.count}`)}`} accessibilityHint="دوس تعدّ، ودوسة طويلة ترجّع واحدة" style={[s.card, { backgroundColor: t.card }]}>
          <Animated.View key={d.id} entering={FadeIn.duration(220)} style={{ gap: 10 }}>
            <View style={s.meta}>
              <T w="semi" style={{ fontSize: 12.5, color: t.okText }}>{times(d.count)}</T>
              {d.ref ? <T style={{ fontSize: 12, color: t.mute, flexShrink: 1 }} numberOfLines={1}>{`· ${d.ref}`}</T> : null}
            </View>
            <T style={{ fontFamily: F.quran, fontSize: 19, lineHeight: 40, textAlign: 'center', writingDirection: 'rtl' }}>{d.text}</T>
            {d.virtue ? <T style={{ fontSize: 12, lineHeight: 19, color: t.mute, textAlign: 'center' }}>{d.virtue}</T> : null}
          </Animated.View>
          <View style={{ alignItems: 'center', marginTop: 6 }}>
            <Ring value={n / d.count} size={92} stroke={6} color={doneDhikr(counts, d) ? t.green : t.ok}>
              <T style={{ fontSize: 22, ...font('numBold') }}>{num(`${n}/${d.count}`)}</T>
              <T style={{ fontSize: 11, color: t.mute }}>{n >= d.count ? 'تمام' : 'دوس'}</T>
            </Ring>
          </View>
        </Press>
      )}

      <Label>الطريق</Label>
      <Card style={{ paddingVertical: 4, overflow: 'hidden' }}>
        {list.map((x, k) => (
          <Bead key={x.id} x={x} n={said(counts, x)} state={doneDhikr(counts, x) ? 'done' : k === i && !pr.finished ? 'now' : 'later'} first={k === 0} last={k === list.length - 1} onPress={() => { tap(); setCur(k); }} />
        ))}
      </Card>
      {pr.taps ? <Btn label="ابدأ من الأول" onPress={() => void reset()} /> : null}
    </Screen>
  );
}

/** One dhikr on the road: bead (✓ done, number now, empty later) on a line joining them, its first words, its count. */
function Bead({ x, n, state, first, last, onPress }: { x: Dhikr; n: number; state: 'done' | 'now' | 'later'; first: boolean; last: boolean; onPress: () => void }) {
  const t = useTheme();
  const line = tint(t.fg, 0.14);
  const head = x.text.split('\n').pop() ?? x.text;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${head}، ${num(`${n}/${x.count}`)}`} style={({ pressed }) => [s.bead, { backgroundColor: pressed ? t.soft : 'transparent' }]}>
      <View style={s.rail}>
        <View style={[s.line, { backgroundColor: first ? 'transparent' : line }]} />
        <View style={[s.dot, state === 'done' ? { backgroundColor: t.fg } : state === 'now' ? { backgroundColor: t.card, borderWidth: 2.5, borderColor: t.ok } : { borderWidth: 1.5, borderColor: line }]}>
          {state === 'done' ? <Ionicons name="checkmark" size={13} color={t.bg} /> : null}
        </View>
        <View style={[s.line, { flex: 1, backgroundColor: last ? 'transparent' : line }]} />
      </View>
      <T numberOfLines={1} style={{ flex: 1, fontFamily: F.quran, fontSize: 15, lineHeight: 30, color: state === 'later' ? t.mute : state === 'done' ? t.mute : t.fg, textDecorationLine: state === 'done' ? 'line-through' : 'none' }}>{head}</T>
      <T style={{ fontSize: 12, color: state === 'now' ? t.okText : t.mute, ...font('num') }}>{state === 'now' && n ? num(`${n}/${x.count}`) : num(`×${x.count}`)}</T>
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: 12, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16, gap: 6 },
  doneCard: { padding: 18, gap: 6, alignItems: 'center' },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  bead: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingEnd: 14 },
  rail: { width: 44, alignSelf: 'stretch', alignItems: 'center' },
  line: { width: 2, minHeight: 10 },
  dot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
});
