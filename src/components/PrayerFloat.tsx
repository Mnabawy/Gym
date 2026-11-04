import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { countdown, nextPrayer, PRAYER_AR, untilAr } from '../lib/prayer';
import { useSettings } from '../lib/settings';
import { useTimer } from '../lib/timer';
import { useTheme } from '../theme';
import { T } from './ui';

const TAB_BAR = 56;
const REST_BAR = 96; // rest timer bar on the workout tab
const SOON_MS = 15 * 60 * 1000;
const iso = (s: string) => `⁦${s}⁩`;

/**
 * Small floating chip with a live countdown to the next prayer, over every tab except the prayer tab.
 * Tapping it opens the prayer times. Shown when prayer times are on and a place is known; settings can hide it.
 * Sits at the start side (right in RTL) so it doesn't cover the ✓ buttons, and moves up while the rest timer shows.
 */
export function PrayerFloat() {
  const t = useTheme();
  const on = useSettings((s) => s.prayer && s.prayerFloat);
  const place = useSettings((s) => s.place);
  const method = useSettings((s) => s.prayerMethod);
  const resting = useTimer((s) => s.endAt != null);
  const path = usePathname();
  const inset = useSafeAreaInsets();
  const [now, setNow] = useState(() => Date.now());
  const live = on && !!place && path !== '/prayer';

  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live]);

  if (!live || !place) return null;
  const next = nextPrayer(place, new Date(now), method);
  const left = next.at.getTime() - now;
  const soon = left <= SOON_MS;
  const bottom = inset.bottom + TAB_BAR + 12 + (resting && path === '/' ? REST_BAR : 0);

  return (
    <Pressable
      onPress={() => router.navigate('/prayer')}
      accessibilityRole="button"
      accessibilityLabel={`${PRAYER_AR[next.key]} بعد ${untilAr(left)}. افتح مواقيت الصلاة`}
      style={({ pressed }) => [s.chip, { bottom, backgroundColor: soon ? t.ok : t.ink, boxShadow: t.shadow, opacity: pressed ? 0.85 : 1 }]}>
      <View style={[s.icon, { backgroundColor: 'rgba(255,255,255,0.16)' }]}>
        <Ionicons name="moon" size={15} color="#FFFFFF" />
      </View>
      <View>
        <T w="semi" style={s.name}>{PRAYER_AR[next.key]}</T>
        <T w="numBold" style={s.clock}>{iso(countdown(left))}</T>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  chip: { position: 'absolute', start: 12, flexDirection: 'row', alignItems: 'center', gap: 8, paddingStart: 6, paddingEnd: 12, minHeight: 48, borderRadius: 24 },
  icon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  name: { color: '#FFFFFF', fontSize: 11, lineHeight: 15, opacity: 0.85 },
  clock: { color: '#FFFFFF', fontSize: 15, lineHeight: 19 },
});
