import React, { useState } from 'react';
import { Animated, Keyboard, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { Exercise } from '../data/program';
import { FORM_VIDEOS } from '../data/videos';
import { bestE1rm, parseNum, shouldIncrease, type SetEntry } from '../lib/logic';
import { usePop } from '../lib/motion';
import { storage } from '../lib/storage';
import { useSettings } from '../lib/settings';
import { useTimer, tap } from '../lib/timer';
import { F, glow, tint, useTheme } from '../theme';
import { InfoPopup, TagBadge, T } from './ui';
import { VideoSheet } from './VideoSheet';

type Props = {
  ex: Exercise;
  index: number;
  date: string;
  weekday: number;
  /** Open: one row per set. Closed: one small box per set (tap to tick), or a summary line once all are done. */
  open: boolean;
  onOpen: () => void;
  /** First row in the list: no divider above it. */
  first: boolean;
  /** `finished`: the open exercise's last set was just ticked, so the list can move on to the next exercise. */
  onChange: (finished: boolean) => void;
};
type Row = { kg: string; reps: string; done: boolean };
/** What the selected set's fields show, and for which set (`at`). */
type Draft = { at: number; kg: string; reps: string };

const toRow = (s?: SetEntry): Row => ({ kg: s?.kg != null ? String(s.kg) : '', reps: s?.reps != null ? String(s.reps) : '', done: !!s?.done });
const iso = (s: string) => `⁦${s}⁩`;
const fmt = (n: number) => String(Math.round(n * 100) / 100);

/** The set you're on: the first one not done; once all are done, the last one. */
const lineAt = (rows: Row[]) => {
  const i = rows.findIndex((r) => !r.done);
  return i === -1 ? rows.length - 1 : i;
};

/**
 * Values to start set i with: what's saved for it, else weight from the set before it today and reps from the same set
 * last time (falling back to the other), so most sets are just ✓.
 */
function suggest(i: number, rows: Row[], last: SetEntry[] | undefined): Draft {
  const r = rows[i];
  const prev = rows[i - 1];
  const pv = last?.[i] ?? last?.[last.length - 1];
  const pk = pv?.kg != null ? String(pv.kg) : '';
  const pr = pv?.reps != null ? String(pv.reps) : '';
  return { at: i, kg: r?.kg || prev?.kg || pk, reps: r?.reps || pr || prev?.reps || '' };
}

/**
 * One exercise in the workout list (docs/mockups/next-set.html, v7). Open: the name on its own line, its buttons
 * (tag, add-weight tip, video) on a small line under it, then one row per set. Done sets keep their numbers; the
 * selected set (outlined) has − / + and takes any typed number; tap another row to edit it. ✓ on any row ticks or
 * unticks it, and ticking starts the rest. Closed: small set boxes; finished: one summary line.
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
  // Best estimated 1RM before today, for the "new record" badge on the summary line.
  const [prevBest] = useState(() =>
    storage
      .history(ex.id)
      .filter((h) => h.date < date)
      .reduce((m, h) => Math.max(m, bestE1rm(h.sets.filter((x) => x.done))), 0),
  );
  // The set being edited: the one you tapped, else the one you're on.
  const [picked, setPicked] = useState<number | null>(null);
  const [draftState, setDraft] = useState<Draft>(() => suggest(lineAt(rows), rows, last));
  const [watching, setWatching] = useState(false);
  const [why, setWhy] = useState(false);

  const doneCount = rows.filter((r) => r.done).length;
  const allDone = rows.length > 0 && doneCount === rows.length;
  const sel = picked != null && picked < rows.length ? picked : lineAt(rows);
  const draft = draftState.at === sel ? draftState : suggest(sel, rows, last);

  const save = (i: number, r: Row) => {
    storage.saveSet({ date, weekday, exId: ex.id, idx: i, kg: parseNum(r.kg), reps: parseNum(r.reps), done: r.done ? 1 : 0 });
  };
  const put = (i: number, r: Row) => {
    const next = [...rows];
    next[i] = r;
    setRows(next);
    save(i, r);
    return next;
  };

  const select = (i: number) => {
    if (i === sel) return;
    setPicked(i);
    setDraft(suggest(i, rows, last));
  };

  /** Typing or − / + on the selected set. Saved right away (a done set stays done), so nothing is lost if you leave. */
  const setField = (field: 'kg' | 'reps', v: string) => {
    setDraft({ ...draft, [field]: v });
    put(sel, { ...rows[sel], [field]: v });
  };
  const step = (field: 'kg' | 'reps', dir: -1 | 1) => {
    const n = parseNum(draft[field]);
    const by = field === 'kg' ? weightStep : 1;
    // Empty reps start from the bottom of the range; empty weight from one step.
    const v = n == null ? (field === 'reps' ? ex.repLow : dir > 0 ? by : 0) : Math.max(0, n + dir * by);
    setField(field, fmt(v));
  };

  /** ✓ on a set (row or box): tick it with the numbers it shows, or take it back. Ticking starts the rest. */
  const toggle = (i: number) => {
    const cur = rows[i];
    const vals = open && i === sel ? draft : suggest(i, rows, last);
    const r: Row = cur.done ? { ...cur, done: false } : { kg: vals.kg, reps: vals.reps, done: true };
    const next = put(i, r);
    Keyboard.dismiss();
    setPicked(null); // back to the set you're on
    setDraft(suggest(lineAt(next), next, last));
    tap();
    if (r.done && autoRest) start(ex.restSec, ex.name);
    onChange(open && r.done && next.every((x) => x.done));
  };

  const up = shouldIncrease(ex, last);
  const range = `${ex.repLow}–${ex.repHigh}`;
  const video = FORM_VIDEOS[ex.id];
  const summary = allDone && !open;
  const doneSets: SetEntry[] = rows.filter((r) => r.done).map((r) => ({ kg: parseNum(r.kg), reps: parseNum(r.reps), done: true }));
  const record = summary && prevBest > 0 && bestE1rm(doneSets) > prevBest;
  const line = doneSets.map((s) => (s.kg ? `${fmt(s.kg)}×${s.reps ?? '–'}` : `${s.reps ?? '–'}`)).join(' · ');
  const ink = t.neon ? color : t.fg;

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

      <View style={s.head}>
        {/* Tapping the name opens this exercise. Open, the name has the line to itself (its buttons go on the line under it). */}
        <Pressable
          onPress={open ? undefined : onOpen}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`${ex.name}، ${doneCount} من ${ex.sets} مجموعات`}
          hitSlop={{ top: 7, bottom: 7 }}
          style={s.title}>
          <View style={[s.num, { backgroundColor: tint(color, t.neon ? 0.16 : 0.2), boxShadow: glow(t, color, 6) }]}>
            <T w="numBold" style={{ fontSize: 11, color: ink }}>{index + 1}</T>
          </View>
          <T w="num" style={{ fontSize: open ? 13 : 14.5, flexShrink: summary ? 0 : 1 }} numberOfLines={1}>{ex.name}</T>
          {summary ? (
            <>
              <T w="bold" style={{ fontSize: 14, color: t.okText }}>✓</T>
              <T w="num" style={{ flexShrink: 1, fontSize: 12, color: t.mute }} numberOfLines={1}>{iso(line)}</T>
            </>
          ) : null}
        </Pressable>
        {record ? (
          <View style={[s.pr, { boxShadow: t.neon ? '0 0 8px rgba(255,197,61,0.5)' : undefined }]}>
            <T w="bold" style={{ fontSize: 10.5, color: '#1A1200' }}>🏆 رقم جديد</T>
          </View>
        ) : null}
        {open || summary ? null : <TagBadge tag={ex.tag} />}
        {summary ? null : (
          <T w="numBold" style={{ fontSize: 12.5, minWidth: 30, textAlign: 'center', color: doneCount ? t.fg : t.mute }}>{iso(`${doneCount} / ${ex.sets}`)}</T>
        )}
      </View>

      {open ? (
        <>
          <View style={s.meta}>
            <TagBadge tag={ex.tag} />
            {up ? (
              <Pressable onPress={() => setWhy(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`زوّد ${weightStep} كجم، اعرف ليه`} style={[s.chip, { borderColor: tint(t.ok, 0.5), backgroundColor: t.neon ? undefined : t.okSoft }]}>
                <T w="semi" style={{ fontSize: 10.5, color: t.okText }}>{`${iso(`+${weightStep}`)} ↑`}</T>
              </Pressable>
            ) : null}
            {video ? (
              <Pressable
                onPress={() => setWatching(true)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`فيديو الوضعية الصحيحة لـ ${ex.name}`}
                style={({ pressed }) => [s.chip, { borderColor: tint(t.ok, 0.5), boxShadow: glow(t, t.ok, 6), opacity: pressed ? 0.6 : 1 }]}>
                <Ionicons name="play" size={10} color={t.okText} />
                <T style={{ fontSize: 10.5, color: t.okText }}>فيديو</T>
              </Pressable>
            ) : null}
            <T style={{ marginStart: 'auto', fontSize: 10.5, color: t.mute }} numberOfLines={1}>
              {`تكرار ${iso(range)}${ex.perLeg ? ' · لكل رجل' : ''}`}
            </T>
          </View>

          <View style={s.sets}>
            {rows.map((r, i) => {
              if (i === sel) {
                return (
                  <View key={i} style={[s.srow, { borderColor: color, backgroundColor: tint(color, 0.08), boxShadow: t.neon ? glow(t, color, 8) : undefined }]}>
                    <T w="numBold" style={[s.sn, { color: ink }]}>{i + 1}</T>
                    <Field value={draft.kg} unit="كجم" decimal label={`الوزن مجموعة ${i + 1}`} onChange={(v) => setField('kg', v)} onStep={(d) => step('kg', d)} />
                    <Field value={draft.reps} unit="تكرار" label={`التكرارات مجموعة ${i + 1}`} onChange={(v) => setField('reps', v)} onStep={(d) => step('reps', d)} />
                    <Tick on={r.done} primary onPress={() => toggle(i)} label={`${r.done ? 'رجّع' : 'خلصت'} مجموعة ${i + 1}`} />
                  </View>
                );
              }
              const v = r.done ? r : suggest(i, rows, last);
              const cell = [s.cell, r.done ? null : { backgroundColor: t.soft }];
              const txt = { fontSize: 14, color: r.done ? t.fg : t.mute, opacity: r.done ? 1 : 0.7 };
              return (
                <View key={i} style={[s.srow, { borderColor: 'transparent', backgroundColor: r.done ? tint(t.ok, 0.07) : 'transparent' }]}>
                  {/* Tap the numbers to edit this set. */}
                  <Pressable
                    onPress={() => select(i)}
                    accessibilityRole="button"
                    accessibilityLabel={`مجموعة ${i + 1}: ${v.kg ? `${v.kg} كجم، ` : ''}${v.reps || range} تكرار، دوس تعدّلها`}
                    style={({ pressed }) => [s.cells, { opacity: pressed ? 0.6 : 1 }]}>
                    <T w="numBold" style={[s.sn, { color: t.mute }]}>{i + 1}</T>
                    <View style={cell}><T w="numBold" style={txt}>{v.kg || '–'}</T></View>
                    <View style={cell}><T w="numBold" style={txt}>{iso(v.reps || range)}</T></View>
                  </Pressable>
                  <Tick on={r.done} onPress={() => toggle(i)} label={`${r.done ? 'رجّع' : 'خلصت'} مجموعة ${i + 1}`} />
                </View>
              );
            })}
          </View>
        </>
      ) : summary ? null : (
        <View style={s.boxes}>
          {rows.map((r, i) => {
            const v = r.done ? r : suggest(i, rows, last);
            const reps = r.done && r.reps ? r.reps : range;
            const text = v.kg ? `${v.kg} × ${reps}` : reps; // no weight yet: just the target reps
            return (
              <Pressable
                key={i}
                onPress={() => toggle(i)}
                hitSlop={{ top: 8, bottom: 8 }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: r.done }}
                accessibilityLabel={`مجموعة ${i + 1}: ${v.kg ? `${v.kg} كجم × ` : ''}${reps}`}
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

/** ✓ at the end of a set row: filled once done. On the selected set it's outlined until then (the next thing to press). */
function Tick({ on, primary, onPress, label }: { on: boolean; primary?: boolean; onPress: () => void; label: string }) {
  const t = useTheme();
  const pop = usePop(on, 0.8);
  return (
    <Pressable onPress={onPress} hitSlop={6} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={label}>
      <Animated.View
        style={[
          s.tick,
          on ? { backgroundColor: t.ok, boxShadow: glow(t, t.ok, 8) } : primary ? { borderWidth: 1.5, borderColor: t.ok } : { backgroundColor: t.soft },
          { transform: [{ scale: pop }] },
        ]}>
        <T w="bold" style={{ fontSize: 16, lineHeight: 20, color: on ? t.onOk : primary ? t.okText : t.mute }}>✓</T>
      </Animated.View>
    </Pressable>
  );
}

/** Weight or reps on the selected set: − value unit + . Tap the number to type any value (it's selected, so typing replaces it). */
function Field({ value, unit, label, decimal, onChange, onStep }: { value: string; unit: string; label: string; decimal?: boolean; onChange: (v: string) => void; onStep: (dir: -1 | 1) => void }) {
  const t = useTheme();
  const [focus, setFocus] = useState(false);
  const btn = (dir: -1 | 1) => (
    <Pressable
      onPress={() => onStep(dir)}
      hitSlop={{ top: 6, bottom: 6 }}
      accessibilityRole="button"
      accessibilityLabel={`${dir > 0 ? 'زوّد' : 'قلّل'} ${label}`}
      style={({ pressed }) => [s.fbtn, { opacity: pressed ? 0.5 : 1 }]}>
      <Ionicons name={dir > 0 ? 'add' : 'remove'} size={16} color={t.fg} />
    </Pressable>
  );
  return (
    <View style={[s.fld, { backgroundColor: t.soft, borderColor: focus ? t.ok : 'transparent', boxShadow: focus ? glow(t, t.ok, 8) : undefined }]}>
      {btn(-1)}
      <TextInput
        value={value}
        onChangeText={(v) => onChange(v.replace(/[^0-9.,٠-٩۰-۹٫]/g, ''))}
        placeholder="–"
        placeholderTextColor={t.mute}
        keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
        selectTextOnFocus
        maxLength={6}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        accessibilityLabel={label}
        style={[s.fin, { color: t.fg }]}
      />
      <T style={{ fontSize: 9.5, color: t.mute }}>{unit}</T>
      {btn(1)}
    </View>
  );
}

// Tight layout: 36pt set rows; small buttons keep 44pt touch targets through hitSlop.
const s = StyleSheet.create({
  wrap: { paddingHorizontal: 10, paddingVertical: 7 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 30 },
  num: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 7 },
  pr: { backgroundColor: '#FFC53D', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 1, borderRadius: 999, paddingHorizontal: 7, height: 19 },
  sets: { gap: 4, marginTop: 6 },
  srow: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 36, borderRadius: 10, borderWidth: 1, paddingHorizontal: 4 },
  cells: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'stretch' },
  sn: { width: 18, textAlign: 'center', fontSize: 12 },
  cell: { flex: 1, minWidth: 0, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  fld: { flex: 1, minWidth: 0, height: 30, borderRadius: 8, borderWidth: 1, flexDirection: 'row', alignItems: 'center' },
  fbtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  fin: { flex: 1, minWidth: 0, fontFamily: F.numBold, fontSize: 14, textAlign: 'center', writingDirection: 'ltr', padding: 0, margin: 0, height: 28, includeFontPadding: false, outlineWidth: 0 },
  tick: { width: 40, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  boxes: { flexDirection: 'row', gap: 5, marginTop: 5 },
  box: { flex: 1, minWidth: 0, height: 28, borderRadius: 8, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, gap: 4 },
});
