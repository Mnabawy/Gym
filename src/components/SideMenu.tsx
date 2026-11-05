import React, { useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReducedMotion } from '../lib/motion';
import { useSettings } from '../lib/settings';
import { tint, useTheme } from '../theme';
import { HeaderBtn, T } from './ui';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
type Item = { icon: IconName; label: string; path: '/progress' | '/weight' | '/attendance' | '/prayer' | '/calories' | '/settings' };

/**
 * ☰ header button on the main tabs. Opens a side menu that slides in from the end (left) edge, where the button is,
 * over a fading backdrop; its items slide in one after another. Tapping an item closes the menu, then opens the page.
 */
export function MenuButton() {
  const t = useTheme();
  const reduce = useReducedMotion();
  const inset = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const prayer = useSettings((s) => s.prayer);
  const [open, setOpen] = useState(false);
  const [p] = useState(() => new Animated.Value(0));
  const panel = Math.min(300, Math.round(width * 0.8));

  const items: Item[] = [
    { icon: 'stats-chart-outline', label: 'التقدم', path: '/progress' },
    { icon: 'scale-outline', label: 'وزنك', path: '/weight' },
    { icon: 'calendar-outline', label: 'الكالندر', path: '/attendance' },
    ...(prayer ? [{ icon: 'moon-outline', label: 'مواقيت الصلاة', path: '/prayer' } as Item] : []),
    { icon: 'calculator-outline', label: 'حساب السعرات', path: '/calories' },
    { icon: 'settings-outline', label: 'الإعدادات', path: '/settings' },
  ];

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
      <HeaderBtn icon="menu" label="القايمة" onPress={() => setOpen(true)} />
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

const s = StyleSheet.create({
  back: { backgroundColor: 'rgba(0, 0, 0, 0.45)' },
  panel: { position: 'absolute', top: 0, bottom: 0, end: 0, borderTopStartRadius: 22, borderBottomStartRadius: 22, borderStartWidth: 1, paddingHorizontal: 10, gap: 2, boxShadow: '0px 0px 24px rgba(0, 0, 0, 0.25)' },
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, marginBottom: 8, minHeight: 44 },
  x: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 8, borderRadius: 14 },
  icon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
