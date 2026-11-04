import React, { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { Exercise } from '../data/program';
import { FORM_VIDEOS } from '../data/videos';
import { parseNum, shouldIncrease, type SetEntry } from '../lib/logic';
import { storage } from '../lib/storage';
import { useSettings } from '../lib/settings';
import { useTimer, tap } from '../lib/timer';
import { F, glow, tint, useTheme } from '../theme';
import { Check, InfoPopup, TagBadge, T } from './ui';
import { VideoSheet } from './VideoSheet';

type Props = {
  ex: Exercise;
  index: number;
  date: string;
  weekday: number;
  /** Open: weight/reps inputs per set. Closed: one small box per set (tap to tick). */
  open: boolean;
  onOpen: () => void;
  /** First row in the list: no divider above it. */
  first: boolean;
  onChange: () => void;
};
type Row = { kg: string; reps: string; done: boolean };

const toRow = (s?: SetEntry): Row => ({ kg: s?.kg != null ? String(s.kg) : '', reps: s?.reps != null ? String(s.reps) : '', done: !!s?.done });
const iso = (s: string) => `⁦${s}⁩`;

/**
 * One exercise in the workout list (docs/mockups/cards-options.html, design "2 + 3"): a header line, then either the
 * set inputs (open) or a row of small set boxes (closed). Ticking a box fills weight and reps from last time.
 */
export function ExerciseRow({ ex, index, date, weekday, open, onOpen, first, onChange }: Props) {
  const t = useTheme();
  const color = t.muscle[ex.muscle];
  const start = useTimer((s) => s.start);
  const autoRest = useSettings((s) => s.autoRest);
  const weightStep = useSettings((s) => s.weightStep);
  // Parent remounts this row (key) when the date changes or something outside it changes the data (clearing the day,
  // a new plan). Its own writes keep its state, so ticks can animate.
  const [rows, setRows] = useState<Row[]>(() => {
    const cur = storage.setsFor(date, ex.id);
    return Array.from({ length: ex.sets }, (_, i) => toRow(cur[i]));
  });
  const [last] = useState<SetEntry[] | undefined>(() => storage.lastSession(ex.id, date));
  const [watching, setWatching] = useState(false);
  const [why, setWhy] = useState(false);

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

  const doneCount = rows.filter((r) => r.done).length;
  const allDone = rows.length > 0 && doneCount === rows.length;
  const up = shouldIncrease(ex, last);
  const range = `${ex.repLow}–${ex.repHigh}`;
  const video = FORM_VIDEOS[ex.id];

  return (
    <View
      style={[
        s.wrap,
        { borderTopWidth: first ? 0 : StyleSheet.hairlineWidth * 2, borderTopColor: t.neon ? t.border : t.line },
        open ? { backgroundColor: tint(color, t.neon ? 0.07 : 0.06), borderStartWidth: 3, borderStartColor: color } : null,
      ]}>
      {video ? <VideoSheet video={video} name={ex.name} visible={watching} onClose={() => setWatching(false)} /> : null}
      {up ? (
        <InfoPopup
          visible={why}
          onClose={() => setWhy(false)}
          title={<T w="bold" style={{ fontSize: 16, color: t.okText }}>{`زوّد ${weightStep} كجم`}</T>}
          body={`آخر مرة وصلت ${ex.repHigh} تكرار في كل المجموعات، فالوزن بقى خفيف عليك. زوّده ${weightStep} كجم المرة دي.`}
        />
      ) : null}

      <View style={[s.head, allDone && !open ? { opacity: 0.6 } : null]}>
        {/* Tapping the name opens this exercise (the tag, tip and video buttons beside it keep their own taps). */}
        <Pressable
          onPress={open ? undefined : onOpen}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`${ex.name}، ${doneCount} من ${ex.sets} مجموعات`}
          hitSlop={{ top: 7, bottom: 7 }}
          style={s.title}>
          <View style={[s.num, { backgroundColor: tint(color, t.neon ? 0.16 : 0.2), boxShadow: glow(t, color, 6) }]}>
            <T w="numBold" style={{ fontSize: 11, color: t.neon ? color : t.fg }}>{index + 1}</T>
          </View>
          <T w="num" style={{ fontSize: 14.5, flexShrink: 1 }} numberOfLines={1}>{ex.name}</T>
          {/* Closed rows show the range in each set box already. */}
          {open ? <T w="num" style={{ fontSize: 11.5, color: t.mute }} numberOfLines={1}>{iso(`${ex.sets} × ${range}`)}</T> : null}
          {ex.perLeg ? <T style={{ fontSize: 11, color: t.mute }} numberOfLines={1}>لكل رجل</T> : null}
        </Pressable>
        <TagBadge tag={ex.tag} />
        {up ? (
          <Pressable onPress={() => setWhy(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`زوّد ${weightStep} كجم، اعرف ليه`} style={[s.up, { backgroundColor: t.okSoft }]}>
            <T w="semi" style={{ fontSize: 11, color: t.okText }}>{`${iso(`+${weightStep}`)} ↑`}</T>
          </Pressable>
        ) : null}
        {video ? (
          <Pressable
            onPress={() => setWatching(true)}
            accessibilityRole="button"
            accessibilityLabel={`فيديو الوضعية الصحيحة لـ ${ex.name}`}
            hitSlop={9}
            style={({ pressed }) => [s.play, { borderColor: tint(t.ok, 0.5), boxShadow: glow(t, t.ok, 6), opacity: pressed ? 0.6 : 1 }]}>
            <Ionicons name="play" size={12} color={t.okText} />
          </Pressable>
        ) : null}
        <T w="numBold" style={{ fontSize: 12.5, minWidth: 30, textAlign: 'center', color: doneCount ? t.fg : t.mute }}>{iso(`${doneCount} / ${ex.sets}`)}</T>
      </View>

      {open ? (
        <View style={s.sets}>
          {rows.map((r, i) => {
            const pv = last?.[i];
            const lastSet = i === ex.sets - 1 && (ex.tag === 'fail' || ex.tag === 'drop');
            const inputStyle = [s.input, { backgroundColor: r.done ? t.okSoft : t.soft, color: t.fg, borderColor: r.done && t.neon ? tint(t.ok, 0.35) : 'transparent' }];
            return (
              <View key={i} style={s.row}>
                <T w={lastSet ? 'numBold' : 'numRegular'} style={[s.c0, { color: lastSet ? t.fg : t.mute }]}>{i + 1}</T>
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
                  placeholder={pv?.reps != null ? String(pv.reps) : iso(range)}
                  placeholderTextColor={t.mute}
                  keyboardType="number-pad"
                  accessibilityLabel={`التكرارات مجموعة ${i + 1}`}
                />
                <Check compact on={r.done} onPress={() => toggle(i)} label={`خلصت مجموعة ${i + 1}`} />
              </View>
            );
          })}
        </View>
      ) : (
        <View style={s.boxes}>
          {rows.map((r, i) => {
            const pv = last?.[i];
            const kg = r.kg || (pv?.kg != null ? String(pv.kg) : '');
            const reps = r.reps || range;
            const text = kg ? `${kg} × ${reps}` : reps; // no weight yet: just the target reps
            return (
              <Pressable
                key={i}
                onPress={() => toggle(i)}
                hitSlop={{ top: 8, bottom: 8 }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: r.done }}
                accessibilityLabel={`مجموعة ${i + 1}: ${kg ? `${kg} كجم × ` : ''}${reps}`}
                style={({ pressed }) => [
                  s.box,
                  { backgroundColor: r.done ? t.okSoft : t.soft, borderColor: r.done ? tint(t.ok, t.neon ? 0.45 : 0.6) : 'transparent', opacity: pressed ? 0.7 : 1 },
                ]}>
                <T w="num" style={{ fontSize: 12, color: r.done ? t.fg : t.mute, flexShrink: 1 }} numberOfLines={1} adjustsFontSizeToFit>
                  {iso(text)}
                </T>
                <T w="bold" style={{ fontSize: 12, color: r.done ? t.okText : t.mute }}>{r.done ? '✓' : '○'}</T>
              </Pressable>
            );
          })}
          {/* Short exercises keep boxes the same width as the rest. */}
          {Array.from({ length: Math.max(0, 3 - rows.length) }, (_, i) => (
            <View key={`pad${i}`} style={{ flex: 1 }} />
          ))}
        </View>
      )}
    </View>
  );
}

// Tight layout: 28–36pt rows; small buttons keep 44pt touch targets through hitSlop.
const s = StyleSheet.create({
  wrap: { paddingHorizontal: 10, paddingVertical: 7 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 30 },
  num: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 7 },
  up: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1 },
  play: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  sets: { gap: 4, marginTop: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  c0: { width: 16, textAlign: 'center', fontSize: 11 },
  cin: { flex: 1, minWidth: 0 },
  input: { fontFamily: F.num, fontSize: 14.5, textAlign: 'center', paddingVertical: 5, minHeight: 32, borderRadius: 9, borderWidth: 1, writingDirection: 'ltr' },
  boxes: { flexDirection: 'row', gap: 5, marginTop: 5 },
  box: { flex: 1, minWidth: 0, height: 28, borderRadius: 8, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, gap: 4 },
});
