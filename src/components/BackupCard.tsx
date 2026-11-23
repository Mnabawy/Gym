import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Btn, Card, Row, Sep, SwitchRow, T } from './ui';
import { DbNotice } from './DbNotice';
import { ExportSheet } from './ExportSheet';
import { dateKey, daysBetween } from '../lib/dates';
import { countAr } from '../lib/logic';
import { storage } from '../lib/storage';
import { useSettings } from '../lib/settings';
import { BACKUP_AREAS, backupInfo, LAST_BACKUP_KEY, parseBackup, type BackupInfo, type PhotoData } from '../lib/backup';
import { copyBackup, pasteBackup, pickBackup, saveBackup } from '../lib/backupIO';
import { AUTO_DAYS, AUTO_ERROR_KEY, AUTO_KEEP, AUTO_KEY, autoSupported, listAutoBackups, pickBackupDir, readAutoBackup, runAutoBackup } from '../lib/autoBackup';
import { metaArea, useData, useDataVersion } from '../lib/bus';
import type { Dump } from '../lib/storage.types';
import { listPhotos, photosSupported } from '../lib/photos';
import { applyBackup, safetyText } from '../lib/restore';
import { autoErrorText, backupAgeText, backupStale, dayAr, folderName, infoAr, PHOTOS } from '../lib/settingsView';
import { useTheme } from '../theme';

/** Settings' backup card: save / copy / export / restore, the weekly automatic backup. */
export function BackupCard() {
  const t = useTheme();
  const st = useSettings();
  // Re-reads what this card shows: backup dates.
  useData(metaArea(AUTO_ERROR_KEY), metaArea(LAST_BACKUP_KEY), metaArea(AUTO_KEY));
  // What's on the phone (the whole database): counted again only when something it counts changes, not on every render.
  const dataV = useData(...BACKUP_AREAS);
  const today = dateKey();
  const autoError = storage.getMeta(AUTO_ERROR_KEY); // the day the last automatic backup failed (autoBackup.ts)
  const lastBackup = storage.getMeta(LAST_BACKUP_KEY);
  const since = lastBackup ? daysBetween(lastBackup, today) : null;
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [pending, setPending] = useState<{ data: Dump; photos: PhotoData[]; info: BackupInfo; exportedAt: string | null } | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mine = useMemo(() => backupInfo(storage.dump(), photosSupported ? listPhotos().length : 0), [dataV]);
  const autoErr = autoErrorText(autoError, storage.getMeta(AUTO_KEY));

  const run = async (f: () => Promise<void>) => {
    setMsg(null);
    try {
      await f();
    } catch (e) {
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
  const restore = async () => {
    if (!pending) return;
    try {
      const added = await applyBackup(pending.data, pending.photos);
      setPending(null);
      setMsg({ text: added ? `رجّعت النسخة ✓ ومعاها ${countAr(added, PHOTOS)}` : 'رجّعت النسخة ✓' });
    } catch (e) {
      setMsg({ text: safetyText(e) ?? 'حصلت مشكلة وأنا برجّع النسخة، جرّب تاني.', bad: true });
    }
  };

  return (
    <>
      <Card>
        <DbNotice style={{ marginHorizontal: 12, marginTop: 12 }} />
        <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4, gap: 3 }}>
          <T w="medium" style={{ color: backupStale(since) ? t.warn : t.okText }}>
            {backupAgeText(since)}
          </T>
          <T style={{ color: t.mute, fontSize: 12.5, lineHeight: 19 }}>
            {`حسابك بيحفظ كل حاجة غير صور التقدّم. احفظ ملف أو ابعته لنفسك عشان يبقى معاك نسخة فيها الصور كمان. عندك دلوقتي: ${infoAr(mine)}`}
          </T>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12 }}>
          <Btn label="احفظ نسخة" kind="solid" style={{ flexGrow: 1 }} onPress={() => run(async () => done((await saveBackup()) === 'copied' ? 'اتنسخت في الحافظة، الصقها في رسالة لنفسك' : 'اتحفظت ✓'))} />
          <Btn label="انسخها" style={{ flexGrow: 1 }} onPress={() => run(async () => { await copyBackup(); done('اتنسخت من غير الصور، الصقها في رسالة لنفسك أو في ملاحظة'); })} />
        </View>
        <Sep />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12 }}>
          <Btn label="صدّر لـ Excel (CSV)" style={{ flexGrow: 1 }} onPress={() => setExporting(true)} />
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
            <Row label="الفولدر" sub={folderName(st.backupDir)}>
              <Btn label={st.backupDir ? 'غيّر' : 'اختار'} onPress={() => run(async () => { const d = await pickBackupDir(); if (d) { st.setQuiet({ backupDir: d }); await runAutoBackup(true); useDataVersion.getState().bump(); setMsg({ text: 'اتحفظت نسخة في الفولدر ✓' }); } })} />
            </Row>
            {autoErr ? (
              <T style={{ color: t.bad, fontSize: 12.5, paddingHorizontal: 14, paddingBottom: 8 }}>
                {autoErr}
              </T>
            ) : null}
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
      {exporting ? <ExportSheet visible onClose={() => setExporting(false)} /> : null}
    </>
  );
}
