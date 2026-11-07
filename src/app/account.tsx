import React, { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { MONTHS_AR } from '../data/program';
import { dateKey } from '../lib/logic';
import { Btn, Card, Label, Row, Screen, Sep, T } from '../components/ui';
import { backupInfo } from '../lib/backup';
import { useDataVersion } from '../lib/bus';
import { cloudConfigured, cloudLinked, linkCloud, pendingChanges, syncCloud, SYNC_AT, SYNC_ERROR, unlinkCloud } from '../lib/cloud';
import { GOOGLE_NAME, GOOGLE_PHOTO, GOOGLE_USER, googleSupported, linkGoogle, unlinkGoogle } from '../lib/google';
import { listPhotos, photosSupported } from '../lib/photos';
import { WELCOME_KEY, wipeLocal } from '../lib/restore';
import { storage } from '../lib/storage';
import { tint, useTheme } from '../theme';

const dayAr = (k: string) => `${+k.slice(8)} ${MONTHS_AR[+k.slice(5, 7) - 1]} ${k.slice(0, 4)}`;
/** "النهارده 14:05" or the date and time of the last good sync. */
function whenAr(ms: number) {
  const d = new Date(ms);
  const hm = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  const k = dateKey(d);
  return `${k === dateKey() ? 'النهارده' : dayAr(k)} ${hm}`;
}

/** Your account (side menu → your name): who you're signed in as, Supabase sync, and sign-out. */
export default function Account() {
  const t = useTheme();
  useDataVersion((s) => s.v);
  const email = storage.getMeta(GOOGLE_USER);
  const name = storage.getMeta(GOOGLE_NAME);
  const photo = storage.getMeta(GOOGLE_PHOTO);
  const linked = cloudLinked();
  const syncAt = Number(storage.getMeta(SYNC_AT) || 0);
  const syncFailed = !!storage.getMeta(SYNC_ERROR);
  const waiting = linked ? pendingChanges() : 0;
  const mine = backupInfo(storage.dump(), photosSupported ? listPhotos().length : 0);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async (f: () => Promise<void>) => {
    setMsg(null);
    setBusy(true);
    try {
      await f();
    } catch (e) {
      const why = String((e as { code?: string; message?: string })?.code ?? (e as Error)?.message ?? '').slice(0, 80);
      setMsg({ text: `حصلت مشكلة، جرّب تاني.${why ? ` (${why})` : ''}`, bad: true });
    } finally {
      setBusy(false);
    }
  };

  const signOut = (wipe: boolean) =>
    run(async () => {
      if (wipe) {
        // Everything has to be on the server before the phone is wiped.
        if (!cloudLinked()) return setMsg({ text: 'المزامنة مش شغالة، فبياناتك مش على السيرفر وما مسحتهاش. احفظ نسخة من الإعدادات الأول.', bad: true });
        const ok = await syncCloud().then(() => pendingChanges() === 0, () => false);
        if (!ok) return setMsg({ text: 'معرفتش أزامن آخر تغييراتك، فما مسحتش حاجة. اتأكد من النت وجرّب تاني.', bad: true });
      }
      unlinkCloud();
      await unlinkGoogle();
      if (wipe) wipeLocal();
      storage.setMeta(WELCOME_KEY, '');
      router.replace('/welcome');
    });

  const stats = [
    { v: String(mine.days), l: 'يوم تمرين' },
    { v: String(mine.sets), l: 'مجموعة' },
    { v: String(mine.photos), l: 'صورة' },
  ];

  return (
    <Screen title="حسابك" onBack={() => router.back()}>
      <Card style={{ padding: 18, alignItems: 'center', gap: 10 }}>
        {photo ? (
          <Image source={{ uri: photo }} style={[s.avatar, { borderColor: tint(t.ok, 0.5) }]} />
        ) : (
          <View style={[s.avatar, { borderColor: tint(t.ok, 0.5), backgroundColor: tint(t.ok, 0.12), alignItems: 'center', justifyContent: 'center' }]}>
            <Ionicons name="person" size={40} color={t.okText} />
          </View>
        )}
        <View style={{ alignItems: 'center', gap: 2 }}>
          <T w="bold" style={{ fontSize: 19 }}>{email ? name || 'حسابك' : 'مش داخل بحساب'}</T>
          <T style={{ color: t.mute, fontSize: 13 }}>{email ?? 'ادخل بحساب Google عشان بياناتك تتحفظ وترجع على أي موبايل'}</T>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, alignSelf: 'stretch', marginTop: 4 }}>
          {stats.map((x) => (
            <View key={x.l} style={[s.stat, { backgroundColor: t.soft }]}>
              <T w="numBold" style={{ fontSize: 17 }}>{x.v}</T>
              <T style={{ fontSize: 11.5, color: t.mute }}>{x.l}</T>
            </View>
          ))}
        </View>
      </Card>

      {!googleSupported ? (
        <T style={{ color: t.mute, fontSize: 13, textAlign: 'center' }}>الحساب على الموبايل بس</T>
      ) : !email ? (
        <Btn
          label="ادخل بحساب Google"
          kind="solid"
          onPress={() =>
            run(async () => {
              const e = await linkGoogle();
              if (!e) return;
              if (cloudConfigured) {
                await linkCloud();
                if (backupInfo(storage.dump(), 0).total > 0) return setMsg({ text: `دخلت بـ ${e} وبياناتك اتزامنت ✓` });
              }
              setMsg({ text: `دخلت بـ ${e} ✓` });
            })
          }
        />
      ) : (
        <>
          {cloudConfigured ? (
            <>
              <Label>المزامنة</Label>
              <Card>
                <Row
                  label={!linked ? 'المزامنة مش شغالة' : syncFailed ? 'آخر مزامنة ما نفعتش' : syncAt ? `آخر مزامنة: ${whenAr(syncAt)}` : 'لسه ما اتزامنش'}
                  sub={
                    !linked
                      ? 'شغّلها عشان كل حاجة تتحفظ أول بأول وترجع لو مسحت التطبيق أو غيّرت الموبايل'
                      : waiting
                        ? `${waiting} تغيير مستني النت`
                        : 'كل تغيير بيتحفظ بعد ثواني، ونفس الحساب على أي موبايل بيجيب نفس البيانات (من غير الصور)'
                  }>
                  <Ionicons name={!linked || syncFailed ? 'alert-circle' : 'sync-circle'} size={24} color={!linked || syncFailed ? t.bad : t.okText} />
                </Row>
                <Sep />
                <View style={{ padding: 12 }}>
                  <Btn
                    label={linked ? 'زامن دلوقتي' : 'شغّل المزامنة'}
                    kind="solid"
                    onPress={() =>
                      run(async () => {
                        if (linked) await syncCloud();
                        else await linkCloud();
                        setMsg(pendingChanges() ? { text: 'لسه في تغييرات ما اتبعتتش، جرّب تاني', bad: true } : { text: 'اتزامنت ✓' });
                      })
                    }
                  />
                </View>
              </Card>
            </>
          ) : null}

          {!leaving ? (
            <Btn label="تسجيل الخروج" onPress={() => setLeaving(true)} />
          ) : (
            <View style={[s.box, { backgroundColor: t.warnSoft, marginHorizontal: 0 }]}>
              <T w="semi" style={{ color: t.warn }}>تسجيل الخروج</T>
              <T style={{ fontSize: 12.5, lineHeight: 19 }}>بياناتك على السيرفر بتفضل زي ما هي، وتقدر تدخل تاني في أي وقت.</T>
              <Btn label="اخرج بس (البيانات تفضل على الموبايل)" onPress={() => signOut(false)} />
              <Btn label="اخرج وامسح بياناتي من الموبايل" kind="solid" onPress={() => signOut(true)} />
              <T style={{ fontSize: 12, color: t.mute, lineHeight: 18 }}>المسح بيزامن آخر تغييراتك الأول، ومش بيمسح غير لو ده نجح. الصور مش على السيرفر، فاحفظ نسخة من الإعدادات لو عايزها.</T>
              <Btn label="لا" onPress={() => setLeaving(false)} />
            </View>
          )}
        </>
      )}

      {busy ? <T style={{ color: t.mute, fontSize: 13, textAlign: 'center' }}>لحظة...</T> : null}
      {msg ? <T accessibilityLiveRegion="polite" style={{ color: msg.bad ? t.bad : t.okText, fontSize: 13, textAlign: 'center' }}>{msg.text}</T> : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  avatar: { width: 84, height: 84, borderRadius: 42, borderWidth: 2 },
  stat: { flex: 1, borderRadius: 12, paddingVertical: 8, alignItems: 'center' },
  box: { marginHorizontal: 12, marginBottom: 12, padding: 12, borderRadius: 12, gap: 8 },
});
