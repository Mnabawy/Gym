import React, { useState } from 'react';
import { Animated, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { SetEntry } from '../lib/logic';
import { usePop } from '../lib/motion';
import { iso, RIR, rirAr, suggest, type Row } from '../lib/setRows';
import { glow, tint, useTheme, font } from '../theme';
import { INPUT, T } from './ui';
import { Swipe, type SwipeAction } from './Swipe';

export type Input = React.ComponentRef<typeof TextInput>;

/** An opaque card background with an optional wash on top (what the row shows), so a swiped row hides its actions. */
export function Under({ color, style, children }: { color?: string; style?: React.ComponentProps<typeof View>['style']; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ backgroundColor: t.card }}>
      <View style={[{ backgroundColor: color }, style]}>{children}</View>
    </View>
  );
}

/** Small outlined button on the open exercise's second line (swap, plates, note). */
export function MetaChip({ icon, label, a11y, on, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; label?: string; a11y: string; on?: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={CHIP_SLOP}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={({ pressed }) => [s.chip, { borderColor: on ? t.warn : t.line, backgroundColor: on ? t.warnSoft : undefined, opacity: pressed ? 0.6 : 1 }]}>
      <Ionicons name={icon} size={11} color={on ? t.warn : t.mute} />
      {label ? <T style={{ fontSize: 10.5, color: on ? t.warn : t.mute }}>{label}</T> : null}
    </Pressable>
  );
}

/** ✓ at the end of a set row: filled once done. On the selected set it's outlined until then (the next thing to press). */
export function Tick({ on, primary, onPress, label }: { on: boolean; primary?: boolean; onPress: () => void; label: string }) {
  const t = useTheme();
  const pop = usePop(on, 0.8);
  return (
    <Pressable onPress={onPress} hitSlop={{ top: 7, bottom: 7, left: 5, right: 5 }} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={label}>
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
export function Field({ value, unit, label, decimal, error, autoFocus, inputRef, onChange, onStep }: {
  value: string;
  unit: string;
  label: string;
  decimal?: boolean;
  /** Empty when you tried to tick the set: red border. */
  error?: boolean;
  autoFocus?: boolean;
  inputRef?: React.Ref<Input>;
  onChange: (v: string) => void;
  onStep: (dir: -1 | 1) => void;
}) {
  const t = useTheme();
  const [focus, setFocus] = useState(false);
  const btn = (dir: -1 | 1) => (
    <Pressable
      onPress={() => onStep(dir)}
      hitSlop={{ top: 7, bottom: 7 }}
      accessibilityRole="button"
      accessibilityLabel={`${dir > 0 ? 'زوّد' : 'قلّل'} ${label}`}
      style={({ pressed }) => [s.fbtn, { opacity: pressed ? 0.5 : 1 }]}>
      <Ionicons name={dir > 0 ? 'add' : 'remove'} size={16} color={t.fg} />
    </Pressable>
  );
  return (
    <View
      style={[
        s.fld,
        {
          backgroundColor: error ? tint(t.bad, 0.1) : t.soft,
          borderColor: error ? t.bad : focus ? t.ok : 'transparent',
          boxShadow: error ? glow(t, t.bad, 8) : focus ? glow(t, t.ok, 8) : undefined,
        },
      ]}>
      {btn(-1)}
      <TextInput
        ref={inputRef}
        autoFocus={autoFocus}
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
        style={[INPUT, s.fin, { color: t.fg }]}
      />
      <T style={{ fontSize: 9.5, color: t.mute }}>{unit}</T>
      {btn(1)}
    </View>
  );
}

/** Closed card: one small box per set (tap to tick), showing its numbers or the target reps. */
export function SetBoxes({ rows, last, range, onToggle }: { rows: Row[]; last: SetEntry[] | undefined; range: string; onToggle: (i: number) => void }) {
  const t = useTheme();
  return (
    <View style={s.boxes}>
      {rows.map((r, i) => {
        const v = r.done ? r : suggest(i, rows, last);
        const reps = r.done && r.reps ? r.reps : range;
        const text = v.kg ? `${v.kg} × ${reps}` : reps; // no weight yet: just the target reps
        return (
          <Pressable
            key={i}
            onPress={() => onToggle(i)}
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
  );
}

/** Asked after a set is ticked (settings askRir): how many reps were left. */
export function RirAsk({ at, color, onPick, onClose }: { at: number; color: string; onPick: (n: number) => void; onClose: () => void }) {
  const t = useTheme();
  return (
    <View style={s.rir}>
      <T style={{ fontSize: 11.5, color: t.mute }}>{`مجموعة ${at + 1}: كان فاضل كام تكرار؟`}</T>
      <View style={{ flexDirection: 'row', gap: 5 }}>
        {RIR.map((n) => (
          <Pressable
            key={n}
            onPress={() => onPick(n)}
            hitSlop={{ top: 8, bottom: 8 }}
            accessibilityRole="button"
            accessibilityLabel={n === 0 ? 'وصلت للفشل' : n >= 4 ? 'فاضل 4 أو أكتر' : `فاضل ${n}`}
            style={({ pressed }) => [s.rirBtn, { backgroundColor: t.soft, borderColor: tint(color, 0.5), opacity: pressed ? 0.6 : 1 }]}>
            <T w="numBold" style={{ fontSize: 13 }}>{n >= 4 ? '+4' : String(n)}</T>
          </Pressable>
        ))}
        <Pressable onPress={onClose} hitSlop={{ top: 8, bottom: 8 }} accessibilityRole="button" accessibilityLabel="مش عايز أسجّل" style={({ pressed }) => [s.rirBtn, { borderColor: 'transparent', opacity: pressed ? 0.6 : 1 }]}>
          <Ionicons name="close" size={15} color={t.mute} />
        </Pressable>
      </View>
    </View>
  );
}

/** A set row that isn't selected: its numbers (tap to edit them), its RIR once answered, and ✓. Swipe: tick / untick, empty. */
export function SetLine({ i, row, shown, range, wash, start, end, onSelect, onToggle, hint }: {
  i: number;
  /** «آخر مرة 60×8 · أعلى 65 كجم» under the set (setHint in setRows.ts). */
  hint?: string;
  row: Row;
  /** What it shows: the row once done, else the suggested values. */
  shown: { kg: string; reps: string };
  range: string;
  wash?: string;
  start: SwipeAction[];
  end: SwipeAction[];
  onSelect: () => void;
  onToggle: () => void;
}) {
  const t = useTheme();
  const cell = [s.cell, row.done ? null : { backgroundColor: t.soft }];
  const txt = { fontSize: 14, color: row.done ? t.fg : t.mute, opacity: row.done ? 1 : 0.7 };
  return (
    <Swipe style={s.swipe} start={start} end={end}>
    <Under color={wash}>
    <View style={[s.srow, { borderColor: 'transparent', backgroundColor: row.done ? tint(t.ok, 0.07) : 'transparent' }]}>
      {/* Tap the numbers to edit this set. */}
      <Pressable
        onPress={onSelect}
        accessibilityRole="button"
        accessibilityLabel={`مجموعة ${i + 1}: ${shown.kg ? `${shown.kg} كجم، ` : ''}${shown.reps || range} تكرار، دوس تعدّلها`}
        style={({ pressed }) => [s.cells, { opacity: pressed ? 0.6 : 1 }]}>
        <T w="numBold" style={[s.sn, { color: t.mute }]}>{i + 1}</T>
        <View style={cell}><T w="numBold" style={txt}>{shown.kg || '–'}</T></View>
        <View style={cell}>
          <T w="numBold" style={txt}>
            {iso(shown.reps || range)}
            {row.done && row.rir != null ? <T style={{ fontSize: 10.5, color: t.mute }}>{`  ${rirAr(row.rir)}`}</T> : null}
          </T>
        </View>
      </Pressable>
      <Tick on={row.done} onPress={onToggle} label={`${row.done ? 'رجّع' : 'خلصت'} مجموعة ${i + 1}`} />
    </View>
    {hint ? <SetHint text={hint} /> : null}
    </Under>
    </Swipe>
  );
}

/** Auto progression chip (progressChip in progression.ts): «+2.5 ↑», «+1 تكرار», «خفّف ↓»; tap for why. */
export function TipChip({ label, a11y, onPress }: { label: string; a11y: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={CHIP_SLOP} accessibilityRole="button" accessibilityLabel={a11y} style={[s.chip, { borderColor: tint(t.ok, 0.5), backgroundColor: t.neon ? undefined : t.okSoft }]}>
      <T w="semi" style={{ fontSize: 10.5, color: t.okText }}>{label.replace(/[+\d.]+/, (n) => iso(n))}</T>
    </Pressable>
  );
}

/** The form video chip on the open exercise. */
export function VideoChip({ exName, onPress }: { exName: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={CHIP_SLOP}
      accessibilityRole="button"
      accessibilityLabel={`فيديو الوضعية الصحيحة لـ ${exName}`}
      style={({ pressed }) => [s.chip, { borderColor: tint(t.ok, 0.5), boxShadow: glow(t, t.ok, 6), opacity: pressed ? 0.6 : 1 }]}>
      <Ionicons name="play" size={10} color={t.okText} />
      <T style={{ fontSize: 10.5, color: t.okText }}>فيديو</T>
    </Pressable>
  );
}

// Tight layout: 44pt set rows (30pt controls + 7pt hitSlop each side; Swipe clips touches to the row); small buttons keep 44pt touch targets through hitSlop.
/** Meta chips: 28pt tall + 8 above and below = 44pt; rows of chips are 44pt apart (28 + 16 gap) so wrapped rows don't steal each other's taps. */
export const CHIP_SLOP = { top: 8, bottom: 8, left: 3, right: 3 };
const s = StyleSheet.create({
  swipe: { borderRadius: 10, overflow: 'hidden' },
  srow: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 44, borderRadius: 10, borderWidth: 1, paddingHorizontal: 4 },
  cells: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'stretch' },
  sn: { width: 18, textAlign: 'center', fontSize: 12 },
  cell: { flex: 1, minWidth: 0, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  rir: { gap: 4, marginTop: 6 },
  rirBtn: { flex: 1, height: 30, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 1, borderRadius: 999, paddingHorizontal: 7, height: 28 },
  fld: { flex: 1, minWidth: 0, height: 30, borderRadius: 8, borderWidth: 1, flexDirection: 'row', alignItems: 'center' },
  fbtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  fin: { flex: 1, minWidth: 0, ...font('numBold'), fontSize: 14, textAlign: 'center', writingDirection: 'ltr', padding: 0, margin: 0, height: 28, includeFontPadding: false, outlineWidth: 0 },
  tick: { width: 40, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  boxes: { flexDirection: 'row', gap: 5, marginTop: 5 },
  box: { flex: 1, minWidth: 0, height: 28, borderRadius: 8, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, gap: 4 },
});

/** The small grey line under a set: last time's numbers for it and its heaviest ever. */
export function SetHint({ text }: { text: string }) {
  const t = useTheme();
  return <T w="num" style={{ fontSize: 11, color: t.mute, marginStart: 27, marginTop: -2, marginBottom: 2 }} numberOfLines={1}>{iso(text)}</T>;
}
