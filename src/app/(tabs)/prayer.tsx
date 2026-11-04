import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { MONTHS_AR, WEEKDAYS_AR } from '../../data/program';
import { Btn, Card, Screen, T } from '../../components/ui';
import { refreshPlace, PLACE_STALE_MS, type LocateResult } from '../../lib/place';
import { clock12, METHODS, nextPrayer, PRAYER_AR, PRAYERS, timesFor, untilAr, type PrayerKey } from '../../lib/prayer';
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
  const [err, setErr] = useState<LocateResult | null>(null);

  const locate = useCallback(async () => {
    setBusy(true);
    const r = await refreshPlace();
    setBusy(false);
    setErr(r === 'ok' ? null : r);
  }, []);

  // Follow the phone: re-read the location when the tab opens and the saved one is old (or missing).
  useFocusEffect(
    useCallback(() => {
      const p = useSettings.getState().place;
      if (!p || Date.now() - p.at > PLACE_STALE_MS) locate();
    }, [locate]),
  );

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!place) {
    return (
      <Screen title="مواقيت الصلاة" sub="بتتحسب من مكانك الحالي">
        <Card style={{ padding: 20, alignItems: 'center', gap: 10 }}>
          <Ionicons name="location-outline" size={36} color={t.mute} />
          <T w="bold" style={{ fontSize: 16 }}>{busy ? 'بنحدد مكانك…' : 'محتاجين مكانك'}</T>
          <T style={{ color: t.mute, fontSize: 13, textAlign: 'center' }}>
            {err === 'denied'
              ? 'إذن الموقع مقفول. اسمح للتطبيق يوصل لمكانك من إعدادات الموبايل.'
              : err === 'error'
                ? 'معرفناش نحدد مكانك. اتأكد إن الـ GPS شغال وجرّب تاني.'
                : 'المواقيت بتتحسب على الموبايل من مكانك، ومن غير نت.'}
          </T>
          {!busy ? <Btn label="حدد مكاني" kind="solid" onPress={locate} /> : null}
          {err === 'denied' && Platform.OS !== 'web' ? <Btn label="افتح الإعدادات" onPress={() => Linking.openSettings()} /> : null}
        </Card>
      </Screen>
    );
  }

  const times = timesFor(place, now, method);
  const next = nextPrayer(place, now, method);
  const nextIsTomorrow = next.at.getDate() !== now.getDate();
  const date = `${WEEKDAYS_AR[now.getDay()]} ${now.getDate()} ${MONTHS_AR[now.getMonth()]}`;

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

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <T style={{ flex: 1, color: t.mute, fontSize: 12.5 }}>
          {busy ? 'بنحدّث مكانك…' : err === 'denied' ? 'إذن الموقع مقفول، بنستخدم آخر مكان متسجل.' : err === 'error' ? 'معرفناش نحدّث المكان، بنستخدم آخر مكان متسجل.' : `المكان اتحدّث ${agoAr(now.getTime() - place.at)}`}
        </T>
        <Btn label="حدّث مكاني" onPress={locate} />
      </View>
      <T style={{ color: t.mute, fontSize: 12, lineHeight: 19 }}>المواقيت بتتحسب على الموبايل من مكانك، من غير نت. ممكن تفرق دقيقة أو اتنين عن نتيجة المسجد. طريقة الحساب بتتغير من الإعدادات.</T>
    </Screen>
  );
}

const s = StyleSheet.create({
  hero: { borderRadius: 20, padding: 18, alignItems: 'center', gap: 2 },
  pill: { marginTop: 8, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, minHeight: 52 },
});
