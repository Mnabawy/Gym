import React, { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { MONTHS_AR } from '../data/program';
import { Btn, Card, Label, Screen, Sep, Sheet, T } from '../components/ui';
import { E1rmChart } from '../components/E1rmChart';
import { GOAL } from '../lib/energy';
import { dateKey, parseNum } from '../lib/logic';
import { useSettings } from '../lib/settings';
import { storage } from '../lib/storage';
import { useDataVersion } from '../lib/bus';
import { bodyOn, latestParts, navyBodyFat, addMeasure, addWeighIn, measureChange, MEASURES_KEY, parseMeasures, parseWeights, PARTS, rateBand, rateVerdict, removeWeighIn, validWeight, waistNote, weeklyRate, WEIGHTS_KEY, type Measure, type Part, type WeighIn } from '../lib/weight';
import { addPhoto, deletePhoto, listPhotos, photosSupported, type Photo } from '../lib/photos';
import { F, useTheme, type Theme } from '../theme';

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

  // Measurements
  const measures = parseMeasures(storage.getMeta(MEASURES_KEY));
  const [mForm, setMForm] = useState<Record<Part, string> | null>(null);
  const openMeasure = () => {
    const cur = measures.find((m) => m.date === today);
    setMForm(Object.fromEntries(PARTS.map((p) => [p.k, cur?.[p.k] != null ? String(cur[p.k]) : ''])) as Record<Part, string>);
  };
  const saveMeasure = () => {
    if (!mForm) return;
    const m: Measure = { date: today };
    for (const p of PARTS) {
      const v = parseNum(mForm[p.k]);
      if (v != null) m[p.k] = v;
    }
    storage.setMeta(MEASURES_KEY, JSON.stringify(addMeasure(measures, m)));
    setMForm(null);
    bump();
  };
  const note = waistNote(measures, body.goal);
  // Body fat from the tape (US Navy method), once the calculator has your sex and height.
  const bf = body.sex && body.height ? navyBodyFat(body.sex, body.height, latestParts(measures)) : null;

  // Photos (phone only)
  const [photos, setPhotos] = useState<Photo[]>(() => (photosSupported ? listPhotos() : []));
  const [view, setView] = useState<Photo | 'compare' | null>(null);
  /** Weight, waist and body fat around a photo's date. */
  const at = (date: string) => bodyOn(date, list, measures, body.sex, body.height);
  const take = async (from: 'camera' | 'library') => {
    try {
      if (await addPhoto(from)) setPhotos(listPhotos());
    } catch {}
  };

  return (
    <Screen title="وزنك والقياسات" sub="اتوزن الصبح بعد الحمام وقبل الأكل، نفس الميزان" onBack={() => router.back()}>
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

      <Label>القياسات (سم)</Label>
      <Card>
        {measures.length ? (
          PARTS.map((p, i) => {
            const c = measureChange(measures, p.k);
            return (
              <React.Fragment key={p.k}>
                {i ? <Sep /> : null}
                <View style={s.row}>
                  <T style={{ flex: 1, fontSize: 13.5 }}>{p.label}</T>
                  {c?.change != null ? <T w="num" style={{ fontSize: 12, color: t.mute }}>{`${iso(signed(c.change))} من ${dayLabel(c.since)}`}</T> : null}
                  <T w="numBold" style={{ fontSize: 14, minWidth: 48, textAlign: 'center' }}>{c ? iso(fmt(c.last)) : '–'}</T>
                </View>
              </React.Fragment>
            );
          })
        ) : (
          <T style={{ color: t.mute, fontSize: 13, padding: 14 }}>الوزن لوحده مش بيقول الزيادة عضل ولا دهون. قيس كل أسبوعين لـ 4 أسابيع، نفس الوقت ونفس المكان.</T>
        )}
        {note ? <T style={{ fontSize: 12.5, paddingHorizontal: 14, paddingBottom: 6, color: note.includes('✓') ? t.okText : t.warn }}>{note}</T> : null}
        {measures.length ? (
          <View style={[s.bf, { backgroundColor: t.soft }]}>
            {bf != null ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                  <T w="medium" style={{ flex: 1 }}>نسبة الدهون التقريبية</T>
                  <T w="numBold" style={{ fontSize: 18 }}>{iso(`${fmt(bf)}%`)}</T>
                </View>
                <T style={{ fontSize: 11.5, color: t.mute, lineHeight: 17 }}>من الوسط والرقبة{body.sex === 'female' ? ' والأرداف' : ''} وطولك (طريقة البحرية الأمريكية). ممكن تبعد 3–4% عن الحقيقة، فتابع اتجاهها مش الرقم بالظبط.</T>
                {body.bodyFat !== bf ? <Btn label="استخدمها في حساب السعرات" onPress={() => setBody({ bodyFat: bf })} /> : <T style={{ fontSize: 12, color: t.okText }}>مستخدمة في حساب السعرات ✓</T>}
              </>
            ) : (
              <T style={{ fontSize: 12.5, color: t.mute, lineHeight: 19 }}>
                {!body.sex || !body.height ? 'عشان تتحسب نسبة الدهون، اكتب نوعك وطولك في حساب السعرات.' : `عشان تتحسب نسبة الدهون، قيس الوسط والرقبة${body.sex === 'female' ? ' والأرداف' : ''}.`}
              </T>
            )}
          </View>
        ) : null}
        <View style={{ padding: 10 }}>
          <Btn label={measures.some((m) => m.date === today) ? 'عدّل قياسات النهارده' : 'سجّل قياسات النهارده'} onPress={openMeasure} />
        </View>
      </Card>

      <Label>صور التقدم</Label>
      <Card style={{ padding: 12, gap: 10 }}>
        {!photosSupported ? (
          <T style={{ color: t.mute, fontSize: 13 }}>الصور على الموبايل بس.</T>
        ) : (
          <>
            <T style={{ color: t.mute, fontSize: 12.5, lineHeight: 19 }}>نفس الإضاءة والمكان والوقفة كل مرة. الصور بتدخل في النسخة الاحتياطية لما تدوس «احفظ نسخة» (مش «انسخها»)، وفي النسخة التلقائية اللي في الفولدر بتاعك.</T>
            {photos.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {photos.slice().reverse().map((p) => (
                  <Pressable key={p.name} onPress={() => setView(p)} accessibilityRole="imagebutton" accessibilityLabel={`صورة ${dayLabel(p.date)}`} style={{ gap: 3, alignItems: 'center' }}>
                    <Image source={{ uri: p.uri }} style={[s.thumb, { backgroundColor: t.soft }]} />
                    <T style={{ fontSize: 11, color: t.mute }}>{dayLabel(p.date)}</T>
                    {at(p.date).kg != null ? <T w="num" style={{ fontSize: 11 }}>{`${iso(fmt(at(p.date).kg!))} كجم`}</T> : null}
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Btn label="صوّر" kind="solid" style={{ flex: 1 }} onPress={() => take('camera')} />
              <Btn label="من المعرض" style={{ flex: 1 }} onPress={() => take('library')} />
            </View>
            {photos.length >= 2 ? <Btn label="قارن أول صورة بآخر صورة" onPress={() => setView('compare')} /> : null}
          </>
        )}
      </Card>

      <Sheet visible={mForm != null} onClose={() => setMForm(null)} title="قياسات النهارده" sub="بالسنتيمتر. سيب اللي مش هتقيسه فاضي">
        {mForm
          ? PARTS.map((p) => (
              <View key={p.k} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <T w="medium">{p.label}</T>
                  <T style={{ fontSize: 11.5, color: t.mute }}>{p.hint}</T>
                </View>
                <TextInput
                  value={mForm[p.k]}
                  onChangeText={(v) => setMForm({ ...mForm, [p.k]: v.replace(/[^0-9.,٠-٩۰-۹٫]/g, '') })}
                  keyboardType="decimal-pad"
                  placeholder="–"
                  placeholderTextColor={t.mute}
                  maxLength={5}
                  accessibilityLabel={`${p.label} بالسنتيمتر`}
                  style={[s.small, { color: t.fg, backgroundColor: t.soft }]}
                />
              </View>
            ))
          : null}
        <Btn label="احفظ" kind="solid" onPress={saveMeasure} />
      </Sheet>

      <Sheet visible={view != null} onClose={() => setView(null)} title={view === 'compare' ? `${dayLabel(photos[0]?.date ?? today)} ← ${dayLabel(photos[photos.length - 1]?.date ?? today)}` : view ? dayLabel(view.date) : ''}>
        {view === 'compare' ? (
          (() => {
            const a = photos[0], b = photos[photos.length - 1];
            const A = at(a.date), B = at(b.date);
            const diff = [
              A.kg != null && B.kg != null ? `الوزن ${iso(signed(Math.round((B.kg - A.kg) * 10) / 10))} كجم` : null,
              A.waist != null && B.waist != null ? `الوسط ${iso(signed(Math.round((B.waist - A.waist) * 10) / 10))} سم` : null,
              A.bf != null && B.bf != null ? `الدهون ${iso(`${signed(Math.round((B.bf - A.bf) * 10) / 10)}%`)}` : null,
            ].filter(Boolean);
            return (
              <>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {[a, b].map((p) => (
                    <View key={p.name} style={{ flex: 1, gap: 4 }}>
                      <Image source={{ uri: p.uri }} style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: 10 }} resizeMode="cover" />
                      <BodyLine t={t} b={at(p.date)} />
                    </View>
                  ))}
                </View>
                {diff.length ? <T w="semi" style={{ fontSize: 13, textAlign: 'center' }}>{`الفرق: ${diff.join(' · ')}`}</T> : null}
              </>
            );
          })()
        ) : view ? (
          <>
            <Image source={{ uri: view.uri }} style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: 12 }} resizeMode="contain" />
            <BodyLine t={t} b={at(view.date)} />
            <Btn label="امسح الصورة" onPress={() => { deletePhoto(view); setPhotos(listPhotos()); setView(null); }} />
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}

/** "80.6 كجم · وسط 84 · دهون 14.8%" under a photo; whatever is known around its date. */
function BodyLine({ t, b }: { t: Theme; b: { kg: number | null; waist: number | null; bf: number | null } }) {
  const parts = [b.kg != null ? `${fmt(b.kg)} كجم` : null, b.waist != null ? `وسط ${fmt(b.waist)}` : null, b.bf != null ? `دهون ${fmt(b.bf)}%` : null].filter(Boolean);
  return <T w="num" style={{ fontSize: 12, color: parts.length ? t.fg : t.mute, textAlign: 'center' }}>{parts.length ? iso(parts.join(' · ')) : 'مفيش وزن متسجل قريب من اليوم ده'}</T>;
}

const s = StyleSheet.create({
  field: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, height: 48, borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 12 },
  input: { flex: 1, fontFamily: F.numBold, fontSize: 18, textAlign: 'center', writingDirection: 'ltr', padding: 0, outlineWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46, paddingHorizontal: 14 },
  bf: { marginHorizontal: 12, marginTop: 4, padding: 12, borderRadius: 12, gap: 6 },
  small: { width: 80, height: 42, borderRadius: 10, fontFamily: F.numBold, fontSize: 15, textAlign: 'center', writingDirection: 'ltr', padding: 0, outlineWidth: 0 },
  thumb: { width: 84, height: 112, borderRadius: 10 },
});
