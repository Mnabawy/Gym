import React, { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { DEFAULT_SETS, PROGRAM, SETS_MAX, SETS_MIN, WEEKDAYS_AR } from '../data/program';
import { Btn, Card, Label, Pill, Row, Screen, Sep, Stepper, SwitchRow, T } from '../components/ui';
import { useVersePopup } from '../components/VersePopup';
import { formatClock } from '../lib/logic';
import { useSettings } from '../lib/settings';
import { tripDays, daysLabel, TRIPS_MAX, TRIPS_MIN } from '../lib/shop';
import { energyFor } from '../lib/energy';
import { useTheme } from '../theme';

const phone = Platform.OS !== 'web';
const clock = (sec: number) => formatClock(sec * 1000);
const STEPS = [1, 1.25, 2.5, 5];

export default function SettingsScreen() {
  const t = useTheme();
  const st = useSettings();
  const [day, setDay] = useState(() => PROGRAM.find((d) => d.weekday === new Date().getDay())?.weekday ?? PROGRAM[0].weekday);
  const [confirm, setConfirm] = useState(false);
  const plan = PROGRAM.find((d) => d.weekday === day)!;
  const changed = plan.exercises.filter((e) => st.sets[e.id] != null);
  const total = plan.exercises.reduce((a, e) => a + e.sets, 0);
  const trips = tripDays(st.shopTrips);
  const need = energyFor(st.body);

  return (
    <Screen title="الإعدادات" sub="التمرين والراحة والمشتريات والآية" onBack={() => router.back()}>
      <Label>بياناتك</Label>
      <Pressable onPress={() => router.push('/calories')} accessibilityRole="button" style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
        <Card>
          <Row label="احسب احتياجك من السعرات" sub={need ? `${need.kcal.toLocaleString('en-US')} سعر · ${need.protein} جم بروتين في اليوم` : 'السن والطول والوزن ونشاطك وهدفك'}>
            <Ionicons name="chevron-back" size={20} color={t.mute} />
          </Row>
        </Card>
      </Pressable>

      <Label>عدد المجموعات لكل تمرين</Label>
      <Card>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 12, paddingBottom: 6 }}>
          {PROGRAM.map((d) => (
            <Pill key={d.weekday} label={WEEKDAYS_AR[d.weekday]} on={d.weekday === day} onPress={() => setDay(d.weekday)} />
          ))}
        </View>
        <T style={{ color: t.mute, fontSize: 12.5, paddingHorizontal: 14, paddingBottom: 4 }}>{`${plan.titleAr} · ${total} مجموعة في اليوم`}</T>
        {plan.exercises.map((e) => {
          const base = DEFAULT_SETS[e.id];
          const diff = e.sets !== base;
          return (
            <React.Fragment key={e.id}>
              <Sep />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 8, minHeight: 56 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.muscle[e.muscle] }} />
                <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                  <T w="num" style={{ fontSize: 14.5 }} numberOfLines={2}>{e.name}</T>
                  <T style={{ color: diff ? t.okText : t.mute, fontSize: 12 }}>{diff ? `الأصلي ${base} · اتغيّر` : `${e.repLow}–${e.repHigh} تكرار`}</T>
                </View>
                <Stepper value={e.sets} min={SETS_MIN} max={SETS_MAX} onChange={(v) => st.setSets(e.id, v)} label={`مجموعات ${e.name}`} />
              </View>
            </React.Fragment>
          );
        })}
        {changed.length ? (
          <>
            <Sep />
            <View style={{ padding: 12 }}>
              <Btn label="رجّع اليوم ده للأصلي" onPress={() => changed.forEach((e) => st.setSets(e.id, DEFAULT_SETS[e.id]))} />
            </View>
          </>
        ) : null}
      </Card>

      <Label>الراحة</Label>
      <Card>
        <Row label="راحة التمارين التقيلة" sub="الأصلي 2:30">
          <Stepper value={st.restHeavy} min={60} max={300} step={15} onChange={(v) => st.update({ restHeavy: v })} label="راحة التمارين التقيلة" format={clock} />
        </Row>
        <Sep />
        <Row label="راحة باقي التمارين" sub="الأصلي 1:30">
          <Stepper value={st.restNormal} min={30} max={240} step={15} onChange={(v) => st.update({ restNormal: v })} label="راحة باقي التمارين" format={clock} />
        </Row>
        <Sep />
        <SwitchRow label="شغّل عداد الراحة لوحده" sub="أول ما تعلّم ✓ على مجموعة" value={st.autoRest} onChange={(v) => st.update({ autoRest: v })} />
        <Sep />
        <SwitchRow label="نبّهني لما الراحة تخلص" sub={phone ? 'إشعار لو التطبيق في الخلفية' : 'على الموبايل بس'} value={st.restAlert} onChange={(v) => st.update({ restAlert: v })} />
        <Sep />
        <SwitchRow label="سيب الشاشة منورة وقت الراحة" sub={phone ? undefined : 'على الموبايل بس'} value={st.keepAwake} onChange={(v) => st.update({ keepAwake: v })} />
      </Card>

      <Label>التدرّج</Label>
      <Card style={{ padding: 14, gap: 10 }}>
        <T w="medium">زوّد كام كجم لما تكمّل كل التكرارات</T>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {STEPS.map((k) => (
            <Pill key={k} num label={`${k} كجم`} on={st.weightStep === k} onPress={() => st.update({ weightStep: k })} />
          ))}
        </View>
      </Card>

      <Label>المشتريات</Label>
      <Card>
        <Row label="بتشتري كام مرة في الأسبوع" sub="القايمة بتتقسم على الأيام، والحاجات الناشفة والبرطمانات بتتشرى مرة واحدة">
          <Stepper value={st.shopTrips} min={TRIPS_MIN} max={TRIPS_MAX} onChange={(v) => st.update({ shopTrips: v })} label="مرات الشراء" />
        </Row>
        <Sep />
        <View style={{ paddingHorizontal: 14, paddingVertical: 10, gap: 4 }}>
          {trips.length === 1 ? (
            <T style={{ color: t.mute, fontSize: 12.5 }}>مرة واحدة كل جمعة للأسبوع كله</T>
          ) : (
            trips.map((d, i) => (
              <T key={i} style={{ color: t.mute, fontSize: 12.5 }}>{`المرة ${i + 1}: أكل ${daysLabel(d)}`}</T>
            ))
          )}
        </View>
      </Card>

      <Label>الآية القرآنية</Label>
      <Card>
        <SwitchRow label="اعرض آية لما أفتح التطبيق" value={st.verse} onChange={(v) => st.update({ verse: v })} />
        <Sep />
        <SwitchRow label="ولما أرجع بعد نص ساعة أو أكتر" disabled={!st.verse} value={st.verseOnReturn} onChange={(v) => st.update({ verseOnReturn: v })} />
        <Sep />
        <View style={{ padding: 12 }}>
          <Btn label="اعرض آية دلوقتي" onPress={() => useVersePopup.getState().show()} />
        </View>
      </Card>

      <Label>عام</Label>
      <Card>
        <SwitchRow label="اهتزاز خفيف" sub={phone ? 'مع ✓ ولما الراحة تخلص' : 'على الموبايل بس'} value={st.haptics} onChange={(v) => st.update({ haptics: v })} />
      </Card>

      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 6 }}>
        {!confirm ? (
          <Btn label="رجّع كل الإعدادات للأصلي" onPress={() => setConfirm(true)} style={{ flex: 1 }} />
        ) : (
          <>
            <T style={{ color: t.mute }}>متأكد؟</T>
            <Btn label="أيوه رجّعها" kind="solid" onPress={() => { st.reset(); setConfirm(false); }} style={{ flex: 1 }} />
            <Btn label="لا" onPress={() => setConfirm(false)} />
          </>
        )}
      </View>
      <T style={{ color: t.mute, fontSize: 12, textAlign: 'center' }}>تغيير الإعدادات مبيمسحش أي حاجة اتسجلت قبل كده</T>
    </Screen>
  );
}
