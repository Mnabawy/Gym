import React, { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { parseSteps, STEPS_GOAL, STEPS_KEY, CARDIO, CARDIO_KEY, cardioId, cardioKcal, cardioWeek, INTENSITY, parseCardio, WHO_MIN, type Cardio, type CardioType, type Intensity } from '../lib/cardio';
import { useDataVersion } from '../lib/bus';
import { showUndo } from '../lib/undo';
import { weekStart } from '../lib/gaps';
import { parseNum } from '../lib/logic';
import { useSettings } from '../lib/settings';
import { storage } from '../lib/storage';
import { tint, useTheme, font } from '../theme';
import { ACTION, Swipe } from './Swipe';
import { INPUT, Btn, Card, Pill, Progress, Sheet, Stepper, T } from './ui';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
const iso = (s: string) => `⁦${s}⁩`;

/** Cardio and walking for a day (the workout tab's date), with this week's minutes against the WHO 150. */
export function CardioCard({ date }: { date: string }) {
  const t = useTheme();
  useDataVersion((s) => s.v);
  const weight = useSettings((s) => s.body.weight);
  const all = parseCardio(storage.getMeta(CARDIO_KEY));
  const list = all[date] ?? [];
  const week = cardioWeek(all, weekStart(date), weight ?? 0);
  const stepsOn = useSettings((s) => s.stepsSync);
  const steps = stepsOn ? parseSteps(storage.getMeta(STEPS_KEY))[date] ?? 0 : null;
  const [form, setForm] = useState<{ type: CardioType; minutes: number; intensity: Intensity; km: string; steps: string } | null>(null);

  const save = (next: Cardio[]) => {
    const m = { ...all, [date]: next };
    if (!next.length) delete m[date];
    storage.setMeta(CARDIO_KEY, JSON.stringify(m));
    useDataVersion.getState().bump();
  };
  const add = () => {
    if (!form) return;
    const km = parseNum(form.km);
    const steps = parseNum(form.steps);
    save([...list, { id: cardioId(), type: form.type, minutes: form.minutes, intensity: form.intensity, ...(km ? { km } : null), ...(steps ? { steps: Math.round(steps) } : null) }]);
    setForm(null);
  };
  const remove = (id: string) => {
    save(list.filter((x) => x.id !== id));
    showUndo('اتمسح كارديو', () => save(list));
  };

  return (
    <Card style={{ paddingVertical: 10, paddingHorizontal: 12, gap: 8, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="walk" size={18} color={t.okText} />
        <T w="bold" style={{ flex: 1, fontSize: 14 }}>كارديو ومشي</T>
        <T w="num" style={{ fontSize: 12, color: t.mute }}>{`الأسبوع ${iso(`${week.who}/${WHO_MIN}`)} د`}</T>
      </View>
      <Progress value={week.who / WHO_MIN} color={t.ok} height={5} />
      {steps != null ? (
        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="footsteps" size={15} color={t.mute} />
            <T style={{ flex: 1, fontSize: 13 }}>خطواتك من الموبايل</T>
            <T w="num" style={{ fontSize: 12.5, color: steps >= STEPS_GOAL ? t.okText : t.fg }}>{iso(`${steps.toLocaleString('en-US')} / ${STEPS_GOAL.toLocaleString('en-US')}`)}</T>
          </View>
          <Progress value={steps / STEPS_GOAL} color={t.protein} height={4} />
        </View>
      ) : null}
      {list.map((c) => (
        <Swipe key={c.id} style={s.swipe} end={[{ icon: 'trash', label: 'امسح', color: ACTION.red, onPress: () => remove(c.id) }]}>
        <View style={[s.item, { backgroundColor: t.card }]}>
          <Ionicons name={CARDIO[c.type].icon as IconName} size={16} color={t.mute} />
          <T style={{ flex: 1, fontSize: 13.5 }} numberOfLines={1}>
            {`${CARDIO[c.type].label} · ${c.minutes} د · ${INTENSITY[c.intensity].label}`}
            {c.km ? ` · ${iso(`${c.km} كم`)}` : ''}
            {c.steps ? ` · ${iso(c.steps.toLocaleString('en-US'))} خطوة` : ''}
          </T>
          {weight ? <T w="num" style={{ fontSize: 11.5, color: t.mute }}>{`≈${cardioKcal(c, weight)} سعر`}</T> : null}
          <Pressable onPress={() => remove(c.id)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`امسح ${CARDIO[c.type].label}`}>
            <Ionicons name="close" size={16} color={t.bad} />
          </Pressable>
        </View>
        </Swipe>
      ))}
      <Pressable onPress={() => setForm({ type: 'walk', minutes: 30, intensity: 'moderate', km: '', steps: '' })} accessibilityRole="button" style={({ pressed }) => ({ minHeight: 34, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
        <T w="semi" style={{ fontSize: 13, color: t.okText }}>+ سجّل كارديو أو مشي</T>
      </Pressable>

      <Sheet visible={form != null} onClose={() => setForm(null)} title="كارديو أو مشي" sub="منظمة الصحة العالمية بتنصح بـ 150–300 دقيقة نشاط متوسط في الأسبوع، والدقيقة السريعة بدقيقتين">
        {form ? (
          <>
            <View style={s.wrap}>
              {(Object.keys(CARDIO) as CardioType[]).map((k) => (
                <Pill key={k} label={CARDIO[k].label} on={form.type === k} onPress={() => setForm({ ...form, type: k })} />
              ))}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <T w="medium" style={{ flex: 1 }}>المدة</T>
              <Stepper compact value={form.minutes} min={5} max={240} step={5} onChange={(v) => setForm({ ...form, minutes: v })} label="المدة بالدقايق" format={(v) => `${v} د`} />
            </View>
            <View style={s.wrap}>
              {(Object.keys(INTENSITY) as Intensity[]).map((k) => (
                <Pill key={k} label={INTENSITY[k].label} on={form.intensity === k} onPress={() => setForm({ ...form, intensity: k })} />
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Field label="المسافة (كم) · اختياري" value={form.km} onChange={(v) => setForm({ ...form, km: v })} decimal />
              {form.type === 'walk' || form.type === 'run' ? <Field label="الخطوات · اختياري" value={form.steps} onChange={(v) => setForm({ ...form, steps: v })} /> : null}
            </View>
            {weight ? <T style={{ fontSize: 12, color: t.mute }}>{`حوالي ${cardioKcal({ id: '', type: form.type, minutes: form.minutes, intensity: form.intensity }, weight)} سعر (تقريبي)`}</T> : null}
            <Btn label="سجّل" kind="solid" onPress={add} />
          </>
        ) : null}
      </Sheet>
    </Card>
  );
}

function Field({ label, value, onChange, decimal }: { label: string; value: string; onChange: (v: string) => void; decimal?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <T style={{ fontSize: 12, color: t.mute }}>{label}</T>
      <TextInput
        value={value}
        onChangeText={(v) => onChange(v.replace(/[^0-9.,٠-٩۰-۹٫]/g, ''))}
        keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
        placeholder="–"
        placeholderTextColor={t.mute}
        maxLength={6}
        accessibilityLabel={label}
        style={[INPUT, s.input, { color: t.fg, backgroundColor: tint(t.fg, 0.06), ...font('numBold') }]}
      />
    </View>
  );
}

const s = StyleSheet.create({
  item: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 30, paddingHorizontal: 12 },
  swipe: { marginHorizontal: -12 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  input: { height: 42, borderRadius: 10, textAlign: 'center', fontSize: 15, outlineWidth: 0, writingDirection: 'ltr' },
});
