import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { MONTHS_AR, WEEKDAYS_AR } from '../../data/program';
import { Btn, Card, Label, Pill, Screen, T } from '../../components/ui';
import { pickCity, refreshPlace, PLACE_STALE_MS, type LocateResult } from '../../lib/place';
import { CITIES, clock12, METHODS, nextPrayer, PRAYER_AR, PRAYERS, timesFor, untilAr, type PrayerKey } from '../../lib/prayer';
import { useSettings } from '../../lib/settings';
import { tint, useTheme } from '../../theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
const ICON: Record<PrayerKey, IconName> = {
  fajr: 'cloudy-night-outline',
  sunrise: 'sunny-outline',
  dhuhr: 'sunny',
  asr: 'partly-sunny-outline',
  maghrib: 'moon-outline',
  isha: 'moon',
};
const iso = (s: string) => `⁦${s}⁩`;

/** Why the location lookup failed, in plain words. */
const FAIL: Record<Exclude<LocateResult, 'ok'>, string> = {
  denied: 'إذن الموقع مقفول. اسمح للتطبيق يوصل لمكانك من إعدادات الموبايل، أو اختار مدينتك.',
  off: 'خدمة الموقع مقفولة في الموبايل. شغّلها من الإعدادات، أو اختار مدينتك.',
  timeout: 'الموبايل ما عرفش يحدد مكانك. جرّب تاني جنب شباك، أو اختار مدينتك.',
  error: 'حصلت مشكلة واحنا بنحدد مكانك. جرّب تاني، أو اختار مدينتك.',
};

function placeLabel(p: { lat: number; lng: number; name?: string }) {
  return p.name ?? iso(`${p.lat.toFixed(2)}, ${p.lng.toFixed(2)}`);
}

function agoAr(ms: number) {
  const m = Math.round(ms / 60000);
  if (m < 1) return 'دلوقتي';
  if (m < 60) return `من ${m} دقيقة`;
  const h = Math.round(m / 60);
  return h < 24 ? `من ${h} ساعة` : `من ${Math.round(h / 24)} يوم`;
}

export default function PrayerScreen() {
  const t = useTheme();
  const place = useSettings((s) => s.place);
  const method = useSettings((s) => s.prayerMethod);
  const [now, setNow] = useState(() => new Date());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Exclude<LocateResult, 'ok'> | null>(null);
  const [choosing, setChoosing] = useState(false);

  const locate = useCallback(async () => {
    setBusy(true);
    setErr(null);
    const r = await refreshPlace();
    setBusy(false);
    setErr(r === 'ok' ? null : r);
  }, []);

  // Follow the phone: re-read the location when the tab opens and the saved one is missing or old — unless you picked a city.
  useFocusEffect(
    useCallback(() => {
      const p = useSettings.getState().place;
      if (!p || (!p.manual && Date.now() - p.at > PLACE_STALE_MS)) locate();
    }, [locate]),
  );

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const choose = (c: (typeof CITIES)[number]) => {
    pickCity(c);
    setChoosing(false);
    setErr(null);
  };

  const cityPicker = (
    <>
      <Label>اختار مدينتك</Label>
      <Card style={{ padding: 12 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {CITIES.map((c) => (
            <Pill key={c.name} label={c.name} on={!!place?.manual && place.name === c.name} onPress={() => choose(c)} />
          ))}
        </View>
      </Card>
    </>
  );

  if (!place) {
    return (
      <Screen title="مواقيت الصلاة" sub="بتتحسب من مكانك الحالي">
        <Card style={{ padding: 20, alignItems: 'center', gap: 10 }}>
          {busy ? <ActivityIndicator color={t.ok} /> : <Ionicons name="location-outline" size={36} color={t.mute} />}
          <T w="bold" style={{ fontSize: 16 }}>{busy ? 'بنحدد مكانك…' : 'محتاجين مكانك'}</T>
          <T style={{ color: t.mute, fontSize: 13, textAlign: 'center', lineHeight: 20 }}>
            {busy ? 'لو طوّل، تقدر تختار مدينتك من تحت.' : err ? FAIL[err] : 'المواقيت بتتحسب على الموبايل من مكانك، ومن غير نت.'}
          </T>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {!busy ? <Btn label={err ? 'جرّب تاني' : 'حدد مكاني'} kind="solid" onPress={locate} /> : null}
            {err === 'denied' && Platform.OS !== 'web' ? <Btn label="افتح الإعدادات" onPress={() => Linking.openSettings()} /> : null}
          </View>
        </Card>
        {cityPicker}
      </Screen>
    );
  }

  const times = timesFor(place, now, method);
  const next = nextPrayer(place, now, method);
  const nextIsTomorrow = next.at.getDate() !== now.getDate();
  const date = `${WEEKDAYS_AR[now.getDay()]} ${now.getDate()} ${MONTHS_AR[now.getMonth()]}`;
  const status = busy
    ? 'بنحدّث مكانك…'
    : err
      ? `${FAIL[err].split('.')[0]}. بنستخدم آخر مكان متسجل.`
      : place.manual
        ? 'المدينة اخترتها بنفسك'
        : `المكان اتحدّث ${agoAr(now.getTime() - place.at)}`;

  return (
    <Screen title="مواقيت الصلاة" sub={`${placeLabel(place)} · ${METHODS[method].label}`}>
      <View style={[s.hero, { backgroundColor: t.ink }]}>
        <T style={{ color: t.onInk, opacity: 0.8, fontSize: 13 }}>{nextIsTomorrow ? 'الصلاة الجاية · بكرة' : 'الصلاة الجاية'}</T>
        <T w="bold" style={{ color: t.onInk, fontSize: 28, lineHeight: 40 }}>{PRAYER_AR[next.key]}</T>
        <T w="numBold" style={{ color: t.onInk, fontSize: 22 }}>{iso(clock12(next.at))}</T>
        <View style={[s.pill, { backgroundColor: 'rgba(255,255,255,0.14)' }]}>
          <T w="medium" style={{ color: t.onInk, fontSize: 13 }}>{`بعد ${untilAr(next.at.getTime() - now.getTime())}`}</T>
        </View>
      </View>

      <Card>
        <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 }}>
          <T style={{ color: t.mute, fontSize: 12.5 }}>{date}</T>
        </View>
        {PRAYERS.map((k, i) => {
          const isNext = !nextIsTomorrow && k === next.key;
          const past = times[k] <= now;
          const sunrise = k === 'sunrise';
          return (
            <View
              key={k}
              style={[s.row, { borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderTopColor: t.line }, isNext ? { backgroundColor: tint(t.ok, 0.12) } : null]}
              accessibilityLabel={`${PRAYER_AR[k]} ${clock12(times[k])}${isNext ? '، الجاية' : ''}`}>
              <Ionicons name={ICON[k]} size={20} color={isNext ? t.okText : sunrise || past ? t.mute : t.fg} />
              <T w={isNext ? 'bold' : 'medium'} style={{ flex: 1, fontSize: 15.5, color: isNext ? t.okText : sunrise || past ? t.mute : t.fg }}>
                {PRAYER_AR[k]}
              </T>
              <T w={isNext ? 'numBold' : 'num'} style={{ fontSize: 15.5, color: isNext ? t.okText : sunrise || past ? t.mute : t.fg }}>{iso(clock12(times[k]))}</T>
            </View>
          );
        })}
      </Card>

      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {busy ? <ActivityIndicator size="small" color={t.ok} /> : null}
          <T style={{ flex: 1, color: t.mute, fontSize: 12.5 }}>{status}</T>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Btn label="حدّث من الموبايل" onPress={locate} style={{ flex: 1 }} />
          <Btn label={choosing ? 'اقفل المدن' : 'اختار مدينة'} onPress={() => setChoosing(!choosing)} style={{ flex: 1 }} />
        </View>
      </View>
      {choosing ? cityPicker : null}
      <T style={{ color: t.mute, fontSize: 12, lineHeight: 19 }}>المواقيت بتتحسب على الموبايل من مكانك، من غير نت. ممكن تفرق دقيقة أو اتنين عن نتيجة المسجد. طريقة الحساب بتتغير من الإعدادات.</T>
    </Screen>
  );
}

const s = StyleSheet.create({
  hero: { borderRadius: 20, padding: 18, alignItems: 'center', gap: 2 },
  pill: { marginTop: 8, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, minHeight: 52 },
});
