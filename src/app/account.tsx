import React, { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { MONTHS_AR } from '../data/program';
import { Btn, Card, Label, Row, Screen, Sep, T } from '../components/ui';
import { backupInfo, infoText, parseBackup, type BackupInfo, type PhotoData } from '../lib/backup';
import { useDataVersion } from '../lib/bus';
import { DRIVE_AT, DRIVE_ERROR, DRIVE_NAME, DRIVE_PHOTO, DRIVE_USER, driveSupported, fetchDrive, linkDrive, syncDrive, unlinkDrive } from '../lib/drive';
import { listPhotos, photosSupported } from '../lib/photos';
import { applyBackup, WELCOME_KEY, wipeLocal } from '../lib/restore';
import { storage } from '../lib/storage';
import type { Dump } from '../lib/storage.types';
import { tint, useTheme } from '../theme';

const dayAr = (k: string) => `${+k.slice(8)} ${MONTHS_AR[+k.slice(5, 7) - 1]} ${k.slice(0, 4)}`;

/** Your account (side menu → your name): who you're signed in as, the Drive backup, restore from it, and sign-out. */
export default function Account() {
  const t = useTheme();
  useDataVersion((s) => s.v);
  const email = storage.getMeta(DRIVE_USER);
  const name = storage.getMeta(DRIVE_NAME);
  const photo = storage.getMeta(DRIVE_PHOTO);
  const at = storage.getMeta(DRIVE_AT);
  const failed = !!storage.getMeta(DRIVE_ERROR);
  const mine = backupInfo(storage.dump(), photosSupported ? listPhotos().length : 0);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [pending, setPending] = useState<{ data: Dump; photos: PhotoData[]; info: BackupInfo; exportedAt: string | null } | null>(null);
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
        try {
          await syncDrive(true);
        } catch {
          return setMsg({ text: 'معرفتش أرفع آخر نسخة على Drive، فما مسحتش حاجة. اتأكد من النت وجرّب تاني.', bad: true });
        }
      }
      await unlinkDrive();
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

      {!driveSupported ? (
        <T style={{ color: t.mute, fontSize: 13, textAlign: 'center' }}>الحساب على الموبايل بس</T>
      ) : !email ? (
        <Btn
          label="ادخل بحساب Google"
          kind="solid"
          onPress={() =>
            run(async () => {
              const e = await linkDrive();
              if (!e) return;
              // Drive already has your data: bring it back to an empty phone, or ask when both have some.
              const x = await fetchDrive().catch(() => null);
              const p = x ? parseBackup(x) : null;
              if (p?.ok && p.info.total > 0) {
                if (mine.total === 0) {
                  applyBackup(p.data, p.photos);
                  return setMsg({ text: `دخلت بـ ${e} ورجّعت بياناتك من Drive ✓` });
                }
                setPending({ data: p.data, photos: p.photos, info: p.info, exportedAt: p.exportedAt });
                return setMsg({ text: `دخلت بـ ${e}. على Drive نسخة فيها بيانات: ترجّعها ولا تخلّي اللي على الموبايل؟` });
              }
              await syncDrive(true).catch(() => {});
              setMsg({ text: `دخلت بـ ${e} ✓` });
            })
          }
        />
      ) : (
        <>
          <Label>النسخة على Google Drive</Label>
          <Card>
            <Row
              label={failed ? 'آخر رفعة ما نفعتش' : at ? `آخر رفعة: ${dayAr(at)}` : 'لسه ما اترفعش'}
              sub={failed ? 'اتأكد من النت، ولو فضلت كده اخرج وادخل تاني' : 'ملف واحد «Gym backup.json» بيتحدّث لوحده بعد كل تغيير بدقايق، ومعاه الصور'}>
              <Ionicons name={failed ? 'alert-circle' : 'cloud-done'} size={24} color={failed ? t.bad : t.okText} />
            </Row>
            <Sep />
            <View style={{ flexDirection: 'row', gap: 8, padding: 12 }}>
              <Btn label="ارفع دلوقتي" kind="solid" style={{ flex: 1 }} onPress={() => run(async () => { const r = await syncDrive(true); setMsg(r === 'kept' ? { text: 'الموبايل مفيهوش حاجة متسجلة وDrive عليه بياناتك، فما رفعتش عشان متضيعش. دوس «رجّع من Drive»', bad: true } : { text: 'اترفعت على Drive ✓' }); })} />
              <Btn
                label="رجّع من Drive"
                style={{ flex: 1 }}
                onPress={() =>
                  run(async () => {
                    const x = await fetchDrive();
                    if (x == null) return setMsg({ text: 'مفيش نسخة على Drive لسه', bad: true });
                    const p = parseBackup(x);
                    if (!p.ok) return setMsg({ text: p.error, bad: true });
                    setPending({ data: p.data, photos: p.photos, info: p.info, exportedAt: p.exportedAt });
                  })
                }
              />
            </View>
            {pending ? (
              <View style={[s.box, { backgroundColor: t.warnSoft }]}>
                <T w="semi" style={{ color: t.warn }}>
                  {`النسخة اللي على Drive${pending.exportedAt ? ` (${dayAr(pending.exportedAt.slice(0, 10))})` : ''}: ${infoText(pending.info)}`}
                </T>
                <T style={{ fontSize: 12.5, lineHeight: 19 }}>هتحط النسخة دي مكان اللي على الموبايل دلوقتي. الصور اللي على الموبايل بتفضل. متأكد؟</T>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Btn label="أيوه رجّعها" kind="solid" style={{ flex: 1 }} onPress={() => { applyBackup(pending.data, pending.photos); setPending(null); setMsg({ text: 'رجّعت النسخة ✓' }); }} />
                  <Btn label="لا" onPress={() => setPending(null)} />
                </View>
              </View>
            ) : null}
          </Card>

          {!leaving ? (
            <Btn label="تسجيل الخروج" onPress={() => setLeaving(true)} />
          ) : (
            <View style={[s.box, { backgroundColor: t.warnSoft, marginHorizontal: 0 }]}>
              <T w="semi" style={{ color: t.warn }}>تسجيل الخروج</T>
              <T style={{ fontSize: 12.5, lineHeight: 19 }}>نسختك على Drive بتفضل زي ما هي، وتقدر تدخل تاني في أي وقت.</T>
              <Btn label="اخرج بس (البيانات تفضل على الموبايل)" onPress={() => signOut(false)} />
              <Btn label="اخرج وامسح بياناتي من الموبايل" kind="solid" onPress={() => signOut(true)} />
              <T style={{ fontSize: 12, color: t.mute, lineHeight: 18 }}>المسح بيرفع آخر نسخة على Drive الأول، ومش بيمسح غير لو الرفع نجح.</T>
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
