import React, { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { TARGETS } from '../data/nutrition';
import { Card, Label, Pill, Row, Screen, Sep, T } from '../components/ui';
import { ACTIVITY, energyFor, GOAL, inRange, LIMITS, type Activity, type Body, type Goal } from '../lib/energy';
import { parseNum } from '../lib/logic';
import { useSettings } from '../lib/settings';
import { tint, useTheme, font } from '../theme';

type Field = 'age' | 'height' | 'weight' | 'bodyFat';
const FIELDS: { k: Field; label: string; unit: string; decimal?: boolean; optional?: boolean }[] = [
  { k: 'age', label: 'السن', unit: 'سنة' },
  { k: 'height', label: 'الطول', unit: 'سم' },
  { k: 'weight', label: 'الوزن', unit: 'كجم', decimal: true },
  { k: 'bodyFat', label: 'نسبة الدهون', unit: '% · اختياري', decimal: true, optional: true },
];
const n = (x: number) => x.toLocaleString('en-US');
const iso = (s: string) => `⁦${s}⁩`;

export default function Calories() {
  const t = useTheme();
  const body = useSettings((s) => s.body);
  const setBody = useSettings((s) => s.setBody);
  const [text, setText] = useState<Record<Field, string>>(() => {
    const out = {} as Record<Field, string>;
    for (const f of FIELDS) out[f.k] = body[f.k] != null ? String(body[f.k]) : '';
    return out;
  });
  const e = energyFor(body);

  const edit = (k: Field, v: string) => {
    setText((p) => ({ ...p, [k]: v }));
    setBody({ [k]: parseNum(v) } as Partial<Body>);
  };

  const missing = [!body.sex && 'النوع', !inRange('age', body.age) && 'السن', !inRange('height', body.height) && 'الطول', !inRange('weight', body.weight) && 'الوزن'].filter(Boolean);
  const pct = (g: number, kcalPerG: number) => (e ? Math.round(((g * kcalPerG) / e.kcal) * 100) : 0);
  const diff = e ? TARGETS.kcal - e.kcal : 0;

  return (
    <Screen title="احتياجك من السعرات" sub="اكتب بياناتك وهنحسبلك السعرات والماكروز" onBack={() => router.back()}>
      <Label>بياناتك</Label>
      <Card style={{ padding: 14, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <T w="medium" style={{ flex: 1 }}>النوع</T>
          <Pill label="راجل" on={body.sex === 'male'} onPress={() => setBody({ sex: 'male' })} />
          <Pill label="ست" on={body.sex === 'female'} onPress={() => setBody({ sex: 'female' })} />
        </View>
        <View style={s.grid}>
          {FIELDS.map((f) => {
            const v = body[f.k];
            const bad = text[f.k].trim() !== '' && !inRange(f.k, v);
            return (
              <View key={f.k} style={s.cell}>
                <T style={{ color: t.mute, fontSize: 12.5 }}>{`${f.label} (${f.unit})`}</T>
                <TextInput
                  value={text[f.k]}
                  onChangeText={(x) => edit(f.k, x)}
                  keyboardType={f.decimal ? 'decimal-pad' : 'number-pad'}
                  placeholder={f.optional ? 'مش لازم' : '–'}
                  placeholderTextColor={t.mute}
                  accessibilityLabel={f.label}
                  style={[s.input, { backgroundColor: t.soft, color: t.fg, borderColor: bad ? t.warn : 'transparent' }]}
                />
                {bad ? <T style={{ color: t.warn, fontSize: 11.5 }}>{`بين ${LIMITS[f.k][0]} و ${LIMITS[f.k][1]}`}</T> : null}
              </View>
            );
          })}
        </View>
        <T style={{ color: t.mute, fontSize: 12, lineHeight: 18 }}>لو تعرف نسبة الدهون (من جهاز InBody مثلًا) اكتبها، الحساب بيبقى أدق للي عضله كتير.</T>
      </Card>

      <Label>نشاطك</Label>
      <Card>
        {(Object.keys(ACTIVITY) as Activity[]).map((k, i) => {
          const on = body.activity === k;
          return (
            <React.Fragment key={k}>
              {i ? <Sep /> : null}
              <Pressable accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => setBody({ activity: k })} style={s.option}>
                <View style={[s.radio, { borderColor: on ? t.ok : t.line }]}>{on ? <View style={[s.dot, { backgroundColor: t.ok }]} /> : null}</View>
                <View style={{ flex: 1, gap: 1 }}>
                  <T w={on ? 'semi' : 'medium'}>{ACTIVITY[k].label}</T>
                  <T style={{ color: t.mute, fontSize: 12.5 }}>{ACTIVITY[k].sub}</T>
                </View>
              </Pressable>
            </React.Fragment>
          );
        })}
      </Card>

      <Label>هدفك</Label>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {(Object.keys(GOAL) as Goal[]).map((k) => (
          <Pill key={k} label={GOAL[k].label} on={body.goal === k} onPress={() => setBody({ goal: k })} />
        ))}
      </View>

      {!e ? (
        <Card style={{ padding: 14, alignItems: 'center', gap: 4 }}>
          <T w="semi">{`فاضل: ${missing.join('، ')}`}</T>
          <T style={{ color: t.mute, fontSize: 12.5 }}>أول ما تكمّلهم هيظهر احتياجك هنا</T>
        </Card>
      ) : (
        <>
          <Label>احتياجك</Label>
          <View style={[s.hero, { backgroundColor: t.ink }]}>
            <T w="numBold" style={{ color: t.onInk, fontSize: 34, lineHeight: 42 }}>{n(e.kcal)}</T>
            <T w="semi" style={{ color: t.onInk, fontSize: 15 }}>سعر في اليوم</T>
            <T style={{ color: t.onInk, opacity: 0.8, fontSize: 12.5, textAlign: 'center', marginTop: 4 }}>
              {body.goal === 'maintain'
                ? 'قد حرقك بالظبط، وزنك هيفضل ثابت'
                : `${body.goal === 'cut' ? 'أقل' : 'أكتر'} من حرقك بـ ${n(Math.abs(e.tdee - e.kcal))} سعر · ${body.goal === 'cut' ? 'تنزل' : 'تزيد'} حوالي ${iso(String(Math.abs(e.weekly)))} كجم في الأسبوع`}
            </T>
          </View>
          {e.floored ? (
            <View style={{ backgroundColor: t.warnSoft, borderRadius: 12, padding: 12 }}>
              <T style={{ color: t.warn, fontSize: 13 }}>رفعنا الرقم للحد الأدنى الآمن. التنشيف بأقل من كده محتاج متابعة مع مختص.</T>
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', gap: 6 }}>
            {[
              { v: e.protein, l: 'بروتين', c: t.protein, p: pct(e.protein, 4), sub: `${GOAL[body.goal].protein} جم لكل كيلو` },
              { v: e.carbs, l: 'كارب', c: t.carbs, p: pct(e.carbs, 4), sub: 'الباقي' },
              { v: e.fat, l: 'دهون', c: t.fat, p: pct(e.fat, 9), sub: 'ربع السعرات' },
            ].map((x) => (
              <View key={x.l} style={[s.tile, { backgroundColor: tint(x.c, 0.15) }]}>
                <T w="numBold" style={{ fontSize: 18 }}>{`${x.v} جم`}</T>
                <T w="medium" style={{ fontSize: 12.5 }}>{`${x.l} · ${iso(`${x.p}%`)}`}</T>
                <T style={{ fontSize: 11, color: t.mute }}>{x.sub}</T>
              </View>
            ))}
          </View>

          <Card>
            <Row label="الحرق وانت مرتاح" sub={e.formula === 'katch' ? `${iso('BMR')} · من نسبة الدهون (${iso('Katch–McArdle')})` : `${iso('BMR')} · معادلة ${iso('Mifflin–St Jeor')}`}>
              <T w="numBold">{`${n(e.bmr)} سعر`}</T>
            </Row>
            <Sep />
            <Row label="حرق اليوم كله" sub={`${iso('TDEE')} · الحرق وانت مرتاح × ${iso(String(ACTIVITY[body.activity].factor))}`}>
              <T w="numBold">{`${n(e.tdee)} سعر`}</T>
            </Row>
            <Sep />
            <Row label="المية" sub="زوّد نص لتر يوم التمرين">
              <T w="numBold">{`${e.water} لتر`}</T>
            </Row>
            <Sep />
            <Row label="الألياف" sub="من الخضار والفاكهة والعيش البلدي والشوفان">
              <T w="numBold">{`${e.fiber} جم`}</T>
            </Row>
            <Sep />
            <Row label="مؤشر كتلة الجسم" sub={`${e.bmiLabel} · مش دقيق للي عضله كتير`}>
              <T w="numBold">{String(e.bmi)}</T>
            </Row>
            {e.lean != null ? (
              <>
                <Sep />
                <Row label="وزنك من غير دهون" sub="عضل وعضم ومية">
                  <T w="numBold">{`${e.lean} كجم`}</T>
                </Row>
              </>
            ) : null}
          </Card>

          {/* These numbers replace the plan's targets on the food tab (targetsFor in src/lib/energy.ts). */}
          <View style={{ backgroundColor: t.okSoft, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12 }}>
            <T w="medium" style={{ color: t.okText, fontSize: 13 }}>✓ الأرقام دي بقت أهدافك في صفحة الأكل</T>
          </View>

          <Card style={{ padding: 14, gap: 4 }}>
            <T w="semi">مقارنة بنظام الأكل بتاعك</T>
            <T style={{ color: t.mute, fontSize: 13 }}>{`النظام: ${n(TARGETS.kcal)} سعر · ${TARGETS.protein} جم بروتين`}</T>
            <T w="medium" style={{ fontSize: 13.5, color: Math.abs(diff) / e.kcal <= 0.05 ? t.okText : t.warn }}>
              {Math.abs(diff) / e.kcal <= 0.05
                ? 'قريب من احتياجك، كمّل عليه'
                : `النظام ${diff > 0 ? 'أكتر' : 'أقل'} من احتياجك بـ ${n(Math.abs(diff))} سعر`}
            </T>
          </Card>

          <T style={{ color: t.mute, fontSize: 12.5, lineHeight: 20 }}>
            ده تقدير مش رقم نهائي. اوزن نفسك الصبح كل يوم وخد متوسط الأسبوع؛ لو الوزن ما اتحركش ناحية هدفك بعد أسبوعين، عدّل 150–200 سعر.
          </T>
        </>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cell: { flexBasis: '47%', flexGrow: 1, gap: 4 },
  input: { ...font('num'), fontSize: 18, textAlign: 'center', paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, writingDirection: 'ltr', minHeight: 48 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, minHeight: 56 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  hero: { borderRadius: 12, padding: 14, alignItems: 'center' },
  tile: { flex: 1, minWidth: 0, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 10, gap: 1 },
});
