import React, { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { MONTHS_AR, PROGRAM, WEEKDAYS_AR } from '../data/program';
import { Btn, Card, Label, Pill, Row, Screen, Sep, Stepper, SwitchRow, T } from '../components/ui';
import { useVersePopup } from '../components/VersePopup';
import { countAr, dateKey, DAYS, formatClock, SETS } from '../lib/logic';
import { storage } from '../lib/storage';
import { useSettings } from '../lib/settings';
import { movesFor, splitShopping, tripDays, TRIPS_MAX, TRIPS_MIN } from '../lib/shop';
import { energyFor } from '../lib/energy';
import { refreshPlace } from '../lib/place';
import { METHODS, type Method } from '../lib/prayer';
import { BACKUP_STALE_DAYS, backupInfo, LAST_BACKUP_KEY, parseBackup, type BackupInfo, type PhotoData } from '../lib/backup';
import { copyBackup, pasteBackup, pickBackup, saveBackup } from '../lib/backupIO';
import { AUTO_DAYS, AUTO_ERROR_KEY, AUTO_KEEP, autoSupported, listAutoBackups, pickBackupDir, readAutoBackup, runAutoBackup } from '../lib/autoBackup';
import { daysBetween } from '../lib/gaps';
import { BAR_CHOICES } from '../lib/plates';
import { allowReminders } from '../lib/reminder';
import { useDataVersion } from '../lib/bus';
import type { Dump } from '../lib/storage.types';
import { listPhotos, photosSupported } from '../lib/photos';
import { applyBackup } from '../lib/restore';
import { DRIVE_AT, DRIVE_ERROR, DRIVE_USER, driveSupported, fetchDrive, linkDrive, syncDrive, unlinkDrive } from '../lib/drive';
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
const PHOTOS: [string, string, string, string] = ['صورة', 'صورتين', 'صور', 'صورة'];
const infoAr = (i: BackupInfo) =>
  !i.sets && !i.meals && !i.photos
    ? 'مفيش تسجيل لسه'
    : `${countAr(i.sets, SETS)} في ${countAr(i.days, DAYS)}${i.from && i.to ? ` (من ${dayAr(i.from)} لـ ${dayAr(i.to)})` : ''} · ${countAr(i.meals, ['وجبة', 'وجبتين', 'وجبات', 'وجبة'])}${i.photos ? ` · ${countAr(i.photos, PHOTOS)}` : ''}`;

export default function SettingsScreen() {
  const t = useTheme();
  const st = useSettings();
  const [confirm, setConfirm] = useState(false);
  const trips = splitShopping(st.shopTrips, undefined, movesFor(tripDays(st.shopTrips).length, st.shopMoves));
  const need = energyFor(st.body);
  useDataVersion((x) => x.v);
  const today = dateKey();
  const lastBackup = storage.getMeta(LAST_BACKUP_KEY);
  const since = lastBackup ? daysBetween(lastBackup, today) : null;
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [denied, setDenied] = useState(false);
  const [pending, setPending] = useState<{ data: Dump; photos: PhotoData[]; info: BackupInfo; exportedAt: string | null } | null>(null);
  const mine = backupInfo(storage.dump(), photosSupported ? listPhotos().length : 0);

  const run = async (f: () => Promise<void>) => {
    setMsg(null);
    try {
      await f();
    } catch (e) {
      // The error text helps when Google sign-in isn't set up right (e.g. DEVELOPER_ERROR = wrong SHA-1 or package).
      const why = String((e as { code?: string; message?: string })?.code ?? (e as Error)?.message ?? '').slice(0, 80);
      setMsg({ text: `حصلت مشكلة، جرّب تاني.${why ? ` (${why})` : ''}`, bad: true });
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
    setPending({ data: p.data, photos: p.photos, info: p.info, exportedAt: p.exportedAt });
  };
  const restore = () => {
    if (!pending) return;
    const added = applyBackup(pending.data, pending.photos);
    setPending(null);
    setMsg({ text: added ? `رجّعت النسخة ✓ ومعاها ${countAr(added, PHOTOS)}` : 'رجّعت النسخة ✓' });
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
          <Btn label="انسخها" style={{ flexGrow: 1 }} onPress={() => run(async () => { await copyBackup(); done('اتنسخت من غير الصور، الصقها في رسالة لنفسك أو في ملاحظة'); })} />
        </View>
        <Sep />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12 }}>
          <Btn label="رجّع من ملف" style={{ flexGrow: 1 }} onPress={() => run(async () => load(await pickBackup()))} />
          <Btn label="رجّع من الحافظة" style={{ flexGrow: 1 }} onPress={() => run(async () => load(await pasteBackup()))} />
        </View>
        {pending ? (
          <View style={{ marginHorizontal: 12, marginBottom: 12, padding: 12, borderRadius: 12, backgroundColor: t.warnSoft, gap: 8 }}>
            <T w="semi" style={{ color: t.warn }}>{`النسخة دي${pending.exportedAt ? ` (اتعملت ${dayAr(pending.exportedAt.slice(0, 10))})` : ''} فيها ${infoAr(pending.info)}`}</T>
            <T style={{ fontSize: 12.5, lineHeight: 19 }}>هتمسح كل اللي على الموبايل دلوقتي (التمرين والأكل والإعدادات) وتحط النسخة دي مكانه. الصور اللي على الموبايل بتفضل، واللي في النسخة بتتضاف. متأكد؟</T>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Btn label="أيوه رجّعها" kind="solid" style={{ flex: 1 }} onPress={restore} />
              <Btn label="لا" onPress={() => setPending(null)} />
            </View>
          </View>
        ) : null}
        <Sep />
        <View style={{ paddingHorizontal: 14, paddingVertical: 10, gap: 8 }}>
          <T w="medium" style={{ alignSelf: 'flex-start' }}>Google Drive</T>
          {!driveSupported ? (
            <T style={{ color: t.mute, fontSize: 12.5 }}>على الموبايل بس</T>
          ) : storage.getMeta(DRIVE_USER) ? (
            <>
              <T style={{ color: t.mute, fontSize: 12.5, lineHeight: 19 }}>
                {`متربط بـ ${storage.getMeta(DRIVE_USER)}. ملف واحد «Gym backup.json» بيتحدّث لوحده مرة في اليوم لو في جديد، ومعاه الصور.${storage.getMeta(DRIVE_AT) ? ` آخر رفعة: ${dayAr(storage.getMeta(DRIVE_AT)!)}` : ''}`}
              </T>
              {storage.getMeta(DRIVE_ERROR) ? <T style={{ color: t.bad, fontSize: 12.5 }}>آخر رفعة ما نفعتش. اتأكد من النت، ولو فضلت كده افصل واربط تاني.</T> : null}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Btn label="ارفع دلوقتي" kind="solid" style={{ flexGrow: 1 }} onPress={() => run(async () => { await syncDrive(true); setMsg({ text: 'اترفعت على Drive ✓' }); })} />
                <Btn label="رجّع من Drive" style={{ flexGrow: 1 }} onPress={() => run(async () => { const x = await fetchDrive(); if (x == null) setMsg({ text: 'مفيش نسخة على Drive لسه', bad: true }); else load(x); })} />
              </View>
              <Btn label="افصل Google Drive" onPress={() => run(async () => { await unlinkDrive(); setMsg({ text: 'اتفصل. الملف اللي على Drive زي ما هو' }); })} />
            </>
          ) : (
            <>
              <T style={{ color: t.mute, fontSize: 12.5, lineHeight: 19 }}>اربط حسابك مرة واحدة، والتطبيق يحفظ نسخة واحدة على Drive ويحدّثها لوحده. لو غيّرت الموبايل، اربط نفس الحساب ودوس «رجّع من Drive».</T>
              <Btn
                label="اربط Google Drive"
                kind="solid"
                onPress={() =>
                  run(async () => {
                    const email = await linkDrive();
                    if (!email) return;
                    await syncDrive(true).catch(() => {});
                    setMsg({ text: `اتربط بـ ${email} ✓` });
                  })
                }
              />
            </>
          )}
        </View>
        <Sep />
        <SwitchRow
          label="نسخة تلقائية كل أسبوع"
          sub={autoSupported ? `بتتحفظ جوه التطبيق (آخر ${AUTO_KEEP} نسخ). اختار فولدر كمان عشان تفضل لو مسحت التطبيق` : 'على الموبايل بس'}
          value={st.autoBackup}
          disabled={!autoSupported}
          onChange={(v) => st.setQuiet({ autoBackup: v })}
        />
        {autoSupported && st.autoBackup ? (
          <>
            <Sep />
            <Row label="الفولدر" sub={st.backupDir ? decodeURIComponent(st.backupDir.split('/').pop() ?? '').replace(/^primary:/, '') || 'متحدد' : 'جوه التطبيق بس'}>
              <Btn label={st.backupDir ? 'غيّر' : 'اختار'} onPress={() => run(async () => { const d = await pickBackupDir(); if (d) { st.setQuiet({ backupDir: d }); await runAutoBackup(true); useDataVersion.getState().bump(); setMsg({ text: 'اتحفظت نسخة في الفولدر ✓' }); } })} />
            </Row>
            {storage.getMeta(AUTO_ERROR_KEY) ? <T style={{ color: t.bad, fontSize: 12.5, paddingHorizontal: 14, paddingBottom: 8 }}>معرفتش أكتب في الفولدر آخر مرة. اختاره تاني.</T> : null}
            {listAutoBackups().length ? (
              <View style={{ paddingHorizontal: 12, paddingBottom: 10, gap: 6 }}>
                <T style={{ color: t.mute, fontSize: 12.5 }}>{`النسخ التلقائية (كل ${AUTO_DAYS} أيام):`}</T>
                {listAutoBackups().map((f) => (
                  <View key={f.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <T style={{ flex: 1, fontSize: 13 }}>{dayAr(f.date)}</T>
                    <Btn label="رجّعها" onPress={() => run(async () => load(await readAutoBackup(f.name)))} />
                  </View>
                ))}
              </View>
            ) : null}
          </>
        ) : null}
        {msg ? <T accessibilityLiveRegion="polite" style={{ color: msg.bad ? t.bad : t.okText, fontSize: 13, paddingHorizontal: 14, paddingBottom: 12 }}>{msg.text}</T> : null}
      </Card>

      <Label>البرنامج</Label>
      <Pressable onPress={() => router.push('/program')} accessibilityRole="button" style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
        <Card>
          <Row label="عدّل البرنامج" sub={`التمارين والمجموعات والتكرارات · ${PROGRAM.length} أيام · ${PROGRAM.reduce((n, d) => n + d.exercises.length, 0)} تمرين${storage.getMeta('program') ? ' · متعدّل' : ''}`}>
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
        <SwitchRow
          label="اسألني كان فاضل كام تكرار"
          sub="بعد كل مجموعة (RIR). لو كان فاضلك 3 أو أكتر في كل المجموعات، التطبيق يقولك تزوّد الوزن حتى لو ما وصلتش لآخر التكرارات"
          value={st.askRir}
          onChange={(v) => st.setQuiet({ askRir: v })}
        />
      </Card>

      <Label>الإشعارات</Label>
      <Card>
        <SwitchRow
          label="ملخص الصبح"
          sub={phone ? 'كل يوم الصبح: التمرين أو الراحة، الوجبات ومواعيدها، المية، واللي تجهّزه' : 'على الموبايل بس'}
          value={st.brief}
          disabled={!phone}
          onChange={async (v) => {
            const ok = !v || (await allowReminders());
            setDenied(!ok);
            if (ok) st.setQuiet({ brief: v });
          }}
        />
        {st.brief ? (
          <Row label="ميعاد الملخص">
            <Stepper value={st.briefTime} min={0} max={24 * 60 - 15} step={15} onChange={(v) => st.setQuiet({ briefTime: v })} label="ميعاد الملخص" format={timeAr} />
          </Row>
        ) : null}
        <Sep />
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
        {st.reminder ? (
          <Row label="ميعاد التمرين">
            <Stepper value={st.reminderTime} min={0} max={24 * 60 - 15} step={15} onChange={(v) => st.setQuiet({ reminderTime: v })} label="ميعاد التذكير" format={timeAr} />
          </Row>
        ) : null}
        {denied ? <T style={{ color: t.bad, fontSize: 12.5, paddingHorizontal: 14, paddingBottom: 10 }}>اسمح للتطبيق بالإشعارات من إعدادات الموبايل الأول</T> : null}
        {st.reminder || st.brief ? (
          <>
            <Sep />
            <View style={{ padding: 14, gap: 10 }}>
              <T w="medium">أيام التمرين</T>
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
