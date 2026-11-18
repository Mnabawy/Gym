import React, { useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { Exercise } from '../data/program';
import { ALTERNATIVES } from '../data/alternatives';
import { FORM_VIDEOS } from '../data/videos';
import { dayKey, lastFor, NOTES_KEY, SWAPS_KEY } from '../lib/journal';
import { readStrings, writeEntry } from '../lib/meta';
import { barFor } from '../lib/plates';
import { increaseTip, parseNum, type SetEntry } from '../lib/logic';
import { doneLine, doneSets, isRecord, iso, lineAt, missingOf, prevBestFor, stepValue, suggest, tickedRow, toRow, type Draft, type Row } from '../lib/setRows';
import { storage } from '../lib/storage';
import { deloadOn, useSettings } from '../lib/settings';
import { nope, useTimer, tap } from '../lib/timer';
import { glow, tint, useTheme } from '../theme';
import { TagBadge, T } from './ui';
import { VideoSheet } from './VideoSheet';
import { ACTION, Swipe, type SwipeAction } from './Swipe';
import { Field, MetaChip, RirAsk, SetBoxes, SetLine, Tick, TipChip, Under, VideoChip, type Input } from './SetParts';
import { NoteSheet, PlatesSheet, SwapSheet, TipPopup, WarmSheet } from './ExerciseSheets';
import { showUndo } from '../lib/undo';

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
  /**
   * After a write. `done`: the open exercise's last set was ticked (and its RIR answered), so the list moves on.
   * `hold`: its last set was ticked but the RIR question is up, so keep it open until that's answered.
   */
  onChange: (state: 'done' | 'hold' | null) => void;
};

/** When a set was ticked (only called from the tap handler). */
const tickTime = () => Date.now();

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
    // Keep any extra sets logged past the plan (idx ≥ ex.sets) so they survive a remount.
    return Array.from({ length: Math.max(ex.sets, cur.length) }, (_, i) => toRow(cur[i]));
  });
  const [last] = useState<SetEntry[] | undefined>(() => lastFor(hist, date, ex.id, swaps, alt));
  // Best estimated 1RM before today (same variant), for the "new record" badge on the summary line.
  const [prevBest] = useState(() => prevBestFor(hist, date, ex.id, swaps, alt));
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
  // Empty reps start from the bottom of the range; empty weight from one step (stepValue in setRows.ts).
  const step = (field: 'kg' | 'reps', dir: -1 | 1) => setField(field, stepValue(draft[field], field, dir, weightStep, ex.repLow));

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
    const r = tickedRow(cur, vals, live && !cur.done ? tickTime() : null);
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
    onChange(fin ? (askRir ? 'hold' : 'done') : null);
  };

  const tip = increaseTip(ex, last);
  // No "add weight" tip in a light week.
  const up = tip != null && !deloadOn({ deloadUntil });
  const closeRir = () => {
    setRirAt(null);
    setFinPending(false);
    onChange(finPending ? 'done' : null);
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
  const done = doneSets(rows);
  const record = summary && isRecord(prevBest, done);
  const line = doneLine(done);
  const ink = t.neon ? color : t.fg;
  // The card's own background, made opaque (card + the open exercise's wash) so swipe actions stay hidden under rows.
  const wash = open ? tint(color, t.neon ? 0.07 : 0.06) : undefined;

  // Swipe shortcuts. Closed cards open first, since their sheets live in the open card.
  const openSheet = (k: 'swap' | 'note') => {
    if (k === 'note') setNoteDraft(note);
    if (!open) onOpen();
    setSheet(k);
  };
  const rowStart: SwipeAction[] = [
    ...(alts.length || alt ? [{ icon: 'swap-horizontal' as const, label: 'بدّل', color: ACTION.blue, onPress: () => openSheet('swap') }] : []),
    ...(video ? [{ icon: 'play' as const, label: 'فيديو', color: ACTION.purple, onPress: () => setWatching(true) }] : []),
  ];
  const rowEnd: SwipeAction[] = [{ icon: 'create-outline', label: 'ملاحظة', color: ACTION.orange, onPress: () => openSheet('note') }];

  /** Put a set back as it was (undo), on top of whatever the rows are by then. */
  const restoreSet = (i: number, r: Row) => {
    setRows((prev) => {
      const next = [...prev];
      next[i] = r;
      return next;
    });
    save(i, r);
    setDraft({ at: -1, kg: '', reps: '' }); // the fields read the set again
    onChange(null);
  };
  /** Empty a set's logged numbers (and its tick), with undo. */
  const clearSet = (i: number) => {
    const old = rows[i];
    const next = put(i, { kg: '', reps: '', done: false, rir: null, at: null });
    if (rirAt === i) setRirAt(null);
    setMissing(null);
    setPicked(null);
    setDraft(suggest(lineAt(next), next, last));
    onChange(null);
    showUndo(`اتمسحت مجموعة ${i + 1} · ${name}`, () => restoreSet(i, old));
  };
  /** Add a set beyond the plan for today (dropset, extra). Saved once you type or tick it; doesn't change the program. */
  const addSet = () => {
    setRows((prev) => [...prev, { kg: '', reps: '', done: false, rir: null, at: null }]);
    tap();
  };
  /** Remove the last set — only an extra one you added past the plan, with undo. */
  const removeLastSet = () => {
    const i = rows.length - 1;
    if (i < ex.sets) return;
    const old = rows[i];
    setRows((prev) => prev.slice(0, -1));
    storage.deleteSet(date, ex.id, i);
    if (picked === i) setPicked(null);
    if (rirAt === i) setRirAt(null);
    onChange(null);
    showUndo(`اترجعت مجموعة ${i + 1} · ${name}`, () => { setRows((prev) => [...prev, old]); save(i, old); onChange(null); });
  };
  const setStart = (i: number): SwipeAction[] => [
    rows[i].done
      ? { icon: 'arrow-undo', label: 'رجّعها', color: ACTION.grey, onPress: () => toggle(i) }
      : { icon: 'checkmark', label: 'خلصت', color: ACTION.green, onPress: () => toggle(i) },
  ];
  const setEnd = (i: number): SwipeAction[] =>
    rows[i].done || rows[i].kg || rows[i].reps ? [{ icon: 'trash', label: 'امسح', color: ACTION.red, onPress: () => clearSet(i) }] : [];

  return (
    <View
      style={[
        { borderTopWidth: first ? 0 : StyleSheet.hairlineWidth * 2, borderTopColor: t.neon ? t.border : t.line },
        open ? { borderStartWidth: 3, borderStartColor: color } : null,
      ]}>
      {video ? <VideoSheet video={video} name={ex.name} visible={watching} onClose={() => setWatching(false)} /> : null}
      {open ? (
        <>
          <SwapSheet visible={sheet === 'swap'} onClose={() => setSheet(null)} exName={ex.name} alt={alt} alts={alts} doneCount={doneCount} onPick={pickSwap} />
          <WarmSheet visible={sheet === 'warm'} onClose={() => setSheet(null)} name={name} workKg={workKg} bar={bar} />
          {bar != null ? <PlatesSheet visible={sheet === 'plates'} onClose={() => setSheet(null)} total={parseNum(draft.kg)} bar={bar} name={name} /> : null}
          <NoteSheet visible={sheet === 'note'} onClose={() => setSheet(null)} exName={ex.name} value={noteDraft} onChange={setNoteDraft} onSave={saveNote} />
        </>
      ) : null}
      {up ? <TipPopup visible={why} onClose={() => setWhy(false)} tip={tip} weightStep={weightStep} repHigh={ex.repHigh} /> : null}

      {/* Swipe the exercise: بدّل / فيديو from the start edge, ملاحظة from the end edge. */}
      <Swipe start={rowStart} end={rowEnd}>
        <Under color={wash}>
          <View style={[s.top, open ? s.topOpen : s.topClosed]}>
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
                {up ? <TipChip weightStep={weightStep} onPress={() => setWhy(true)} /> : null}
                {video ? <VideoChip exName={ex.name} onPress={() => setWatching(true)} /> : null}
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
            </>
          ) : summary ? null : (
            <SetBoxes rows={rows} last={last} range={range} onToggle={toggle} />
          )}
          </View>
        </Under>
      </Swipe>
      {open ? (
        <Under color={wash} style={s.bottom}>
              <View style={s.sets}>
                {rows.map((r, i) => {
                  if (i === sel) {
                    const err = missing?.at === i ? missing : null;
                    return (
                      <React.Fragment key={i}>
                        <Swipe style={s.swipe} start={setStart(i)} end={setEnd(i)}>
                        <Under color={wash}>
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
                        </Under>
                        </Swipe>
                        {err && (err.kg || err.reps) ? (
                          <T accessibilityLiveRegion="polite" style={{ fontSize: 11.5, color: t.bad, marginTop: -1, marginStart: 27 }}>
                            {err.kg && err.reps ? 'اكتب الوزن والتكرارات الأول' : err.kg ? 'اكتب الوزن الأول' : 'اكتب التكرارات الأول'}
                          </T>
                        ) : null}
                      </React.Fragment>
                    );
                  }
                  return (
                    <SetLine key={i} i={i} row={r} shown={r.done ? r : suggest(i, rows, last)} range={range} wash={wash} start={setStart(i)} end={setEnd(i)} onSelect={() => select(i)} onToggle={() => toggle(i)} />
                  );
                })}
              </View>
              <View style={s.addRow}>
                <Pressable onPress={addSet} accessibilityRole="button" accessibilityLabel={`زوّد مجموعة لـ ${name}`} hitSlop={8} style={({ pressed }) => [s.addBtn, { opacity: pressed ? 0.6 : 1 }]}>
                  <Ionicons name="add" size={15} color={color} />
                  <T w="semi" style={{ fontSize: 12.5, color }}>مجموعة</T>
                </Pressable>
                {rows.length > ex.sets ? (
                  <Pressable onPress={removeLastSet} accessibilityRole="button" accessibilityLabel="امسح آخر مجموعة زيادة" hitSlop={8} style={({ pressed }) => [s.addBtn, { opacity: pressed ? 0.6 : 1 }]}>
                    <Ionicons name="remove" size={15} color={t.mute} />
                    <T w="semi" style={{ fontSize: 12.5, color: t.mute }}>الأخيرة</T>
                  </Pressable>
                ) : null}
              </View>
              {rirAt != null && rows[rirAt]?.done ? (
                <RirAsk at={rirAt} color={color} onPick={(n) => setRir(rirAt, n)} onClose={closeRir} />
              ) : null}
        </Under>
      ) : null}
    </View>
  );
}

// Tight layout: 44pt set rows (30pt controls + 7pt hitSlop each side; Swipe clips touches to the row); small buttons keep 44pt touch targets through hitSlop.
const s = StyleSheet.create({
  top: { paddingHorizontal: 10, paddingTop: 7 },
  topClosed: { paddingBottom: 7 },
  topOpen: { paddingBottom: 8 },
  bottom: { paddingHorizontal: 10, paddingBottom: 7 },
  swipe: { borderRadius: 10, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 30 },
  num: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 7 },
  pr: { backgroundColor: '#FFC53D', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, rowGap: 16, marginTop: 3 },
  noteLine: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginTop: 4 },
  sets: { gap: 4 },
  addRow: { flexDirection: 'row', gap: 8, marginTop: 6, marginStart: 23 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, minHeight: 30, paddingHorizontal: 4 },
  srow: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 44, borderRadius: 10, borderWidth: 1, paddingHorizontal: 4 },
  sn: { width: 18, textAlign: 'center', fontSize: 12 },
});
