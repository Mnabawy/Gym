import React, { useRef, useState } from 'react';
import { Animated, Keyboard, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { Exercise } from '../data/program';
import { ALTERNATIVES } from '../data/alternatives';
import { FORM_VIDEOS } from '../data/videos';
import { dayKey, lastFor, NOTES_KEY, SWAPS_KEY } from '../lib/journal';
import { readStrings, writeEntry } from '../lib/meta';
import { barFor, platesFor, warmups } from '../lib/plates';
import { bestE1rm, countAr, increaseTip, parseNum, SETS, type SetEntry } from '../lib/logic';
import { usePop } from '../lib/motion';
import { storage } from '../lib/storage';
import { deloadOn, useSettings } from '../lib/settings';
import { nope, useTimer, tap } from '../lib/timer';
import { glow, tint, useTheme, font } from '../theme';
import { Btn, InfoPopup, Sheet, TagBadge, T } from './ui';
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
  /** Logging today (not a past day): ticks start the rest timer and save the time. */
  live: boolean;
  /** `finished`: the open exercise's last set was just ticked, so the list can move on to the next exercise. */
  onChange: (finished: boolean) => void;
};
type Row = { kg: string; reps: string; done: boolean; rir: number | null; at: number | null };
type Input = React.ComponentRef<typeof TextInput>;
/** What the selected set's fields show, and for which set (`at`). */
type Draft = { at: number; kg: string; reps: string };

const toRow = (s?: SetEntry): Row => ({ kg: s?.kg != null ? String(s.kg) : '', reps: s?.reps != null ? String(s.reps) : '', done: !!s?.done, rir: s?.rir ?? null, at: s?.at ?? null });
/** When a set was ticked (only called from the tap handler). */
const tickTime = () => Date.now();
/** RIR choices after a set: reps you could still have done (4 = 4 or more). */
const RIR = [0, 1, 2, 3, 4];
const rirAr = (n: number) => (n === 0 ? 'فشل' : n >= 4 ? 'فاضل +4' : `فاضل ${n}`);
const iso = (s: string) => `⁦${s}⁩`;
const fmt = (n: number) => String(Math.round(n * 100) / 100);
/** A set can only be ticked with a weight (0 is fine for bodyweight) and at least one rep. */
const missingOf = (v: { kg: string; reps: string }) => ({ kg: parseNum(v.kg) == null, reps: !((parseNum(v.reps) ?? 0) > 0) });

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
export function ExerciseRow({ ex, index, date, weekday, open, onOpen, first, live, onChange }: Props) {
  const t = useTheme();
  const color = t.muscle[ex.muscle];
  const start = useTimer((s) => s.start);
  const autoRest = useSettings((s) => s.autoRest);
  const weightStep = useSettings((s) => s.weightStep);
  const barKg = useSettings((s) => s.barKg);
  const askRir = useSettings((s) => s.askRir);
  const deloadUntil = useSettings((s) => s.deloadUntil);
  // Set just ticked: asks how many reps were left (RIR) until you answer or tick the next one.
  const [rirAt, setRirAt] = useState<number | null>(null);
  const [finPending, setFinPending] = useState(false);
  // Swap for today (src/data/alternatives.ts): sets still go on this exercise, but prefill and records only look at the same variant.
  const [swaps] = useState(() => readStrings(SWAPS_KEY));
  const alt = swaps[dayKey(date, ex.id)] ?? null;
  const name = alt ?? ex.name;
  const [hist] = useState(() => storage.history(ex.id));
  // Parent remounts this row (key) when the date changes or something outside it changes the data (clearing the day,
  // a new plan). Its own writes keep its state, so ticks can animate.
  const [rows, setRows] = useState<Row[]>(() => {
    const cur = storage.setsFor(date, ex.id);
    return Array.from({ length: ex.sets }, (_, i) => toRow(cur[i]));
  });
  const [last] = useState<SetEntry[] | undefined>(() => lastFor(hist, date, ex.id, swaps, alt));
  // Best estimated 1RM before today (same variant), for the "new record" badge on the summary line.
  const [prevBest] = useState(() =>
    hist
      .filter((h) => h.date < date && (swaps[dayKey(h.date, ex.id)] ?? null) === alt)
      .reduce((m, h) => Math.max(m, bestE1rm(h.sets.filter((x) => x.done))), 0),
  );
  const [sheet, setSheet] = useState<'swap' | 'plates' | 'note' | 'warm' | null>(null);
  const [note, setNote] = useState(() => readStrings(NOTES_KEY)[ex.id] ?? '');
  const [noteDraft, setNoteDraft] = useState(note);
  // The set being edited: the one you tapped, else the one you're on.
  const [picked, setPicked] = useState<number | null>(null);
  const [draftState, setDraft] = useState<Draft>(() => suggest(lineAt(rows), rows, last));
  const [watching, setWatching] = useState(false);
  const [why, setWhy] = useState(false);
  // Set you tried to tick without weight or reps: those fields turn red until filled.
  const [missing, setMissing] = useState<{ at: number; kg: boolean; reps: boolean } | null>(null);
  const kgRef = useRef<Input>(null);
  const repsRef = useRef<Input>(null);

  const doneCount = rows.filter((r) => r.done).length;
  const allDone = rows.length > 0 && doneCount === rows.length;
  const sel = picked != null && picked < rows.length ? picked : lineAt(rows);
  const draft = draftState.at === sel ? draftState : suggest(sel, rows, last);

  const save = (i: number, r: Row) => {
    storage.saveSet({ date, weekday, exId: ex.id, idx: i, kg: parseNum(r.kg), reps: parseNum(r.reps), done: r.done ? 1 : 0, rir: r.done ? r.rir : null, at: r.done ? r.at : null });
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
    setMissing(null);
  };

  /** Typing or − / + on the selected set. Saved right away (a done set stays done), so nothing is lost if you leave. */
  const setField = (field: 'kg' | 'reps', v: string) => {
    setDraft({ ...draft, [field]: v });
    if (missing?.at === sel && missing[field]) setMissing({ ...missing, [field]: missingOf({ ...draft, [field]: v })[field] });
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
    // No weight or reps yet: don't tick. Open that set with the empty fields in red and the keyboard on the first one.
    const miss = missingOf(vals);
    if (!cur.done && (miss.kg || miss.reps)) {
      nope();
      setMissing({ at: i, ...miss });
      if (open && i === sel) {
        (miss.kg ? kgRef : repsRef).current?.focus();
      } else {
        setPicked(i);
        setDraft({ ...vals, at: i });
        if (!open) onOpen();
      }
      return;
    }
    setMissing(null);
    const r: Row = cur.done ? { ...cur, done: false, rir: null, at: null } : { kg: vals.kg, reps: vals.reps, done: true, rir: null, at: live ? tickTime() : null };
    const next = put(i, r);
    setRirAt(r.done && askRir && open ? i : null);
    Keyboard.dismiss();
    setPicked(null); // back to the set you're on
    setDraft(suggest(lineAt(next), next, last));
    tap();
    if (r.done && autoRest && live) start(ex.restSec, name);
    // Last set: the list moves on once you've answered how hard it was (or closed the question).
    const fin = open && r.done && next.every((x) => x.done);
    setFinPending(fin && askRir);
    onChange(fin && !askRir);
  };

  const tip = increaseTip(ex, last);
  // No "add weight" tip in a light week.
  const up = tip != null && !deloadOn({ deloadUntil });
  const closeRir = () => {
    setRirAt(null);
    setFinPending(false);
    onChange(finPending);
  };
  const setRir = (i: number, n: number) => {
    put(i, { ...rows[i], rir: n });
    closeRir();
  };
  // Warm-up for heavy lifts, from the first set's weight.
  const workKg = parseNum(suggest(0, rows, last).kg);
  const range = `${ex.repLow}–${ex.repHigh}`;
  const video = alt ? undefined : FORM_VIDEOS[ex.id];
  const bar = barFor(name, barKg);
  const alts = ALTERNATIVES[ex.id] ?? [];
  const pickSwap = (to: string | null) => {
    setSheet(null);
    writeEntry(SWAPS_KEY, 'string', dayKey(date, ex.id), to ?? undefined, { all: true }); // card remounts with the new variant
  };
  const saveNote = () => {
    const v = noteDraft.trim();
    setNote(v);
    setSheet(null);
    writeEntry(NOTES_KEY, 'string', ex.id, v || undefined);
  };
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
      {open ? (
        <>
          <Sheet visible={sheet === 'swap'} onClose={() => setSheet(null)} title="بدّل التمرين النهارده بس" sub={`لو الجهاز مشغول. المجموعات بتتحسب على ${ex.name} في الحجم والحضور، والأوزان والأرقام بتتقارن بنفس التمرين البديل بس.`}>
            {[...(alt ? [null] : []), ...alts].map((a) => {
              const on = a === alt;
              return (
                <Pressable
                  key={a ?? 'orig'}
                  onPress={() => pickSwap(a)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={({ pressed }) => [s.opt, { backgroundColor: on ? t.okSoft : t.soft, opacity: pressed ? 0.7 : 1 }]}>
                  <T w="num" style={{ flex: 1, fontSize: 14 }}>{a ?? ex.name}</T>
                  <T style={{ fontSize: 12, color: t.mute }}>{a ? (on ? 'النهارده' : '') : 'رجّع الأصلي'}</T>
                </Pressable>
              );
            })}
            {doneCount ? <T style={{ fontSize: 12, color: t.warn }}>{`سجلت ${countAr(doneCount, SETS)} النهارده. لو بدّلت هتتحسب على التمرين الجديد.`}</T> : null}
          </Sheet>
          <Sheet visible={sheet === 'warm'} onClose={() => setSheet(null)} title={`إحماء · ${name}`} sub={workKg ? `قبل أول مجموعة (${iso(fmt(workKg))} كجم). راحة دقيقة بينهم، والإحماء مش بيتسجل` : undefined}>
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
          {bar != null ? <PlatesSheet visible={sheet === 'plates'} onClose={() => setSheet(null)} total={parseNum(draft.kg)} bar={bar} name={name} /> : null}
          <Sheet visible={sheet === 'note'} onClose={() => setSheet(null)} title={`ملاحظة · ${ex.name}`} sub="بتظهرلك كل مرة تفتح التمرين ده (زي رقم الكرسي أو إحساسك)">
            <TextInput
              value={noteDraft}
              onChangeText={setNoteDraft}
              multiline
              autoFocus
              maxLength={200}
              placeholder="مثلًا: الكرسي على رقم 4"
              placeholderTextColor={t.mute}
              accessibilityLabel="الملاحظة"
              style={[s.note, { color: t.fg, backgroundColor: t.soft, ...font('body') }]}
            />
            <Btn label="احفظ" kind="solid" onPress={saveNote} />
          </Sheet>
        </>
      ) : null}
      {up ? (
        <InfoPopup
          visible={why}
          onClose={() => setWhy(false)}
          title={<T w="bold" style={{ fontSize: 16, color: t.okText }}>{`زوّد ${weightStep} كجم`}</T>}
          body={
            tip === 'easy'
              ? `آخر مرة كان فاضلك 3 تكرارات أو أكتر في كل المجموعات، فالوزن خفيف عليك. زوّده ${weightStep} كجم المرة دي.`
              : `آخر مرة وصلت ${ex.repHigh} تكرار في كل المجموعات، فالوزن بقى خفيف عليك. زوّده ${weightStep} كجم المرة دي.`
          }
        />
      ) : null}

      <View style={s.head}>
        {/* Tapping the name opens this exercise. Open, the name has the line to itself (its buttons go on the line under it). */}
        <Pressable
          onPress={open ? undefined : onOpen}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`${name}، ${doneCount} من ${ex.sets} مجموعات`}
          hitSlop={{ top: 7, bottom: 7 }}
          style={s.title}>
          <View style={[s.num, { backgroundColor: tint(color, t.neon ? 0.16 : 0.2), boxShadow: glow(t, color, 6) }]}>
            <T w="numBold" style={{ fontSize: 11, color: ink }}>{index + 1}</T>
          </View>
          <T w="num" style={{ fontSize: open ? 13 : 14.5, flexShrink: summary ? 0 : 1 }} numberOfLines={1}>{name}</T>
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
            {ex.tag === 'heavy' ? <MetaChip icon="flame-outline" label="إحماء" a11y="مجموعات الإحماء" onPress={() => setSheet('warm')} /> : null}
            {alts.length || alt ? <MetaChip icon="swap-horizontal" label={alt ? 'متبدّل' : 'بدّل'} on={!!alt} a11y={`بدّل ${name} بتمرين تاني النهارده`} onPress={() => setSheet('swap')} /> : null}
            {bar != null ? <MetaChip icon="barbell-outline" label="طارات" a11y="احسب الطارات" onPress={() => setSheet('plates')} /> : null}
            <MetaChip icon="create-outline" label={note ? undefined : 'ملاحظة'} a11y={note ? 'عدّل الملاحظة' : 'اكتب ملاحظة'} onPress={() => { setNoteDraft(note); setSheet('note'); }} />
            <T style={{ marginStart: 'auto', fontSize: 10.5, color: t.mute }} numberOfLines={1}>
              {`تكرار ${iso(range)}${ex.perLeg ? ' · لكل رجل' : ''}`}
            </T>
          </View>
          {alt ? <T style={{ fontSize: 11, color: t.warn, marginTop: 3 }} numberOfLines={1}>{`بدل ${iso(ex.name)} النهارده`}</T> : null}
          {note ? (
            <Pressable onPress={() => { setNoteDraft(note); setSheet('note'); }} accessibilityRole="button" accessibilityLabel={`ملاحظة: ${note}، دوس تعدّلها`} style={[s.noteLine, { backgroundColor: t.soft }]}>
              <Ionicons name="document-text-outline" size={12} color={t.mute} />
              <T style={{ flex: 1, fontSize: 11.5, color: t.fg }} numberOfLines={2}>{note}</T>
            </Pressable>
          ) : null}

          <View style={s.sets}>
            {rows.map((r, i) => {
              if (i === sel) {
                const err = missing?.at === i ? missing : null;
                return (
                  <React.Fragment key={i}>
                    <View style={[s.srow, { borderColor: color, backgroundColor: tint(color, 0.08), boxShadow: t.neon ? glow(t, color, 8) : undefined }]}>
                      <T w="numBold" style={[s.sn, { color: ink }]}>{i + 1}</T>
                      <Field
                        inputRef={kgRef}
                        value={draft.kg}
                        unit="كجم"
                        decimal
                        error={!!err?.kg}
                        autoFocus={!!err?.kg}
                        label={`الوزن مجموعة ${i + 1}`}
                        onChange={(v) => setField('kg', v)}
                        onStep={(d) => step('kg', d)}
                      />
                      <Field
                        inputRef={repsRef}
                        value={draft.reps}
                        unit="تكرار"
                        error={!!err?.reps}
                        autoFocus={!!err?.reps && !err.kg}
                        label={`التكرارات مجموعة ${i + 1}`}
                        onChange={(v) => setField('reps', v)}
                        onStep={(d) => step('reps', d)}
                      />
                      <Tick on={r.done} primary onPress={() => toggle(i)} label={`${r.done ? 'رجّع' : 'خلصت'} مجموعة ${i + 1}`} />
                    </View>
                    {err && (err.kg || err.reps) ? (
                      <T accessibilityLiveRegion="polite" style={{ fontSize: 11.5, color: t.bad, marginTop: -1, marginStart: 27 }}>
                        {err.kg && err.reps ? 'اكتب الوزن والتكرارات الأول' : err.kg ? 'اكتب الوزن الأول' : 'اكتب التكرارات الأول'}
                      </T>
                    ) : null}
                  </React.Fragment>
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
                    <View style={cell}>
                      <T w="numBold" style={txt}>
                        {iso(v.reps || range)}
                        {r.done && r.rir != null ? <T style={{ fontSize: 10.5, color: t.mute }}>{`  ${rirAr(r.rir)}`}</T> : null}
                      </T>
                    </View>
                  </Pressable>
                  <Tick on={r.done} onPress={() => toggle(i)} label={`${r.done ? 'رجّع' : 'خلصت'} مجموعة ${i + 1}`} />
                </View>
              );
            })}
          </View>
          {rirAt != null && rows[rirAt]?.done ? (
            <View style={s.rir}>
              <T style={{ fontSize: 11.5, color: t.mute }}>{`مجموعة ${rirAt + 1}: كان فاضل كام تكرار؟`}</T>
              <View style={{ flexDirection: 'row', gap: 5 }}>
                {RIR.map((n) => (
                  <Pressable
                    key={n}
                    onPress={() => setRir(rirAt, n)}
                    hitSlop={{ top: 8, bottom: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={n === 0 ? 'وصلت للفشل' : n >= 4 ? 'فاضل 4 أو أكتر' : `فاضل ${n}`}
                    style={({ pressed }) => [s.rirBtn, { backgroundColor: t.soft, borderColor: tint(color, 0.5), opacity: pressed ? 0.6 : 1 }]}>
                    <T w="numBold" style={{ fontSize: 13 }}>{n >= 4 ? '+4' : String(n)}</T>
                  </Pressable>
                ))}
                <Pressable onPress={closeRir} hitSlop={8} accessibilityRole="button" accessibilityLabel="مش عايز أسجّل" style={({ pressed }) => [s.rirBtn, { borderColor: 'transparent', opacity: pressed ? 0.6 : 1 }]}>
                  <Ionicons name="close" size={15} color={t.mute} />
                </Pressable>
              </View>
            </View>
          ) : null}
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

/** Small outlined button on the open exercise's second line (swap, plates, note). */
function MetaChip({ icon, label, a11y, on, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; label?: string; a11y: string; on?: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={({ pressed }) => [s.chip, { borderColor: on ? t.warn : t.line, backgroundColor: on ? t.warnSoft : undefined, opacity: pressed ? 0.6 : 1 }]}>
      <Ionicons name={icon} size={11} color={on ? t.warn : t.mute} />
      {label ? <T style={{ fontSize: 10.5, color: on ? t.warn : t.mute }}>{label}</T> : null}
    </Pressable>
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
function PlatesSheet({ visible, onClose, total, bar, name }: { visible: boolean; onClose: () => void; total: number | null; bar: number; name: string }) {
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
function Field({ value, unit, label, decimal, error, autoFocus, inputRef, onChange, onStep }: {
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
      hitSlop={{ top: 6, bottom: 6 }}
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
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, rowGap: 4, marginTop: 3 },
  rir: { gap: 4, marginTop: 6 },
  rirBtn: { flex: 1, height: 30, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 46, borderRadius: 12, paddingHorizontal: 12 },
  note: { minHeight: 84, borderRadius: 12, padding: 10, fontSize: 14, textAlignVertical: 'top', textAlign: 'right' },
  noteLine: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginTop: 4 },
  plates: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 6 },
  sleeve: { width: 28, height: 10, borderRadius: 3 },
  plate: { width: 22, borderRadius: 4, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 1, borderRadius: 999, paddingHorizontal: 7, height: 19 },
  sets: { gap: 4, marginTop: 6 },
  srow: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 36, borderRadius: 10, borderWidth: 1, paddingHorizontal: 4 },
  cells: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'stretch' },
  sn: { width: 18, textAlign: 'center', fontSize: 12 },
  cell: { flex: 1, minWidth: 0, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  fld: { flex: 1, minWidth: 0, height: 30, borderRadius: 8, borderWidth: 1, flexDirection: 'row', alignItems: 'center' },
  fbtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  fin: { flex: 1, minWidth: 0, ...font('numBold'), fontSize: 14, textAlign: 'center', writingDirection: 'ltr', padding: 0, margin: 0, height: 28, includeFontPadding: false, outlineWidth: 0 },
  tick: { width: 40, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  boxes: { flexDirection: 'row', gap: 5, marginTop: 5 },
  box: { flex: 1, minWidth: 0, height: 28, borderRadius: 8, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, gap: 4 },
});
