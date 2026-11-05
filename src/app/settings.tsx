import React, { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { DEFAULT_SETS, MONTHS_AR, PROGRAM, SETS_MAX, SETS_MIN, WEEKDAYS_AR } from '../data/program';
import { Btn, Card, Label, Pill, Row, Screen, Sep, Stepper, SwitchRow, T } from '../components/ui';
import { useVersePopup } from '../components/VersePopup';
import { WorkoutChips } from '../components/WorkoutChips';
import { countAr, dateKey, DAYS, formatClock, SETS } from '../lib/logic';
import { currentWorkout, seqIndex } from '../lib/schedule';
import { storage } from '../lib/storage';
import { useSettings } from '../lib/settings';
import { movesFor, splitShopping, tripDays, TRIPS_MAX, TRIPS_MIN } from '../lib/shop';
import { energyFor } from '../lib/energy';
import { refreshPlace } from '../lib/place';
import { METHODS, type Method } from '../lib/prayer';
import { BACKUP_STALE_DAYS, backupInfo, LAST_BACKUP_KEY, parseBackup, type BackupInfo } from '../lib/backup';
import { copyBackup, pasteBackup, pickBackup, saveBackup } from '../lib/backupIO';
import { daysBetween } from '../lib/gaps';
import { BAR_CHOICES } from '../lib/plates';
import { allowReminders } from '../lib/reminder';
import { useDataVersion } from '../lib/bus';
import type { Dump } from '../lib/storage.types';
import { useTheme } from '../theme';

const phone = Platform.OS !== 'web';
const clock = (sec: number) => formatClock(sec * 1000);
const STEPS = [1, 1.25, 2.5, 5];
const ITEMS: [string, string, string, string] = ['صنف واحد', 'صنفين', 'أصناف', 'صنف'];
const itemsAr = (n: number) => (n ? countAr(n, ITEMS) : 'مفيش حاجة');
/** Minutes after midnight → "7:30 م". */
const timeAr = (m: number) => {
  const h = Math.floor(m / 60), mm = m % 60;
  return `${h % 12 || 12}:${String(mm).padStart(2, '0')} ${h < 12 ? 'ص' : 'م'}`;
};
const WEEK = [6, 0, 1, 2, 3, 4, 5]; // Sat → Fri
const dayAr = (k: string) => `${+k.slice(8)} ${MONTHS_AR[+k.slice(5, 7) - 1]} ${k.slice(0, 4)}`;
const infoAr = (i: BackupInfo) =>
  !i.sets && !i.meals ? 'مفيش تسجيل لسه' : `${countAr(i.sets, SETS)} في ${countAr(i.days, DAYS)}${i.from && i.to ? ` (من ${dayAr(i.from)} لـ ${dayAr(i.to)})` : ''} · ${countAr(i.meals, ['وجبة', 'وجبتين', 'وجبات', 'وجبة'])}`;

export default function SettingsScreen() {
  const t = useTheme();
  const st = useSettings();
  // Same workouts and order as the workout tab; opens on the one that's due now.
  const [due] = useState(() => currentWorkout(storage.trainedDays(), dateKey()).id);
  const [day, setDay] = useState(due);
  const [confirm, setConfirm] = useState(false);
  const plan = PROGRAM.find((d) => d.weekday === day)!;
  const changed = plan.exercises.filter((e) => st.sets[e.id] != null);
  const total = plan.exercises.reduce((a, e) => a + e.sets, 0);
  const trips = splitShopping(st.shopTrips, undefined, movesFor(tripDays(st.shopTrips).length, st.shopMoves));
  const need = energyFor(st.body);
  useDataVersion((x) => x.v);
  const today = dateKey();
  const lastBackup = storage.getMeta(LAST_BACKUP_KEY);
  const since = lastBackup ? daysBetween(lastBackup, today) : null;
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [denied, setDenied] = useState(false);
  const [pending, setPending] = useState<{ data: Dump; info: BackupInfo; exportedAt: string | null } | null>(null);
  const mine = backupInfo(storage.dump());

  const run = async (f: () => Promise<void>) => {
    setMsg(null);
    try {
      await f();
    } catch {
      setMsg({ text: 'حصلت مشكلة، جرّب تاني.', bad: true });
    }
  };
  const done = (text: string) => {
    storage.setMeta(LAST_BACKUP_KEY, today);
    useDataVersion.getState().bump();
    setMsg({ text });
  };
  const load = (text: string | null) => {
    if (text == null) return;
    const p = parseBackup(text);
    if (!p.ok) return setMsg({ text: p.error, bad: true });
    setPending({ data: p.data, info: p.info, exportedAt: p.exportedAt });
  };
  const restore = () => {
    if (!pending) return;
    storage.restore(pending.data);
    st.reload();
    setPending(null);
    setMsg({ text: 'رجّعت النسخة ✓' });
  };

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

      <Label>نسخة احتياطية</Label>
      <Card>
        <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4, gap: 3 }}>
          <T w="medium" style={{ color: since == null || since >= BACKUP_STALE_DAYS ? t.warn : t.okText }}>
            {since == null ? 'لسه ما عملتش نسخة احتياطية' : since === 0 ? 'آخر نسخة النهارده ✓' : `آخر نسخة من ${countAr(since, DAYS)}`}
          </T>
          <T style={{ color: t.mute, fontSize: 12.5, lineHeight: 19 }}>
            {`كل حاجة متسجلة على الموبايل بس. احفظ ملف على Drive أو ابعته لنفسك، عشان لو مسحت التطبيق أو غيّرت الموبايل ترجّعه. عندك دلوقتي: ${infoAr(mine)}`}
          </T>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12 }}>
          <Btn label="احفظ نسخة" kind="solid" style={{ flexGrow: 1 }} onPress={() => run(async () => done((await saveBackup()) === 'copied' ? 'اتنسخت في الحافظة، الصقها في رسالة لنفسك' : 'اتحفظت ✓'))} />
          <Btn label="انسخها" style={{ flexGrow: 1 }} onPress={() => run(async () => { await copyBackup(); done('اتنسخت، الصقها في رسالة لنفسك أو في ملاحظة'); })} />
        </View>
        <Sep />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12 }}>
          <Btn label="رجّع من ملف" style={{ flexGrow: 1 }} onPress={() => run(async () => load(await pickBackup()))} />
          <Btn label="رجّع من الحافظة" style={{ flexGrow: 1 }} onPress={() => run(async () => load(await pasteBackup()))} />
        </View>
        {pending ? (
          <View style={{ marginHorizontal: 12, marginBottom: 12, padding: 12, borderRadius: 12, backgroundColor: t.warnSoft, gap: 8 }}>
            <T w="semi" style={{ color: t.warn }}>{`النسخة دي${pending.exportedAt ? ` (اتعملت ${dayAr(pending.exportedAt.slice(0, 10))})` : ''} فيها ${infoAr(pending.info)}`}</T>
            <T style={{ fontSize: 12.5, lineHeight: 19 }}>هتمسح كل اللي على الموبايل دلوقتي (التمرين والأكل والإعدادات) وتحط النسخة دي مكانه. متأكد؟</T>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Btn label="أيوه رجّعها" kind="solid" style={{ flex: 1 }} onPress={restore} />
              <Btn label="لا" onPress={() => setPending(null)} />
            </View>
          </View>
        ) : null}
        {msg ? <T accessibilityLiveRegion="polite" style={{ color: msg.bad ? t.bad : t.okText, fontSize: 13, paddingHorizontal: 14, paddingBottom: 12 }}>{msg.text}</T> : null}
      </Card>

      <Label>عدد المجموعات لكل تمرين</Label>
      <Card>
        <View style={{ padding: 10, paddingBottom: 6 }}>
          <WorkoutChips value={day} current={due} onChange={setDay} />
        </View>
        <View style={{ paddingHorizontal: 14, paddingBottom: 8, gap: 1 }}>
          <T style={{ color: t.mute, fontSize: 12.5 }}>{`تمرين ${seqIndex(day) + 1} من ${PROGRAM.length} · ${plan.exercises.length} تمارين · ${total} مجموعة`}</T>
          <T w="bold" style={{ fontSize: 16 }}>{plan.titleAr}</T>
        </View>
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
                  <T style={{ color: t.mute, fontSize: 12 }}>
                    {`${e.repLow}–${e.repHigh} تكرار`}
                    {diff ? <T style={{ color: t.okText, fontSize: 12 }}>{` · الأصلي ${base} مجموعات`}</T> : null}
                  </T>
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
              <Btn label="رجّع التمرين ده للأصلي" onPress={() => changed.forEach((e) => st.setSets(e.id, DEFAULT_SETS[e.id]))} />
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
        <Sep />
        <T w="medium">وزن البار (لحساب الطارات)</T>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {BAR_CHOICES.map((k) => (
            <Pill key={k} num label={`${k} كجم`} on={st.barKg === k} onPress={() => st.setQuiet({ barKg: k })} />
          ))}
        </View>
        <T style={{ color: t.mute, fontSize: 12 }}>البار الأولمبي العادي 20 كجم. بار الـ EZ محسوب 10 كجم.</T>
      </Card>

      <Label>تذكير التمرين</Label>
      <Card>
        <SwitchRow
          label="فكّرني بالتمرين"
          sub={phone ? 'إشعار في الميعاد فيه اسم التمرين اللي عليه الدور، ومش بيجي لو اتمرنت النهارده' : 'على الموبايل بس'}
          value={st.reminder}
          disabled={!phone}
          onChange={async (v) => {
            const ok = !v || (await allowReminders());
            setDenied(!ok);
            if (ok) st.setQuiet({ reminder: v });
          }}
        />
        {denied ? <T style={{ color: t.bad, fontSize: 12.5, paddingHorizontal: 14, paddingBottom: 10 }}>اسمح للتطبيق بالإشعارات من إعدادات الموبايل الأول</T> : null}
        {st.reminder ? (
          <>
            <Sep />
            <Row label="الميعاد">
              <Stepper value={st.reminderTime} min={0} max={24 * 60 - 15} step={15} onChange={(v) => st.setQuiet({ reminderTime: v })} label="ميعاد التذكير" format={timeAr} />
            </Row>
            <Sep />
            <View style={{ padding: 14, gap: 10 }}>
              <T w="medium">الأيام</T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {WEEK.map((wd) => {
                  const on = st.reminderDays.includes(wd);
                  return <Pill key={wd} label={WEEKDAYS_AR[wd]} on={on} onPress={() => st.setQuiet({ reminderDays: on ? st.reminderDays.filter((d) => d !== wd) : [...st.reminderDays, wd].sort() })} />;
                })}
              </View>
            </View>
          </>
        ) : null}
      </Card>

      <Label>المشتريات</Label>
      <Card>
        <Row label="بتشتري كام مرة في الأسبوع" sub="أصناف القايمة بتتقسم بالتساوي على المرات، وكل صنف بيتشرى مرة واحدة بكميته كلها. تختار أصناف كل مرة من زرار التعديل في تاب المشتريات">
          <Stepper value={st.shopTrips} min={TRIPS_MIN} max={TRIPS_MAX} onChange={(v) => st.update({ shopTrips: v })} label="مرات الشراء" />
        </Row>
        <Sep />
        <View style={{ paddingHorizontal: 14, paddingVertical: 10, gap: 4 }}>
          {trips.length === 1 ? (
            <T style={{ color: t.mute, fontSize: 12.5 }}>مرة واحدة كل جمعة للأسبوع كله</T>
          ) : (
            trips.map((d, i) => (
              <T key={i} style={{ color: t.mute, fontSize: 12.5 }}>{`المرة ${i + 1}: ${d.label} · ${itemsAr(d.groups.reduce((a, g) => a + g.items.length, 0))}`}</T>
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

      <Label>مواقيت الصلاة</Label>
      <Card>
        <SwitchRow
          label="اعرض مواقيت الصلاة"
          sub="أيقونة في هيدر صفحة التمرين، بتحسب المواقيت من مكانك الحالي"
          value={st.prayer}
          onChange={(v) => {
            st.setQuiet({ prayer: v });
            if (v && !st.place) refreshPlace();
          }}
        />
        {st.prayer ? (
          <>
            <Sep />
            <View style={{ padding: 14, gap: 10 }}>
              <T w="medium">طريقة الحساب</T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {(Object.keys(METHODS) as Method[]).map((k) => (
                  <Pill key={k} label={METHODS[k].label} on={st.prayerMethod === k} onPress={() => st.setQuiet({ prayerMethod: k })} />
                ))}
              </View>
            </View>
            <Sep />
            <Row label="المكان" sub={st.place ? st.place.name ?? `${st.place.lat.toFixed(2)}, ${st.place.lng.toFixed(2)}` : 'لسه ما اتحددش'}>
              <Btn label="حدّث" onPress={() => refreshPlace()} />
            </Row>
          </>
        ) : null}
      </Card>

      <Label>عام</Label>
      <Card>
        <SwitchRow label="وضع النيون في صفحة التمرين" sub="خلفية غامقة وألوان بتنور" value={st.neonMode} onChange={(v) => st.setQuiet({ neonMode: v })} />
        <Sep />
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
