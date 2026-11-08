import React, { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { MONTHS_AR } from '../data/program';
import { dateKey } from '../lib/logic';
import { Btn, Card, Screen, T } from '../components/ui';
import { backupInfo } from '../lib/backup';
import { useDataVersion } from '../lib/bus';
import { cloudConfigured, cloudLinked, linkCloud, pendingChanges, syncCloud, syncStatus, unlinkCloud } from '../lib/cloud';
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
  const st = syncStatus();
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
        if (!cloudLinked()) return setMsg({ text: 'الحفظ على حسابك مقفول، فبياناتك مش متحفظة وما مسحتهاش. احفظ نسخة من الإعدادات الأول.', bad: true });
        const ok = await syncCloud().then(() => pendingChanges() === 0, () => false);
        if (!ok) return setMsg({ text: 'معرفتش أحفظ آخر تغييراتك على حسابك، فما مسحتش حاجة. اتأكد من النت وجرّب تاني.', bad: true });
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
      <Card style={{ padding: 14, alignItems: 'center', gap: 10 }}>
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
              <Card style={{ padding: 14, gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={[s.badge, { backgroundColor: tint(STATE[st.state].color(t), 0.14) }]}>
                    <Ionicons name={STATE[st.state].icon} size={22} color={STATE[st.state].color(t)} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <T w="bold" style={{ fontSize: 15.5 }}>{STATE[st.state].title(st.waiting)}</T>
                    <T style={{ color: t.mute, fontSize: 12.5, lineHeight: 19 }}>
                      {st.state === 'off' ? 'شغّله عشان بياناتك ترجع لو مسحت التطبيق أو غيّرت الموبايل' : st.state === 'failed' ? 'اتأكد من النت ودوس «احفظ دلوقتي»' : st.at ? `آخر حفظ: ${whenAr(st.at)}` : 'بيحفظ لأول مرة…'}
                    </T>
                  </View>
                </View>
                {st.state !== 'saved' ? (
                  <Btn
                    label={st.state === 'off' ? 'شغّل الحفظ على حسابك' : 'احفظ دلوقتي'}
                    kind="solid"
                    onPress={() =>
                      run(async () => {
                        if (cloudLinked()) await syncCloud();
                        else await linkCloud();
                        setMsg(pendingChanges() ? { text: 'لسه فيه تغييرات ما اتحفظتش، جرّب تاني', bad: true } : { text: 'اتحفظ ✓' });
                      })
                    }
                  />
                ) : null}
                <T style={{ color: t.mute, fontSize: 12, lineHeight: 18 }}>بيتحفظ لوحده بعد أي تغيير. ولو دخلت بنفس الحساب على أي موبايل، كل حاجة بترجع (ما عدا صور التقدّم).</T>
              </Card>
            </>
          ) : (
            <Card style={{ padding: 14, gap: 4 }}>
              <T w="bold" style={{ fontSize: 15 }}>الحفظ على حسابك مش متظبط في النسخة دي</T>
              <T style={{ color: t.mute, fontSize: 12.5, lineHeight: 19 }}>النسخة اتبنت من غير ملف .env، فبياناتك على الموبايل بس. ابنيها تاني بعد آخر تحديث (npm run update -- --build).</T>
            </Card>
          )}

          {!leaving ? (
            <Btn label="تسجيل الخروج" onPress={() => setLeaving(true)} />
          ) : (
            <View style={[s.box, { backgroundColor: t.warnSoft, marginHorizontal: 0 }]}>
              <T w="semi" style={{ color: t.warn }}>تسجيل الخروج</T>
              <T style={{ fontSize: 12.5, lineHeight: 19 }}>بياناتك على حسابك بتفضل زي ما هي، وتقدر تدخل تاني في أي وقت.</T>
              <Btn label="اخرج بس (البيانات تفضل على الموبايل)" onPress={() => signOut(false)} />
              <Btn label="اخرج وامسح بياناتي من الموبايل" kind="solid" onPress={() => signOut(true)} />
              <T style={{ fontSize: 12, color: t.mute, lineHeight: 18 }}>المسح بيحفظ آخر تغييراتك على حسابك الأول، ومش بيمسح غير لو ده نجح. صور التقدّم مش على حسابك، فاحفظ نسخة من الإعدادات لو عايزها.</T>
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

/** The sync state in plain words, an icon and a color. */
const STATE: Record<ReturnType<typeof syncStatus>['state'], { title: (n: number) => string; icon: React.ComponentProps<typeof Ionicons>['name']; color: (t: ReturnType<typeof useTheme>) => string }> = {
  saved: { title: () => 'بياناتك محفوظة على حسابك', icon: 'cloud-done', color: (t) => t.okText },
  waiting: { title: (n) => (n ? `${n} تغيير هيتحفظ أول ما النت يرجع` : 'بيحفظ…'), icon: 'cloud-upload', color: (t) => t.warn },
  failed: { title: () => 'آخر محاولة حفظ ما نفعتش', icon: 'cloud-offline', color: (t) => t.bad },
  off: { title: () => 'الحفظ على حسابك مقفول', icon: 'cloud-outline', color: (t) => t.mute },
};

const s = StyleSheet.create({
  badge: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 84, height: 84, borderRadius: 42, borderWidth: 2 },
  stat: { flex: 1, borderRadius: 12, paddingVertical: 8, alignItems: 'center' },
  box: { marginHorizontal: 12, marginBottom: 12, padding: 12, borderRadius: 12, gap: 8 },
});
