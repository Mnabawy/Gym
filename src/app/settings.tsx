import React, { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { PROGRAM } from '../data/program';
import { Btn, Card, Label, Pill, Row, Screen, Sep, Stepper, SwitchRow, T } from '../components/ui';
import { storage } from '../lib/storage';
import { deloadOn, useSettings } from '../lib/settings';
import { movesFor, splitShopping, tripDays, TRIPS_MAX, TRIPS_MIN } from '../lib/shop';
import { energyFor } from '../lib/energy';
import { ErrLogRow } from '../components/ErrLogRow';
import { BAR_CHOICES } from '../lib/plates';
import { metaArea, useData } from '../lib/bus';
import { BackupCard } from '../components/BackupCard';
import { NotifySettings } from '../components/NotifySettings';
import { GeneralSettings } from '../components/GeneralSettings';
import { clock, deloadSub, programSub, STEPS, tripLines } from '../lib/settingsView';
import { useTheme } from '../theme';
import { BUILD, buildDateText } from '../lib/buildInfo';

const phone = Platform.OS !== 'web';

export default function SettingsScreen() {
  const t = useTheme();
  const st = useSettings();
  const [confirm, setConfirm] = useState(false);
  const trips = splitShopping(st.shopTrips, undefined, movesFor(tripDays(st.shopTrips).length, st.shopMoves));
  const need = energyFor(st.body);
  // Re-reads the edited program flag (the backup card watches its own keys).
  useData(metaArea('program'));

  return (
    <Screen title="الإعدادات" sub="التمرين والراحة والمشتريات" onBack={() => router.back()}>
      <Label>بياناتك</Label>
      <Pressable onPress={() => router.push('/calories')} accessibilityRole="button" style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
        <Card>
          <Row label="احسب احتياجك من السعرات" sub={need ? `${need.kcal.toLocaleString('en-US')} سعر · ${need.protein} جم بروتين في اليوم` : 'السن والطول والوزن ونشاطك وهدفك'}>
            <Ionicons name="chevron-back" size={20} color={t.mute} />
          </Row>
        </Card>
      </Pressable>

      <Label>نسخة احتياطية</Label>
      <BackupCard />

      <Label>البرنامج</Label>
      <Pressable onPress={() => router.push('/program')} accessibilityRole="button" style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
        <Card>
          <Row label="عدّل البرنامج" sub={programSub(PROGRAM, !!storage.getMeta('program'))}>
            <Ionicons name="chevron-back" size={20} color={t.mute} />
          </Row>
        </Card>
      </Pressable>

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
        <Sep />
        <T w="medium">وزن البار (لحساب الطارات)</T>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {BAR_CHOICES.map((k) => (
            <Pill key={k} num label={`${k} كجم`} on={st.barKg === k} onPress={() => st.setQuiet({ barKg: k })} />
          ))}
        </View>
        <T style={{ color: t.mute, fontSize: 12 }}>البار الأولمبي العادي 20 كجم. بار الـ EZ محسوب 10 كجم.</T>
      </Card>
      <Card>
        <Row
          label="أسبوع خفيف (ديلود)"
          sub={deloadSub(deloadOn(st), st.deloadUntil)}>
          <Btn label={deloadOn(st) ? 'وقّفه' : 'ابدأه'} kind={deloadOn(st) ? 'ghost' : 'solid'} onPress={deloadOn(st) ? st.stopDeload : st.startDeload} />
        </Row>
        <Sep />
        <SwitchRow
          label="زوّد الأوزان تلقائي"
          sub="المجموعات تبدأ بهدف المرة دي: تكرار زيادة لحد آخر المدى، وبعدها وزن زيادة. لو قفلته، تبدأ بأرقام آخر مرة"
          value={st.autoProgress}
          onChange={(v) => st.setQuiet({ autoProgress: v })}
        />
        <Sep />
        <SwitchRow
          label="اسألني كان فاضل كام تكرار"
          sub="بعد كل مجموعة (RIR). لو كان فاضلك 3 أو أكتر في كل المجموعات، التطبيق يقولك تزوّد الوزن حتى لو ما وصلتش لآخر التكرارات"
          value={st.askRir}
          onChange={(v) => st.setQuiet({ askRir: v })}
        />
      </Card>

      <Label>الإشعارات</Label>
      <NotifySettings />

      <Label>المشتريات</Label>
      <Card>
        <Row label="بتشتري كام مرة في الأسبوع" sub="أصناف القايمة بتتقسم بالتساوي على المرات، وكل صنف بيتشرى مرة واحدة بكميته كلها. تختار أصناف كل مرة من زرار التعديل في تاب المشتريات">
          <Stepper value={st.shopTrips} min={TRIPS_MIN} max={TRIPS_MAX} onChange={(v) => st.update({ shopTrips: v })} label="مرات الشراء" />
        </Row>
        <Sep />
        <View style={{ paddingHorizontal: 14, paddingVertical: 10, gap: 4 }}>
          {tripLines(trips).map((line, i) => (
            <T key={i} style={{ color: t.mute, fontSize: 12.5 }}>{line}</T>
          ))}
        </View>
      </Card>

      <Label>عام</Label>
      <GeneralSettings />
      <ErrLogRow />

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
      {/* Build identity: the English part on its own left-to-right line, the Arabic date under it, so they never mix. */}
      <View style={{ alignItems: 'center', marginTop: 4 }}>
        <T style={{ color: t.mute, fontSize: 12, textAlign: 'center', writingDirection: 'ltr' }}>{`GymApp ${BUILD.version} · ${BUILD.sha}`}</T>
        {buildDateText(BUILD.date) ? <T style={{ color: t.mute, fontSize: 12, textAlign: 'center' }}>{`اتبنت ${buildDateText(BUILD.date)}`}</T> : null}
      </View>
    </Screen>
  );
}
