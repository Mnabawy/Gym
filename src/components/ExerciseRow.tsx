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
  /** Open: one line for the set you're on. Closed: one small box per set (tap to tick), or a summary line once all are done. */
  open: boolean;
  onOpen: () => void;
  /** First row in the list: no divider above it. */
  first: boolean;
  /** `finished`: the line's ✓ just ticked the last set, so the list can move on to the next exercise. */
  onChange: (finished: boolean) => void;
};
type Row = { kg: string; reps: string; done: boolean };
/** What the line shows, and for which set (`at`). */
type Draft = { at: number; kg: string; reps: string };

const toRow = (s?: SetEntry): Row => ({ kg: s?.kg != null ? String(s.kg) : '', reps: s?.reps != null ? String(s.reps) : '', done: !!s?.done });
const iso = (s: string) => `⁦${s}⁩`;
const fmt = (n: number) => String(Math.round(n * 100) / 100);

/** The set the line is on: the first one not done; once all are done, the last one (so ✓ can take it back). */
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
 * One exercise in the workout list (docs/mockups/next-set.html). Open: a header and ONE line — set counter, weight,
 * reps, ✓. Weight and reps take any typed number or step with − / +; ✓ logs the set, starts the rest and moves the
 * counter on. Tapping the counter takes the last set back. Closed: small set boxes; finished: one summary line.
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
  const [draftState, setDraft] = useState<Draft>(() => suggest(lineAt(rows), rows, last));
  const [watching, setWatching] = useState(false);
  const [why, setWhy] = useState(false);

  const doneCount = rows.filter((r) => r.done).length;
  const allDone = rows.length > 0 && doneCount === rows.length;
  const at = lineAt(rows);
  // Ticking boxes while closed moves the line to another set; start that one fresh.
  const draft = draftState.at === at ? draftState : suggest(at, rows, last);
  const pop = usePop(`${at}-${allDone}`, 0.8);

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

  /** Typing or − / + on the line. Saved right away, so it's kept if you leave before ticking. */
  const setField = (field: 'kg' | 'reps', v: string) => {
    const d = { ...draft, [field]: v };
    setDraft(d);
    put(at, { ...rows[at], [field]: v });
  };
  const step = (field: 'kg' | 'reps', dir: -1 | 1) => {
    const n = parseNum(draft[field]);
    const by = field === 'kg' ? weightStep : 1;
    // Empty reps start from the bottom of the range; empty weight from one step.
    const v = n == null ? (field === 'reps' ? ex.repLow : dir > 0 ? by : 0) : Math.max(0, n + dir * by);
    setField(field, fmt(v));
  };

  /** Take back the last ticked set: the line goes back to it with its numbers. */
  const undo = () => {
    let i = -1;
    rows.forEach((r, k) => (r.done ? (i = k) : null));
    if (i < 0) return;
    const next = put(i, { ...rows[i], done: false });
    setDraft(suggest(lineAt(next), next, last));
    tap();
    onChange(false);
  };

  /** ✓ on the line: log this set with what's shown, start the rest, move to the next set. */
  const tick = () => {
    if (allDone) return undo();
    Keyboard.dismiss();
    const next = put(at, { kg: draft.kg, reps: draft.reps, done: true });
    setDraft(suggest(lineAt(next), next, last));
    tap();
    if (autoRest) start(ex.restSec, ex.name);
    onChange(next.every((r) => r.done));
  };

  /** Closed rows: tap a box to tick it, weight and reps filled from last time. */
  const toggle = (i: number) => {
    const r = { ...rows[i] };
    const pv = last?.[i];
    if (!r.done) {
      if (!r.kg && pv?.kg != null) r.kg = String(pv.kg);
      if (!r.reps && pv?.reps != null) r.reps = String(pv.reps);
    }
    r.done = !r.done;
    put(i, r);
    tap();
    if (r.done && autoRest) start(ex.restSec, ex.name);
    onChange(false);
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
          <T w="num" style={{ fontSize: 14.5, flexShrink: summary ? 0 : 1 }} numberOfLines={1}>{ex.name}</T>
          {summary ? (
            <>
              <T w="bold" style={{ fontSize: 14, color: t.okText }}>✓</T>
              <T w="num" style={{ flexShrink: 1, fontSize: 12, color: t.mute }} numberOfLines={1}>{iso(line)}</T>
            </>
          ) : ex.perLeg ? (
            <T style={{ fontSize: 11, color: t.mute }} numberOfLines={1}>لكل رجل</T>
          ) : null}
        </Pressable>
        {record ? (
          <View style={[s.pr, { boxShadow: t.neon ? '0 0 8px rgba(255,197,61,0.5)' : undefined }]}>
            <T w="bold" style={{ fontSize: 10.5, color: '#1A1200' }}>🏆 رقم جديد</T>
          </View>
        ) : null}
        {summary ? null : <TagBadge tag={ex.tag} />}
        {open && up ? (
          <Pressable onPress={() => setWhy(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`زوّد ${weightStep} كجم، اعرف ليه`} style={[s.up, { backgroundColor: t.okSoft }]}>
            <T w="semi" style={{ fontSize: 11, color: t.okText }}>{`${iso(`+${weightStep}`)} ↑`}</T>
          </Pressable>
        ) : null}
        {open && video ? (
          <Pressable
            onPress={() => setWatching(true)}
            accessibilityRole="button"
            accessibilityLabel={`فيديو الوضعية الصحيحة لـ ${ex.name}`}
            hitSlop={9}
            style={({ pressed }) => [s.play, { borderColor: tint(t.ok, 0.5), boxShadow: glow(t, t.ok, 6), opacity: pressed ? 0.6 : 1 }]}>
            <Ionicons name="play" size={12} color={t.okText} />
          </Pressable>
        ) : null}
        {open || summary ? null : (
          <T w="numBold" style={{ fontSize: 12.5, minWidth: 30, textAlign: 'center', color: doneCount ? t.fg : t.mute }}>{iso(`${doneCount} / ${ex.sets}`)}</T>
        )}
      </View>

      {open ? (
        <View style={s.line}>
          {/* Set counter: goes up with every ✓. Tap it to take the last set back. */}
          <Pressable
            onPress={undo}
            disabled={!doneCount}
            accessibilityRole="button"
            accessibilityLabel={`مجموعة ${at + 1} من ${ex.sets}${doneCount ? '، دوس ترجّع آخر مجموعة' : ''}`}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <Animated.View
              style={[
                s.ctr,
                allDone
                  ? { backgroundColor: t.okSoft, borderColor: tint(t.ok, 0.5) }
                  : { backgroundColor: tint(color, 0.12), borderColor: tint(color, 0.45) },
                { transform: [{ scale: pop }] },
              ]}>
              <T w="numBold" style={{ fontSize: 15, lineHeight: 18, color: allDone ? t.okText : ink }}>{iso(`${at + 1}/${ex.sets}`)}</T>
              <T style={{ fontSize: 9, lineHeight: 12, color: t.mute }}>{allDone ? 'خلصت' : 'مجموعة'}</T>
            </Animated.View>
          </Pressable>
          <Field
            value={draft.kg}
            unit="كجم"
            decimal
            label={`الوزن مجموعة ${at + 1}`}
            onChange={(v) => setField('kg', v)}
            onStep={(d) => step('kg', d)}
          />
          <Field
            value={draft.reps}
            unit={`تكرار · ${iso(range)}`}
            label={`التكرارات مجموعة ${at + 1}`}
            onChange={(v) => setField('reps', v)}
            onStep={(d) => step('reps', d)}
          />
          <Pressable
            onPress={tick}
            accessibilityRole="button"
            accessibilityLabel={allDone ? 'رجّع آخر مجموعة' : `خلصت مجموعة ${at + 1}`}
            style={({ pressed }) => [
              s.ok,
              allDone
                ? { backgroundColor: t.okSoft, borderWidth: 1, borderColor: tint(t.ok, 0.5) }
                : { backgroundColor: t.ok, boxShadow: glow(t, t.ok, 12) },
              { opacity: pressed ? 0.75 : 1 },
            ]}>
            <T w="bold" style={{ fontSize: 20, lineHeight: 24, color: allDone ? t.okText : t.onOk }}>✓</T>
          </Pressable>
        </View>
      ) : summary ? null : (
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

/** Weight or reps on the line: − value + . Tap the number to type any value (it's selected, so typing replaces it). */
function Field({ value, unit, label, decimal, onChange, onStep }: { value: string; unit: string; label: string; decimal?: boolean; onChange: (v: string) => void; onStep: (dir: -1 | 1) => void }) {
  const t = useTheme();
  const [focus, setFocus] = useState(false);
  const btn = (dir: -1 | 1) => (
    <Pressable
      onPress={() => onStep(dir)}
      accessibilityRole="button"
      accessibilityLabel={`${dir > 0 ? 'زوّد' : 'قلّل'} ${label}`}
      style={({ pressed }) => [s.fbtn, { opacity: pressed ? 0.5 : 1 }]}>
      <Ionicons name={dir > 0 ? 'add' : 'remove'} size={16} color={t.mute} />
    </Pressable>
  );
  return (
    <View
      style={[
        s.fld,
        {
          backgroundColor: t.soft,
          borderColor: focus ? t.ok : t.neon ? tint(t.ok, 0.25) : 'transparent',
          boxShadow: focus ? glow(t, t.ok, 8) : undefined,
        },
      ]}>
      {btn(-1)}
      <View style={s.fv}>
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
        <T style={{ fontSize: 9.5, lineHeight: 12, color: t.mute }} numberOfLines={1}>{unit}</T>
      </View>
      {btn(1)}
    </View>
  );
}

// Tight layout: the line is 44pt (the touch target); header buttons keep 44pt targets through hitSlop.
const s = StyleSheet.create({
  wrap: { paddingHorizontal: 10, paddingVertical: 7 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 30 },
  num: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 7 },
  up: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1 },
  play: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  pr: { backgroundColor: '#FFC53D', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 7 },
  ctr: { width: 46, height: 44, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  fld: { flex: 1, minWidth: 0, height: 44, borderRadius: 11, borderWidth: 1, flexDirection: 'row', alignItems: 'center' },
  fbtn: { width: 26, height: 44, alignItems: 'center', justifyContent: 'center' },
  fv: { flex: 1, minWidth: 0, alignItems: 'center' },
  fin: { fontFamily: F.numBold, fontSize: 17, textAlign: 'center', writingDirection: 'ltr', padding: 0, margin: 0, height: 22, width: '100%', includeFontPadding: false, outlineWidth: 0 },
  ok: { width: 46, height: 44, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  boxes: { flexDirection: 'row', gap: 5, marginTop: 5 },
  box: { flex: 1, minWidth: 0, height: 28, borderRadius: 8, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, gap: 4 },
});
