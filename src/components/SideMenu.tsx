import React, { useState } from 'react';
import { Animated, Easing, Image, Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReducedMotion } from '../lib/motion';
import { GOOGLE_NAME, GOOGLE_PHOTO, GOOGLE_USER, googleSupported } from '../lib/google';
import { syncStatus } from '../lib/cloud';
import { storage } from '../lib/storage';
import { tint, useTheme } from '../theme';
import { HeaderBtn, T } from './ui';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
type Item = { icon: IconName; label: string; path: '/dump' | '/progress' | '/week' | '/weight' | '/settings' | '/focus' | '/prayer' | '/calendar' };

// The menu on a section's pages: what you open from anywhere in it.
const SECTION_ITEMS: Item[] = [
  { icon: 'cloud-download-outline', label: 'فضّي دماغك', path: '/dump' },
  { icon: 'stats-chart-outline', label: 'التقدم', path: '/progress' },
  { icon: 'document-text-outline', label: 'تقرير الأسبوع', path: '/week' },
  { icon: 'scale-outline', label: 'وزنك والقياسات', path: '/weight' },
  { icon: 'settings-outline', label: 'الإعدادات', path: '/settings' },
];
// The menu on the home page (أقسامك): the sections are already its cards, so it holds the tools around them.
const HUB_ITEMS: Item[] = [
  { icon: 'cloud-download-outline', label: 'فضّي دماغك', path: '/dump' },
  { icon: 'timer-outline', label: 'ركّز (بومودورو)', path: '/focus' },
  { icon: 'moon-outline', label: 'مواقيت الصلاة', path: '/prayer' },
  { icon: 'document-text-outline', label: 'تقرير الأسبوع', path: '/week' },
  { icon: 'stats-chart-outline', label: 'التقدم في الجيم', path: '/progress' },
  { icon: 'settings-outline', label: 'الإعدادات', path: '/settings' },
];

/**
 * The section button (the section you're in, tap to switch: الجيم، العادات، الأهداف، بطّل) and the ☰ header button on the main tabs. Opens a side menu that slides in from the end (left) edge, where the button is,
 * over a fading backdrop; its items slide in one after another. Tapping an item closes the menu, then opens the page.
 */
/**
 * The same on every page: the sections grid (أقسامك) and ☰ (the side menu), plain tint icons. `hub`: on the home page
 * itself, ☰ only (no grid: that's where you are), with the home page's own links. `color`: the icon color there.
 */
export function MenuButton({ hub, color }: { hub?: boolean; color?: string } = {}) {
  const t = useTheme();
  const reduce = useReducedMotion();
  const inset = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const [p] = useState(() => new Animated.Value(0));
  const panel = Math.min(300, Math.round(width * 0.8));

  const items = hub ? HUB_ITEMS : SECTION_ITEMS;

  const run = (to: 0 | 1, done?: () => void) =>
    Animated.timing(p, {
      toValue: to,
      duration: reduce ? 0 : to ? 280 : 200,
      easing: to ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => done?.());
  const close = (then?: () => void) =>
    run(0, () => {
      setOpen(false);
      then?.();
    });

  // The panel sits at the left edge (RTL end); translateX is physical, so hidden is to the left.
  const x = p.interpolate({ inputRange: [0, 1], outputRange: [-panel, 0] });

  return (
    <>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {hub ? null : <HeaderBtn icon="apps-outline" label="أقسامك" onPress={() => router.push('/sections')} />}
        <HeaderBtn icon="menu" label="القايمة" color={color} onPress={() => setOpen(true)} />
      </View>
      <Modal visible={open} transparent animationType="none" statusBarTranslucent navigationBarTranslucent onShow={() => run(1)} onRequestClose={() => close()}>
        <Animated.View style={[StyleSheet.absoluteFill, s.back, { opacity: p }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => close()} accessibilityRole="button" accessibilityLabel="اقفل القايمة" />
        </Animated.View>
        <Animated.View
          style={[
            s.panel,
            {
              width: panel,
              paddingTop: inset.top + 14,
              paddingBottom: inset.bottom + 14,
              backgroundColor: t.card,
              borderColor: t.neon ? t.border : 'transparent',
              transform: [{ translateX: x }],
            },
          ]}>
          <View style={s.top}>
            <T w="bold" style={{ fontSize: 16, flex: 1 }}>القايمة</T>
            <Pressable onPress={() => close()} hitSlop={10} accessibilityRole="button" accessibilityLabel="اقفل القايمة" style={({ pressed }) => [s.x, { opacity: pressed ? 0.6 : 1 }]}>
              <Ionicons name="close" size={22} color={t.mute} />
            </Pressable>
          </View>
          {googleSupported ? <Account onPress={(to) => close(() => router.push(to))} /> : null}
          {items.map((it, i) => {
            // Each item follows the panel in, a little later than the one before.
            const a = p.interpolate({ inputRange: [0.25 + i * 0.1, Math.min(1, 0.65 + i * 0.1)], outputRange: [0, 1], extrapolate: 'clamp' });
            return (
              <Animated.View key={it.path} style={{ opacity: a, transform: [{ translateX: a.interpolate({ inputRange: [0, 1], outputRange: [-18, 0] }) }] }}>
                <Pressable
                  onPress={() => close(() => router.push(it.path))}
                  accessibilityRole="button"
                  accessibilityLabel={it.label}
                  style={({ pressed }) => [s.item, { backgroundColor: pressed ? t.soft : 'transparent' }]}>
                  <View style={[s.icon, { backgroundColor: tint(t.ok, 0.13) }]}>
                    <Ionicons name={it.icon} size={19} color={t.okText} />
                  </View>
                  <T w="semi" style={{ fontSize: 15, flex: 1 }}>{it.label}</T>
                  <Ionicons name="chevron-back" size={16} color={t.mute} />
                </Pressable>
              </Animated.View>
            );
          })}
        </Animated.View>
      </Modal>
    </>
  );
}


/** Your Google account at the top of the menu (name, photo, email), or a sign-in row. */
function Account({ onPress }: { onPress: (to: '/account') => void }) {
  const t = useTheme();
  const email = storage.getMeta(GOOGLE_USER);
  const name = storage.getMeta(GOOGLE_NAME);
  const photo = storage.getMeta(GOOGLE_PHOTO);
  return (
    <Pressable
      onPress={() => onPress('/account')}
      accessibilityRole="button"
      accessibilityLabel={email ? `حسابك: ${email}` : 'ادخل بحساب Google'}
      style={({ pressed }) => [s.account, { backgroundColor: pressed ? t.soft : tint(t.ok, 0.07) }]}>
      {photo ? <Image source={{ uri: photo }} style={s.avatar} /> : (
        <View style={[s.avatar, { backgroundColor: tint(t.ok, 0.15), alignItems: 'center', justifyContent: 'center' }]}>
          <Ionicons name={email ? 'person' : 'log-in-outline'} size={20} color={t.okText} />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <T w="semi" style={{ fontSize: 14.5 }} numberOfLines={1}>{email ? name || 'حسابك' : 'ادخل بحساب Google'}</T>
        <T style={{ fontSize: 12, color: !email ? t.mute : { saved: t.okText, waiting: t.mute, failed: t.bad, off: t.mute }[syncStatus().state] }} numberOfLines={1}>{!email ? 'بياناتك تتحفظ وترجع على أي موبايل' : { saved: '☁️ بياناتك محفوظة', waiting: '☁️ بيحفظ…', failed: '⚠️ الحفظ واقف، دوس هنا', off: email }[syncStatus().state]}</T>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  account: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, marginBottom: 8 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  back: { backgroundColor: 'rgba(0, 0, 0, 0.45)' },
  panel: { position: 'absolute', top: 0, bottom: 0, end: 0, borderTopStartRadius: 22, borderBottomStartRadius: 22, borderStartWidth: 1, paddingHorizontal: 10, gap: 2, boxShadow: '0px 0px 24px rgba(0, 0, 0, 0.25)' },
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, marginBottom: 8, minHeight: 44 },
  x: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52, paddingHorizontal: 8, borderRadius: 14 },
  icon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
