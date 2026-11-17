import React from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { countAr, SETS } from '../lib/logic';
import { platesFor, warmups } from '../lib/plates';
import { fmt, iso } from '../lib/setRows';
import { tint, useTheme, font } from '../theme';
import { INPUT, Btn, InfoPopup, Sheet, T } from './ui';

/** Swap the exercise for today only (src/data/alternatives.ts); the swapped one lists the original first to go back. */
export function SwapSheet({ visible, onClose, exName, alt, alts, doneCount, onPick }: {
  visible: boolean;
  onClose: () => void;
  /** The program exercise's name. */
  exName: string;
  /** Today's swap, or null. */
  alt: string | null;
  alts: string[];
  doneCount: number;
  onPick: (to: string | null) => void;
}) {
  const t = useTheme();
  return (
    <Sheet visible={visible} onClose={onClose} title="بدّل التمرين النهارده بس" sub={`لو الجهاز مشغول. المجموعات بتتحسب على ${exName} في الحجم والحضور، والأوزان والأرقام بتتقارن بنفس التمرين البديل بس.`}>
      {[...(alt ? [null] : []), ...alts].map((a) => {
        const on = a === alt;
        return (
          <Pressable
            key={a ?? 'orig'}
            onPress={() => onPick(a)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={({ pressed }) => [s.opt, { backgroundColor: on ? t.okSoft : t.soft, opacity: pressed ? 0.7 : 1 }]}>
            <T w="num" style={{ flex: 1, fontSize: 14 }}>{a ?? exName}</T>
            <T style={{ fontSize: 12, color: t.mute }}>{a ? (on ? 'النهارده' : '') : 'رجّع الأصلي'}</T>
          </Pressable>
        );
      })}
      {doneCount ? <T style={{ fontSize: 12, color: t.warn }}>{`سجلت ${countAr(doneCount, SETS)} النهارده. لو بدّلت هتتحسب على التمرين الجديد.`}</T> : null}
    </Sheet>
  );
}

/** Warm-up ramp for heavy lifts, from the first set's weight (`workKg`), with plates per side when it uses a bar. */
export function WarmSheet({ visible, onClose, name, workKg, bar }: { visible: boolean; onClose: () => void; name: string; workKg: number | null; bar: number | null }) {
  const t = useTheme();
  return (
    <Sheet visible={visible} onClose={onClose} title={`إحماء · ${name}`} sub={workKg ? `قبل أول مجموعة (${iso(fmt(workKg))} كجم). راحة دقيقة بينهم، والإحماء مش بيتسجل` : undefined}>
      {!workKg ? (
        <T style={{ color: t.mute }}>اكتب وزن أول مجموعة الأول.</T>
      ) : (
        warmups(workKg, bar).map((w, i) => {
          const load = bar != null ? platesFor(w.kg, bar) : null;
          return (
            <View key={i} style={[s.opt, { backgroundColor: t.soft }]}>
              <T w="numBold" style={{ fontSize: 14, minWidth: 80 }}>{iso(`${fmt(w.kg)} × ${w.reps}`)}</T>
              <T style={{ flex: 1, fontSize: 12, color: t.mute }} numberOfLines={1}>
                {bar != null && w.kg === bar ? 'البار فاضي' : load?.perSide.length ? `كل ناحية: ${iso(load.perSide.map(fmt).join(' + '))}` : ''}
              </T>
            </View>
          );
        })
      )}
    </Sheet>
  );
}

/** Plate colors (the usual competition colors); light plates get an outline so they show on a white card. */
const PLATE_LOOK: Record<number, { bg: string; fg: string; h: number }> = {
  25: { bg: '#D32F2F', fg: '#FFFFFF', h: 64 },
  20: { bg: '#1565C0', fg: '#FFFFFF', h: 60 },
  15: { bg: '#F9A825', fg: '#1A1200', h: 54 },
  10: { bg: '#2E7D32', fg: '#FFFFFF', h: 48 },
  5: { bg: '#ECEFF1', fg: '#1E2833', h: 38 },
  2.5: { bg: '#455A64', fg: '#FFFFFF', h: 30 },
  1.25: { bg: '#B0BEC5', fg: '#1E2833', h: 26 },
};

/** Which plates to put on each side for the selected set's weight (total with the bar). */
export function PlatesSheet({ visible, onClose, total, bar, name }: { visible: boolean; onClose: () => void; total: number | null; bar: number; name: string }) {
  const t = useTheme();
  const load = total != null ? platesFor(total, bar) : null;
  return (
    <Sheet visible={visible} onClose={onClose} title={total != null ? `${iso(fmt(total))} كجم · ${name}` : `الطارات · ${name}`} sub={`الوزن الكلي مع البار (${bar} كجم). البار بيتغير من الإعدادات`}>
      {total == null ? (
        <T style={{ color: t.mute }}>اكتب وزن المجموعة الأول.</T>
      ) : !load ? (
        <T style={{ color: t.mute }}>{`الوزن أقل من البار نفسه (${bar} كجم).`}</T>
      ) : (
        <>
          <T w="medium">{load.perSide.length ? `على كل ناحية: ${iso(load.perSide.map(fmt).join(' + '))} كجم` : 'البار لوحده، من غير طارات'}</T>
          {load.perSide.length ? (
            <View style={s.plates}>
              <View style={[s.sleeve, { backgroundColor: t.line }]} />
              {load.perSide.map((p, i) => {
                const lk = PLATE_LOOK[p];
                return (
                  <View key={i} style={[s.plate, { height: lk.h, backgroundColor: lk.bg, borderColor: tint('#000000', 0.25) }]}>
                    <T w="numBold" style={{ fontSize: 10, color: lk.fg }}>{fmt(p)}</T>
                  </View>
                );
              })}
            </View>
          ) : null}
          {load.left > 0 ? <T style={{ color: t.warn, fontSize: 12.5 }}>{`فاضل ${iso(fmt(load.left))} كجم مش هينفع بالطارات العادية، قرّب الوزن.`}</T> : null}
        </>
      )}
    </Sheet>
  );
}

/** A note on the exercise (per exercise, not per day), shown every time it's opened. */
export function NoteSheet({ visible, onClose, exName, value, onChange, onSave }: {
  visible: boolean;
  onClose: () => void;
  exName: string;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
}) {
  const t = useTheme();
  return (
    <Sheet visible={visible} onClose={onClose} title={`ملاحظة · ${exName}`} sub="بتظهرلك كل مرة تفتح التمرين ده (زي رقم الكرسي أو إحساسك)">
      <TextInput
        value={value}
        onChangeText={onChange}
        multiline
        autoFocus
        maxLength={200}
        placeholder="مثلًا: الكرسي على رقم 4"
        placeholderTextColor={t.mute}
        accessibilityLabel="الملاحظة"
        style={[INPUT, s.note, { color: t.fg, backgroundColor: t.soft, ...font('body') }]}
      />
      <Btn label="احفظ" kind="solid" onPress={onSave} />
    </Sheet>
  );
}

/** Why the "+kg" chip shows: every set hit the top of the range last time (`top`), or had 3+ reps left (`easy`). */
export function TipPopup({ visible, onClose, tip, weightStep, repHigh }: { visible: boolean; onClose: () => void; tip: 'top' | 'easy' | null; weightStep: number; repHigh: number }) {
  const t = useTheme();
  return (
    <InfoPopup
      visible={visible}
      onClose={onClose}
      title={<T w="bold" style={{ fontSize: 16, color: t.okText }}>{`زوّد ${weightStep} كجم`}</T>}
      body={
        tip === 'easy'
          ? `آخر مرة كان فاضلك 3 تكرارات أو أكتر في كل المجموعات، فالوزن خفيف عليك. زوّده ${weightStep} كجم المرة دي.`
          : `آخر مرة وصلت ${repHigh} تكرار في كل المجموعات، فالوزن بقى خفيف عليك. زوّده ${weightStep} كجم المرة دي.`
      }
    />
  );
}

const s = StyleSheet.create({
  opt: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 46, borderRadius: 12, paddingHorizontal: 12 },
  note: { minHeight: 84, borderRadius: 12, padding: 10, fontSize: 14, textAlignVertical: 'top', textAlign: 'right' },
  plates: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 6 },
  sleeve: { width: 28, height: 10, borderRadius: 3 },
  plate: { width: 22, borderRadius: 4, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
