import React, { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DEFAULT_SETS, MUSCLE_AR, PDF_PROGRAM, PROGRAM, SETS_MAX, SETS_MIN, type ExerciseDef, type Muscle, type ProgramEdit, type Tag } from '../data/program';
import { ALTERNATIVES } from '../data/alternatives';
import { TAG_INFO } from '../data/rules';
import { Btn, Card, Pill, Screen, Sep, Sheet, Stepper, SwitchRow, T } from '../components/ui';
import { WorkoutChips } from '../components/WorkoutChips';
import { dateKey } from '../lib/logic';
import { move, newId, REPS_MAX, REPS_MIN } from '../lib/programEdit';
import { currentWorkout, seqIndex } from '../lib/schedule';
import { useSettings } from '../lib/settings';
import { storage } from '../lib/storage';
import { F, useTheme } from '../theme';

const TAGS: Tag[] = ['heavy', 'fail', 'drop', null];
const iso = (s: string) => `⁦${s}⁩`;
/** The program as it is now, as an edit you can change. */
const currentEdit = (): ProgramEdit => Object.fromEntries(PROGRAM.map((d) => [d.weekday, d.exercises.map(({ restSec: _r, ...x }) => ({ ...x }))]));

type Form = { at: number | null; name: string; muscle: Muscle; sets: number; repLow: number; repHigh: number; tag: Tag; perLeg: boolean };

/**
 * Program editor: per program day, the exercises in order with their sets (− +), and for each one move up / down,
 * edit (name, muscle, reps, technique) or delete; add new ones. Renaming keeps an exercise's history; "replace" starts a new one.
 */
export default function ProgramScreen() {
  const t = useTheme();
  const st = useSettings();
  const [due] = useState(() => currentWorkout(storage.trainedDays(), dateKey()).id);
  const [day, setDay] = useState(due);
  const [form, setForm] = useState<Form | null>(null);
  const [del, setDel] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'day' | 'all' | null>(null);
  const plan = PROGRAM.find((d) => d.weekday === day)!;
  const total = plan.exercises.reduce((a, e) => a + e.sets, 0);
  const edited = !!storage.getMeta('program');
  const dayEdited = JSON.stringify(currentEdit()[day]) !== JSON.stringify(PDF_PROGRAM[day].map((d) => ({ ...d })));

  const save = (list: ExerciseDef[]) => st.setProgram({ ...currentEdit(), [day]: list });
  const defs = () => currentEdit()[day];
  const taken = () => PROGRAM.flatMap((d) => d.exercises.map((e) => e.id));

  const submit = () => {
    if (!form || !form.name.trim()) return;
    const list = defs();
    const base = { name: form.name.trim(), muscle: form.muscle, repLow: Math.min(form.repLow, form.repHigh), repHigh: Math.max(form.repLow, form.repHigh), tag: form.tag, perLeg: form.perLeg };
    if (form.at == null) list.push({ ...base, id: newId(base.name, taken()), sets: form.sets });
    else list[form.at] = { ...list[form.at], ...base }; // same id: the history stays with it
    setForm(null);
    save(list);
  };
  /** Swap an exercise for an alternative for good: a new exercise (new history) in the same place, same sets and reps. */
  const replace = (at: number, name: string) => {
    const list = defs();
    list[at] = { ...list[at], name, id: newId(name, taken()) };
    setForm(null);
    save(list);
  };

  return (
    <Screen title="البرنامج" sub="التمارين والمجموعات والتكرارات لكل يوم" onBack={() => router.back()}>
      <WorkoutChips value={day} current={due} onChange={(d) => { setDay(d); setConfirm(null); setDel(null); }} />
      <Card>
        <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8, gap: 1 }}>
          <T style={{ color: t.mute, fontSize: 12.5 }}>{`تمرين ${seqIndex(day) + 1} من ${PROGRAM.length} · ${plan.exercises.length} تمارين · ${total} مجموعة`}</T>
          <T w="bold" style={{ fontSize: 16 }}>{plan.titleAr}</T>
        </View>
        {plan.exercises.map((e, i) => {
          const base = DEFAULT_SETS[e.id];
          const pdf = PDF_PROGRAM[day].find((x) => x.id === e.id);
          return (
            <React.Fragment key={e.id}>
              <Sep />
              <View style={{ paddingHorizontal: 14, paddingVertical: 8, gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.muscle[e.muscle] }} />
                  <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                    <T w="num" style={{ fontSize: 14.5 }} numberOfLines={2}>{e.name}</T>
                    <T style={{ color: t.mute, fontSize: 12 }}>
                      {`${MUSCLE_AR[e.muscle]} · ${iso(`${e.repLow}–${e.repHigh}`)} تكرار${e.tag ? ` · ${TAG_INFO[e.tag].label}` : ''}${e.perLeg ? ' · لكل رجل' : ''}`}
                      {e.sets !== base ? <T style={{ color: t.okText, fontSize: 12 }}>{` · الأصلي ${base}`}</T> : null}
                      {!pdf ? <T style={{ color: t.warn, fontSize: 12 }}>{' · جديد'}</T> : null}
                    </T>
                  </View>
                  <Stepper compact value={e.sets} min={SETS_MIN} max={SETS_MAX} onChange={(v) => st.setSets(e.id, v)} label={`مجموعات ${e.name}`} />
                </View>
                <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'flex-end' }}>
                  <Icon name="arrow-up" label={`طلّع ${e.name} لفوق`} disabled={i === 0} onPress={() => save(move(defs(), i, -1))} />
                  <Icon name="arrow-down" label={`نزّل ${e.name} لتحت`} disabled={i === plan.exercises.length - 1} onPress={() => save(move(defs(), i, 1))} />
                  <Icon name="create-outline" label={`عدّل ${e.name}`} onPress={() => setForm({ at: i, name: e.name, muscle: e.muscle, sets: e.sets, repLow: e.repLow, repHigh: e.repHigh, tag: e.tag, perLeg: !!e.perLeg })} />
                  <Icon name="trash-outline" label={`امسح ${e.name}`} disabled={plan.exercises.length === 1} onPress={() => setDel(e.id)} />
                </View>
                {del === e.id ? (
                  <View style={[s.warn, { backgroundColor: t.warnSoft }]}>
                    <T style={{ fontSize: 12.5, flex: 1 }}>تمسحه من البرنامج؟ اللي سجلته قبل كده مش هيتمسح.</T>
                    <Btn label="امسح" kind="solid" onPress={() => { setDel(null); save(defs().filter((x) => x.id !== e.id)); }} />
                    <Btn label="لا" onPress={() => setDel(null)} />
                  </View>
                ) : null}
              </View>
            </React.Fragment>
          );
        })}
        <Sep />
        <View style={{ padding: 12 }}>
          <Btn label="+ ضيف تمرين" onPress={() => setForm({ at: null, name: '', muscle: plan.exercises[0]?.muscle ?? 'chest', sets: 3, repLow: 8, repHigh: 12, tag: null, perLeg: false })} />
        </View>
      </Card>

      <T style={{ color: t.mute, fontSize: 12, lineHeight: 19 }}>
        تعديل اسم تمرين بيحتفظ بسجله القديم (لو بتصلّح الاسم). لو هتغيّره بتمرين تاني خالص، استخدم «بدّله» جوه التعديل عشان يبدأ سجل جديد.
      </T>

      {confirm ? (
        <View style={[s.warn, { backgroundColor: t.warnSoft }]}>
          <T style={{ fontSize: 12.5, flex: 1 }}>{confirm === 'day' ? `ترجّع ${plan.titleAr} زي البرنامج الأصلي؟` : 'ترجّع البرنامج كله للأصلي؟'}</T>
          <Btn
            label="أيوه"
            kind="solid"
            onPress={() => {
              setConfirm(null);
              if (confirm === 'all') st.setProgram(null);
              else st.setProgram({ ...currentEdit(), [day]: PDF_PROGRAM[day].map((d) => ({ ...d })) });
            }}
          />
          <Btn label="لا" onPress={() => setConfirm(null)} />
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {dayEdited ? <Btn label="رجّع اليوم ده للأصلي" style={{ flex: 1 }} onPress={() => setConfirm('day')} /> : null}
          {edited ? <Btn label="رجّع البرنامج كله" style={{ flex: 1 }} onPress={() => setConfirm('all')} /> : null}
        </View>
      )}

      <Sheet visible={form != null} onClose={() => setForm(null)} title={form?.at == null ? `تمرين جديد · ${plan.titleAr}` : 'عدّل التمرين'}>
        {form ? (
          <>
            <T w="medium">الاسم (بالإنجليزي)</T>
            <TextInput
              value={form.name}
              onChangeText={(v) => setForm({ ...form, name: v })}
              placeholder="Cable Row"
              placeholderTextColor={t.mute}
              autoCapitalize="words"
              autoCorrect={false}
              maxLength={40}
              accessibilityLabel="اسم التمرين"
              style={[s.input, { color: t.fg, backgroundColor: t.soft }]}
            />
            <T w="medium">العضلة</T>
            <View style={s.wrap}>
              {(Object.keys(MUSCLE_AR) as Muscle[]).map((m) => (
                <Pill key={m} label={MUSCLE_AR[m]} color={t.muscle[m]} on={form.muscle === m} onPress={() => setForm({ ...form, muscle: m })} />
              ))}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <T w="medium" style={{ flex: 1 }}>التكرارات من</T>
              <Stepper compact value={form.repLow} min={REPS_MIN} max={REPS_MAX} onChange={(v) => setForm({ ...form, repLow: v, repHigh: Math.max(v, form.repHigh) })} label="أقل تكرار" />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <T w="medium" style={{ flex: 1 }}>لحد</T>
              <Stepper compact value={form.repHigh} min={form.repLow} max={REPS_MAX} onChange={(v) => setForm({ ...form, repHigh: v })} label="أعلى تكرار" />
            </View>
            {form.at == null ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <T w="medium" style={{ flex: 1 }}>المجموعات</T>
                <Stepper compact value={form.sets} min={SETS_MIN} max={SETS_MAX} onChange={(v) => setForm({ ...form, sets: v })} label="المجموعات" />
              </View>
            ) : null}
            <T w="medium">الطريقة</T>
            <View style={s.wrap}>
              {TAGS.map((g) => (
                <Pill key={g ?? 'none'} label={g ? TAG_INFO[g].label : 'عادي'} on={form.tag === g} onPress={() => setForm({ ...form, tag: g })} />
              ))}
            </View>
            <SwitchRow label="لكل رجل لوحدها" value={form.perLeg} onChange={(v) => setForm({ ...form, perLeg: v })} />
            <Btn label={form.at == null ? 'ضيفه' : 'احفظ'} kind="solid" onPress={submit} />
            {form.at != null ? (() => {
              const id = plan.exercises[form.at]?.id;
              const alts = (ALTERNATIVES[id] ?? []).filter((a) => !plan.exercises.some((e) => e.name === a));
              return alts.length ? (
                <>
                  <T w="medium" style={{ marginTop: 4 }}>أو بدّله بتمرين تاني (سجل جديد)</T>
                  {alts.map((a) => (
                    <Pressable key={a} onPress={() => replace(form.at!, a)} accessibilityRole="button" style={({ pressed }) => [s.opt, { backgroundColor: t.soft, opacity: pressed ? 0.7 : 1 }]}>
                      <T w="num" style={{ flex: 1 }}>{a}</T>
                      <Ionicons name="swap-horizontal" size={16} color={t.mute} />
                    </Pressable>
                  ))}
                </>
              ) : null;
            })() : null}
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}

function Icon({ name, label, onPress, disabled }: { name: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void; disabled?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [s.icon, { backgroundColor: t.soft, opacity: disabled ? 0.3 : pressed ? 0.6 : 1 }]}>
      <Ionicons name={name} size={17} color={t.fg} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  icon: { width: 40, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  warn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, padding: 10 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  input: { height: 46, borderRadius: 12, paddingHorizontal: 12, fontFamily: F.num, fontSize: 15, textAlign: 'left', writingDirection: 'ltr' },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, borderRadius: 12, paddingHorizontal: 12 },
});
