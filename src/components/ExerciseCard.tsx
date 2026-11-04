import React, { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { Exercise } from '../data/program';
import { MUSCLE_AR } from '../data/program';
import { TAG_INFO } from '../data/rules';
import { FORM_VIDEOS } from '../data/videos';
import { parseNum, shouldIncrease, type SetEntry } from '../lib/logic';
import { storage } from '../lib/storage';
import { useSettings } from '../lib/settings';
import { useTimer, tap } from '../lib/timer';
import { F, tint, useTheme } from '../theme';
import { Card, Check, ColorChip, Progress, Stepper, TagBadge, T } from './ui';
import { VideoSheet } from './VideoSheet';

type Props = { ex: Exercise; index: number; date: string; weekday: number; onChange: () => void };
type Row = { kg: string; reps: string; done: boolean };

const toRow = (s?: SetEntry): Row => ({ kg: s?.kg != null ? String(s.kg) : '', reps: s?.reps != null ? String(s.reps) : '', done: !!s?.done });

export function ExerciseCard({ ex, index, date, weekday, onChange }: Props) {
  const t = useTheme();
  const color = t.muscle[ex.muscle];
  const start = useTimer((s) => s.start);
  const autoRest = useSettings((s) => s.autoRest);
  const weightStep = useSettings((s) => s.weightStep);
  // Parent remounts this card (key) when the date changes or something outside it changes the data (clearing the day,
  // a new plan). Its own writes keep its state, so ticks and the counter can animate.
  const [rows, setRows] = useState<Row[]>(() => {
    const cur = storage.setsFor(date, ex.id);
    return Array.from({ length: ex.sets }, (_, i) => toRow(cur[i]));
  });
  const [last] = useState<SetEntry[] | undefined>(() => storage.lastSession(ex.id, date));

  const save = (i: number, r: Row) => {
    storage.saveSet({ date, weekday, exId: ex.id, idx: i, kg: parseNum(r.kg), reps: parseNum(r.reps), done: r.done ? 1 : 0 });
  };

  const edit = (i: number, field: 'kg' | 'reps', v: string) => {
    setRows((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: v };
      save(i, next[i]);
      return next;
    });
  };

  const toggle = (i: number) => {
    const r = { ...rows[i] };
    const pv = last?.[i];
    if (!r.done) {
      if (!r.kg && pv?.kg != null) r.kg = String(pv.kg);
      if (!r.reps && pv?.reps != null) r.reps = String(pv.reps);
    }
    r.done = !r.done;
    const next = [...rows];
    next[i] = r;
    setRows(next);
    save(i, r);
    tap();
    if (r.done && autoRest) start(ex.restSec, ex.name);
    onChange();
  };

  /** Counter: + ticks the first open set, − unticks the last ticked one. */
  const setCount = (n: number) => {
    const cur = rows.filter((r) => r.done).length;
    if (n > cur) {
      const i = rows.findIndex((r) => !r.done);
      if (i >= 0) toggle(i);
    } else if (n < cur) {
      const i = rows.map((r) => r.done).lastIndexOf(true);
      if (i >= 0) toggle(i);
    }
  };

  const allDone = rows.length > 0 && rows.every((r) => r.done);
  const up = shouldIncrease(ex, last);
  const range = `${ex.repLow}–${ex.repHigh}`;

  const doneCount = rows.filter((r) => r.done).length;
  const video = FORM_VIDEOS[ex.id];
  const [watching, setWatching] = useState(false);

  return (
    <Card style={allDone ? { opacity: 0.8 } : undefined}>
      {video ? <VideoSheet video={video} name={ex.name} visible={watching} onClose={() => setWatching(false)} /> : null}
      <View style={s.head}>
        <View style={[s.num, { backgroundColor: tint(color, 0.2) }]}>
          <T w="numBold" style={{ fontSize: 13 }}>{index + 1}</T>
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <T w="num" style={{ fontSize: 16.5, flexShrink: 1 }}>{ex.name}</T>
            {video ? (
              <Pressable
                onPress={() => setWatching(true)}
                accessibilityRole="button"
                accessibilityLabel={`فيديو الوضعية الصحيحة لـ ${ex.name}`}
                hitSlop={8}
                style={({ pressed }) => [s.video, { backgroundColor: t.okSoft, opacity: pressed ? 0.7 : 1 }]}>
                <Ionicons name="play" size={12} color={t.okText} />
                <T w="semi" style={{ fontSize: 12, color: t.okText }}>فيديو</T>
              </Pressable>
            ) : null}
          </View>
          <View style={s.meta}>
            <ColorChip label={MUSCLE_AR[ex.muscle]} color={color} size={12.5} />
            <T w="num" style={{ fontSize: 13.5, color: t.mute }}>{`\u2066${ex.sets} × ${range}\u2069`}</T>
            {ex.perLeg ? <T style={{ color: t.mute, fontSize: 12.5 }}>لكل رجل</T> : null}
            <TagBadge tag={ex.tag} />
            <T style={{ color: t.mute, fontSize: 12.5 }}>{ex.tag === 'heavy' ? 'راحة 2–3 د' : 'راحة 1–2 د'}</T>
          </View>
        </View>
      </View>

      <View style={[s.counter, { backgroundColor: t.soft }]}>
        <View style={{ flex: 1, gap: 6 }}>
          <T w="medium" style={{ fontSize: 13, color: doneCount ? t.okText : t.mute }}>
            {allDone ? 'خلصت كل المجموعات' : doneCount ? `خلصت ${doneCount} من ${ex.sets}` : 'لسه مبدأتش'}
          </T>
          <Progress value={doneCount / ex.sets} color={color} height={5} />
        </View>
        <Stepper value={doneCount} min={0} max={ex.sets} onChange={setCount} label="المجموعات اللي خلصت" format={(v) => `${v} / ${ex.sets}`} />
      </View>

      {up ? (
        <View style={[s.hint, { backgroundColor: t.okSoft }]}>
          <T w="medium" style={{ color: t.okText, fontSize: 13 }}>{`آخر مرة وصلت ${ex.repHigh} تكرار في كل المجموعات. زوّد الوزن ${weightStep} كجم ↑`}</T>
        </View>
      ) : null}
      {ex.tag === 'fail' || ex.tag === 'drop' ? (
        <View style={[s.hint, { backgroundColor: t.warnSoft }]}>
          <T w="medium" style={{ color: t.warn, fontSize: 13 }}>{TAG_INFO[ex.tag].short}</T>
        </View>
      ) : null}

      <View style={s.sets}>
        <View style={s.row}>
          <T style={[s.c0, { color: t.mute, fontSize: 11 }]}>#</T>
          <T style={[s.cin, { color: t.mute, fontSize: 11, textAlign: 'center' }]}>الوزن (كجم)</T>
          <T style={[s.cin, { color: t.mute, fontSize: 11, textAlign: 'center' }]}>تكرارات</T>
          <View style={s.c3} />
        </View>
        {rows.map((r, i) => {
          const pv = last?.[i];
          const lastSet = i === ex.sets - 1 && (ex.tag === 'fail' || ex.tag === 'drop');
          const inputStyle = [s.input, { backgroundColor: r.done ? t.okSoft : t.soft, color: t.fg }];
          return (
            <View key={i} style={s.row}>
              <T w={lastSet ? 'numBold' : 'numRegular'} style={[s.c0, { color: lastSet ? t.fg : t.mute, fontSize: 13 }]}>{i + 1}</T>
              <TextInput
                style={[s.cin, ...inputStyle]}
                value={r.kg}
                onChangeText={(v) => edit(i, 'kg', v)}
                placeholder={pv?.kg != null ? String(pv.kg) : 'كجم'}
                placeholderTextColor={t.mute}
                keyboardType="decimal-pad"
                accessibilityLabel={`الوزن مجموعة ${i + 1}`}
              />
              <TextInput
                style={[s.cin, ...inputStyle]}
                value={r.reps}
                onChangeText={(v) => edit(i, 'reps', v)}
                placeholder={pv?.reps != null ? String(pv.reps) : `\u2066${range}\u2069`}
                placeholderTextColor={t.mute}
                keyboardType="number-pad"
                accessibilityLabel={`التكرارات مجموعة ${i + 1}`}
              />
              <Check on={r.done} onPress={() => toggle(i)} label={`خلصت مجموعة ${i + 1}`} />
            </View>
          );
        })}
      </View>
    </Card>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 10 },
  num: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  video: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 9, height: 28 },
  counter: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 14, marginBottom: 10, borderRadius: 14, paddingVertical: 8, paddingStart: 12, paddingEnd: 8 },
  hint: { marginHorizontal: 14, marginBottom: 8, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  sets: { paddingHorizontal: 14, paddingBottom: 14, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  c0: { width: 28, textAlign: 'center' },
  cin: { flex: 1, minWidth: 0 },
  c3: { width: 48 },
  input: { fontFamily: F.num, fontSize: 17, textAlign: 'center', paddingVertical: 10, borderRadius: 12, writingDirection: 'ltr' },
});
