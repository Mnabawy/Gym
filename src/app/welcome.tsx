import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MONTHS_AR } from '../data/program';
import { Btn, Card, T } from '../components/ui';
import { backupInfo, parseBackup, type BackupInfo, type PhotoData } from '../lib/backup';
import { fetchDrive, linkDrive, syncDrive } from '../lib/drive';
import { countAr, DAYS, SETS } from '../lib/logic';
import { applyBackup, WELCOME_KEY } from '../lib/restore';
import { storage } from '../lib/storage';
import type { Dump } from '../lib/storage.types';
import { useTheme } from '../theme';

const dayAr = (k: string) => `${+k.slice(8)} ${MONTHS_AR[+k.slice(5, 7) - 1]}`;
const infoAr = (i: BackupInfo) => (i.sets ? `${countAr(i.sets, SETS)} في ${countAr(i.days, DAYS)}${i.to ? `، آخرها ${dayAr(i.to)}` : ''}` : 'من غير تمارين');

type Choice = { data: Dump; photos: PhotoData[]; remote: BackupInfo; local: BackupInfo; exportedAt: string | null };

/**
 * First launch (phone): sign in with Google in one tap — no password — and your data follows you. A new phone gets
 * its data back from your Drive by itself; a phone that already has data asks which to keep. Or carry on without one.
 */
export default function Welcome() {
  const t = useTheme();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [choice, setChoice] = useState<Choice | null>(null);

  const finish = () => {
    storage.setMeta(WELCOME_KEY, '1');
    router.replace('/');
  };

  const signIn = async () => {
    setErr(null);
    setBusy(true);
    try {
      const email = await linkDrive();
      if (!email) return; // cancelled
      const text = await fetchDrive().catch(() => null);
      const p = text ? parseBackup(text) : null;
      const local = backupInfo(storage.dump());
      if (p?.ok && p.info.sets + p.info.meals > 0) {
        // Nothing here yet: bring it all back. Data on both: ask.
        if (local.sets + local.meals === 0) {
          applyBackup(p.data, p.photos);
          return finish();
        }
        return setChoice({ data: p.data, photos: p.photos, remote: p.info, local, exportedAt: p.exportedAt });
      }
      await syncDrive(true).catch(() => {});
      finish();
    } catch (e) {
      const why = String((e as { code?: string; message?: string })?.code ?? (e as Error)?.message ?? '').slice(0, 80);
      setErr(`الدخول ما نفعش، جرّب تاني${why ? ` (${why})` : ''}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={s.wrap}>
        <View style={[s.logo, { backgroundColor: t.okSoft }]}>
          <Ionicons name="barbell" size={44} color={t.okText} />
        </View>
        <T w="bold" style={{ fontSize: 24, textAlign: 'center' }}>أهلًا بيك</T>
        <T style={{ color: t.mute, fontSize: 15, textAlign: 'center', lineHeight: 24 }}>
          ادخل بحساب Google بدوسة واحدة، من غير باسورد. تمرينك وأكلك ووزنك وصورك بيتحفظوا في Drive بتاعك، ولو غيّرت الموبايل بيرجعوا لوحدهم.
        </T>

        {choice ? (
          <Card style={{ padding: 14, gap: 10, alignSelf: 'stretch' }}>
            <T w="bold" style={{ fontSize: 16 }}>عندك بيانات في مكانين</T>
            <T style={{ fontSize: 13.5, lineHeight: 21 }}>{`على Drive: ${infoAr(choice.remote)}${choice.remote.photos ? ` · ${choice.remote.photos} صورة` : ''}`}</T>
            <T style={{ fontSize: 13.5, lineHeight: 21 }}>{`على الموبايل: ${infoAr(choice.local)}`}</T>
            <Btn label="استخدم اللي على Drive" kind="solid" onPress={() => { applyBackup(choice.data, choice.photos); finish(); }} />
            <Btn label="خلّي اللي على الموبايل" onPress={() => { syncDrive(true).catch(() => {}); finish(); }} />
            <T style={{ color: t.mute, fontSize: 12, lineHeight: 18 }}>اللي هتختاره بيتحفظ على Drive بعد كده. Drive بيحتفظ بالنسخة القديمة شوية لو احتجتها.</T>
          </Card>
        ) : (
          <View style={{ alignSelf: 'stretch', gap: 10 }}>
            {busy ? (
              <ActivityIndicator color={t.ok} style={{ height: 40 }} />
            ) : (
              <Btn label="ادخل بحساب Google" kind="solid" onPress={signIn} />
            )}
            <Btn label="كمّل من غير حساب" onPress={finish} />
            {err ? <T style={{ color: t.bad, fontSize: 13, textAlign: 'center' }}>{err}</T> : null}
            <T style={{ color: t.mute, fontSize: 12, textAlign: 'center' }}>تقدر تدخل بعدين من الإعدادات</T>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, maxWidth: 460, width: '100%', alignSelf: 'center', paddingHorizontal: 24, justifyContent: 'center', alignItems: 'center', gap: 16 },
  logo: { width: 88, height: 88, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
});
