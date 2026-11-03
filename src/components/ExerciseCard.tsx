import React, { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import type { Exercise } from '../data/program';
import { MUSCLE_AR } from '../data/program';
import { TAG_INFO } from '../data/rules';
import { parseNum, shouldIncrease, type SetEntry } from '../lib/logic';
import { storage } from '../lib/storage';
import { useTimer, tap } from '../lib/timer';
import { F, useTheme } from '../theme';
import { Card, TagBadge, T } from './ui';

type Props = { ex: Exercise; index: number; date: string; weekday: number; onChange: () => void };
type Row = { kg: string; reps: string; done: boolean };

const toRow = (s?: SetEntry): Row => ({ kg: s?.kg != null ? String(s.kg) : '', reps: s?.reps != null ? String(s.reps) : '', done: !!s?.done });

export function ExerciseCard({ ex, index, date, weekday, onChange }: Props) {
  const t = useTheme();
  const color = t.muscle[ex.muscle];
  const start = useTimer((s) => s.start);
  // Parent remounts this card (key) when date or data version changes, so storage is read once per mount.
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
    if (r.done) start(ex.restSec, ex.name);
    onChange();
  };

  const allDone = rows.length > 0 && rows.every((r) => r.done);
  const up = shouldIncrease(ex, last);
  const range = `${ex.repLow}–${ex.repHigh}`;

  return (
    <Card color={color} style={allDone ? { opacity: 0.75 } : undefined}>
      <View style={s.head}>
        <T style={{ color: t.mute, fontSize: 12, width: 16, paddingTop: 3 }} w="numRegular">{index + 1}</T>
        <View style={{ flex: 1, gap: 4 }}>
          <T w="num" style={{ fontSize: 16.5 }}>{ex.name}</T>
          <View style={s.meta}>
            <View style={s.mus}>
              <View style={[s.dot, { backgroundColor: color }]} />
              <T style={{ color: t.mute, fontSize: 13 }}>{MUSCLE_AR[ex.muscle]}</T>
            </View>
            <T w="numBold" style={{ fontSize: 14 }}>{`\u2066${ex.sets} × ${range}\u2069`}</T>
            {ex.perLeg ? <T style={{ color: t.mute, fontSize: 13 }}>لكل رجل</T> : null}
            <TagBadge tag={ex.tag} />
            <T style={{ color: t.mute, fontSize: 13 }}>{ex.tag === 'heavy' ? 'راحة 2–3 د' : 'راحة 1–2 د'}</T>
          </View>
        </View>
      </View>

      {up ? (
        <View style={[s.hint, { backgroundColor: t.okSoft }]}>
          <T w="medium" style={{ color: t.ok, fontSize: 13 }}>{`آخر مرة وصلت ${ex.repHigh} تكرار في كل المجموعات. زوّد الوزن 2.5 كجم ↑`}</T>
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
          const inputStyle = [s.input, { backgroundColor: r.done ? t.okSoft : t.soft, borderColor: r.done ? 'transparent' : t.line, color: t.fg }];
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
                placeholder={pv?.reps != null ? String(pv.reps) : range}
                placeholderTextColor={t.mute}
                keyboardType="number-pad"
                accessibilityLabel={`التكرارات مجموعة ${i + 1}`}
              />
              <Pressable
                onPress={() => toggle(i)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: r.done }}
                accessibilityLabel={`خلصت مجموعة ${i + 1}`}
                style={[s.c3, s.chk, { backgroundColor: r.done ? t.ok : t.card, borderColor: r.done ? t.ok : t.line }]}>
                <T w="bold" style={{ color: r.done ? '#fff' : t.mute, fontSize: 18 }}>✓</T>
              </Pressable>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', gap: 10, paddingHorizontal: 13, paddingTop: 11, paddingBottom: 8 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  mus: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  hint: { marginHorizontal: 13, marginBottom: 8, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5 },
  sets: { paddingHorizontal: 13, paddingBottom: 12, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  c0: { width: 28, textAlign: 'center' },
  cin: { flex: 1, minWidth: 0 },
  c3: { width: 48 },
  input: { fontFamily: F.num, fontSize: 17, textAlign: 'center', paddingVertical: 9, borderWidth: 1, borderRadius: 10, writingDirection: 'ltr' },
  chk: { height: 44, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
