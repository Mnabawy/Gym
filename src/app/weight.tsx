import React, { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { MONTHS_AR } from '../data/program';
import { Btn, Card, Label, Screen, Sep, T } from '../components/ui';
import { E1rmChart } from '../components/E1rmChart';
import { GOAL } from '../lib/energy';
import { dateKey, parseNum } from '../lib/logic';
import { useSettings } from '../lib/settings';
import { storage } from '../lib/storage';
import { useDataVersion } from '../lib/bus';
import { addWeighIn, parseWeights, rateBand, rateVerdict, removeWeighIn, validWeight, weeklyRate, WEIGHTS_KEY, type WeighIn } from '../lib/weight';
import { F, useTheme } from '../theme';

const iso = (s: string) => `⁦${s}⁩`;
const fmt = (n: number) => String(Math.round(n * 100) / 100);
const signed = (n: number) => `${n > 0 ? '+' : ''}${fmt(n)}`;
const dayLabel = (k: string) => `${+k.slice(8)} ${MONTHS_AR[+k.slice(5, 7) - 1]}`;

/** Body weight log: a weigh-in a day (best in the morning), a chart, and the weekly rate against your goal. */
export default function WeightScreen() {
  const t = useTheme();
  const today = dateKey();
  useDataVersion((s) => s.v);
  const bump = useDataVersion((s) => s.bump);
  const body = useSettings((s) => s.body);
  const setBody = useSettings((s) => s.setBody);
  const list = parseWeights(storage.getMeta(WEIGHTS_KEY));
  const todays = list.find((w) => w.date === today);
  const [text, setText] = useState(todays ? String(todays.kg) : '');
  const [all, setAll] = useState(false);
  const kg = parseNum(text);
  const bad = text.trim() !== '' && !validWeight(kg);

  const save = (next: WeighIn[]) => {
    storage.setMeta(WEIGHTS_KEY, JSON.stringify(next));
    // The calorie calculator (and so the food tab's targets) always uses your latest weigh-in.
    const latest = next[next.length - 1];
    if (latest && latest.kg !== body.weight) setBody({ weight: latest.kg });
    bump();
  };
  const log = () => {
    if (!validWeight(kg)) return;
    save(addWeighIn(list, today, kg));
  };

  const rate = weeklyRate(list, today);
  const latest = list[list.length - 1];
  const verdict = rate != null && latest ? rateVerdict(rate, body.goal, latest.kg) : null;
  const band = latest ? rateBand(body.goal, latest.kg) : null;
  const first = list[0];
  const shown = list.slice().reverse().slice(0, all ? undefined : 10);

  return (
    <Screen title="وزنك" sub="اتوزن الصبح بعد الحمام وقبل الأكل، نفس الميزان" onBack={() => router.back()}>
      <Card style={{ padding: 14, gap: 10 }}>
        <T w="medium">{todays ? 'وزن النهارده (تقدر تعدّله)' : 'سجّل وزن النهارده'}</T>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={[s.field, { backgroundColor: t.soft, borderColor: bad ? t.bad : 'transparent' }]}>
            <TextInput
              value={text}
              onChangeText={(v) => setText(v.replace(/[^0-9.,٠-٩۰-۹٫]/g, ''))}
              keyboardType="decimal-pad"
              placeholder="–"
              placeholderTextColor={t.mute}
              maxLength={6}
              accessibilityLabel="الوزن بالكيلو"
              onSubmitEditing={log}
              style={[s.input, { color: t.fg }]}
            />
            <T style={{ color: t.mute, fontSize: 13 }}>كجم</T>
          </View>
          <Btn label={todays ? 'عدّل' : 'سجّل'} kind="solid" onPress={log} />
        </View>
        {bad ? <T style={{ color: t.bad, fontSize: 12 }}>اكتب وزن بين 35 و250 كجم</T> : null}
        <T style={{ color: t.mute, fontSize: 12 }}>آخر وزن بيتحط لوحده في حساب السعرات، فأهداف الأكل بتمشي معاك.</T>
      </Card>

      {list.length ? (
        <>
          <Card style={{ padding: 14, gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
              <T w="numBold" style={{ fontSize: 22 }}>{iso(fmt(latest.kg))}</T>
              <T style={{ color: t.mute }}>كجم</T>
              {first && first.date !== latest.date ? (
                <T w="num" style={{ marginStart: 'auto', color: t.mute, fontSize: 12.5 }}>{`${iso(signed(latest.kg - first.kg))} كجم من ${dayLabel(first.date)}`}</T>
              ) : null}
            </View>
            <E1rmChart points={list.map((w) => ({ date: w.date, v: w.kg }))} color={t.ok} />
          </Card>

          <Card style={{ padding: 14, gap: 6 }}>
            <T w="bold">{`سرعة التغيير · هدفك ${GOAL[body.goal].label}`}</T>
            {rate == null ? (
              <T style={{ color: t.mute, fontSize: 13 }}>محتاج وزنتين بينهم أسبوع على الأقل في آخر 4 أسابيع.</T>
            ) : (
              <>
                <T w="num" style={{ fontSize: 15 }}>{`${iso(signed(rate))} كجم في الأسبوع`}</T>
                <T style={{ fontSize: 13, color: verdict?.level === 'ok' ? t.okText : t.warn }}>{verdict?.text}</T>
              </>
            )}
            {band ? <T style={{ color: t.mute, fontSize: 12 }}>{`المطلوب: من ${iso(signed(band[0]))} لـ ${iso(signed(band[1]))} كجم في الأسبوع`}</T> : null}
            <Pressable onPress={() => router.push('/calories')} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 4, opacity: pressed ? 0.6 : 1, minHeight: 32 })}>
              <T style={{ color: t.okText, fontSize: 13 }}>غيّر هدفك من حساب السعرات</T>
              <Ionicons name="chevron-back" size={14} color={t.okText} />
            </Pressable>
          </Card>

          <Label>الوزنات اللي سجلتها</Label>
          <Card>
            {shown.map((w, i) => {
              const prev = list[list.indexOf(w) - 1];
              return (
                <React.Fragment key={w.date}>
                  {i ? <Sep /> : null}
                  <View style={s.row}>
                    <T style={{ flex: 1, fontSize: 13.5 }}>{w.date === today ? 'النهارده' : dayLabel(w.date)}</T>
                    {prev ? <T w="num" style={{ fontSize: 12, color: t.mute }}>{iso(signed(w.kg - prev.kg))}</T> : null}
                    <T w="numBold" style={{ fontSize: 14, minWidth: 48, textAlign: 'center' }}>{iso(fmt(w.kg))}</T>
                    <Pressable onPress={() => save(removeWeighIn(list, w.date))} hitSlop={10} accessibilityRole="button" accessibilityLabel={`امسح وزن ${dayLabel(w.date)}`} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: 4 })}>
                      <Ionicons name="trash-outline" size={16} color={t.mute} />
                    </Pressable>
                  </View>
                </React.Fragment>
              );
            })}
            {list.length > 10 ? (
              <>
                <Sep />
                <View style={{ padding: 10 }}>
                  <Btn label={all ? 'اعرض أقل' : `اعرض الكل (${list.length})`} onPress={() => setAll(!all)} />
                </View>
              </>
            ) : null}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  field: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, height: 48, borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 12 },
  input: { flex: 1, fontFamily: F.numBold, fontSize: 18, textAlign: 'center', writingDirection: 'ltr', padding: 0, outlineWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46, paddingHorizontal: 14 },
});
