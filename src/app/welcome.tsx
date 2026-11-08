import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Image, Pressable, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { setStatusBarStyle } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { T } from '../components/ui';
import { parseBackup } from '../lib/backup';
import { pickBackup } from '../lib/backupIO';
import { cloudConfigured, linkCloud } from '../lib/cloud';
import { linkGoogle } from '../lib/google';
import { native, useReducedMotion } from '../lib/motion';
import { applyBackup, WELCOME_KEY } from '../lib/restore';
import { storage } from '../lib/storage';
import { warmDark, ThemeProvider, tint, useTheme } from '../theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const FEATURES: { icon: IconName; title: string; sub: string; color: string }[] = [
  { icon: 'finger-print', title: 'دوسة واحدة', sub: 'بحساب Google، من غير باسورد', color: '#22F3E4' },
  { icon: 'cloud-done-outline', title: 'بياناتك معاك', sub: 'بتتحفظ أول بأول وترجع على أي موبايل', color: '#3FB6FF' },
  { icon: 'lock-closed-outline', title: 'ليك لوحدك', sub: 'محدش غيرك يقدر يشوفها، ولا حتى إحنا', color: '#B18CFF' },
];

/**
 * First launch (phone), always in the dark warm look: one-tap Google sign-in — no password — and your data follows you.
 * Signing in turns on Supabase sync, which brings back everything on the server and merges it with what's here.
 * Or a backup file, or skip.
 */
export default function Welcome() {
  return (
    <ThemeProvider value={warmDark}>
      <WelcomeScreen />
    </ThemeProvider>
  );
}

function WelcomeScreen() {
  const t = useTheme();
  const reduce = useReducedMotion();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Entrance: logo, title, the three features and the buttons rise in one after another.
  const [steps] = useState(() => Array.from({ length: 6 }, () => new Animated.Value(0)));
  useEffect(() => {
    if (reduce) return steps.forEach((v) => v.setValue(1));
    Animated.stagger(90, steps.map((v) => Animated.timing(v, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: native }))).start();
  }, [reduce, steps]);
  const rise = (i: number) => ({ opacity: steps[i], transform: [{ translateY: steps[i].interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] });

  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      return () => setStatusBarStyle('auto');
    }, []),
  );

  const finish = () => {
    storage.setMeta(WELCOME_KEY, '1');
    router.replace('/');
  };

  // A backup file from anywhere the phone can open (through the file picker).
  const fromFile = async () => {
    setErr(null);
    try {
      const text = await pickBackup();
      if (!text) return;
      const p = parseBackup(text);
      if (!p.ok) return setErr(p.error);
      applyBackup(p.data, p.photos);
      finish();
    } catch {
      setErr('معرفتش أفتح الملف، جرّب تاني');
    }
  };

  const signIn = async () => {
    setErr(null);
    setBusy(true);
    try {
      const email = await linkGoogle();
      if (!email) return; // cancelled
      // Supabase sync: brings back everything on the server and merges it with what's here, no question needed.
      // If it fails now it tries again on its own (the account page shows it).
      if (cloudConfigured) await linkCloud().catch(() => {});
      finish();
    } catch (e) {
      const why = String((e as { code?: string; message?: string })?.code ?? (e as Error)?.message ?? '').slice(0, 80);
      setErr(`الدخول ما نفعش، جرّب تاني${why ? ` (${why})` : ''}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Backdrop />
      <SafeAreaView style={{ flex: 1 }}>
        <View style={s.wrap}>
          <View style={s.top}>
            <Animated.View style={[s.logo, rise(0), { borderColor: tint(t.ok, 0.45), boxShadow: `0px 0px 40px ${tint(t.ok, 0.45)}` }]}>
              <Image source={require('../../assets/splash-icon.png')} style={{ width: 64, height: 64 }} />
            </Animated.View>
            <Animated.View style={[{ gap: 8, alignItems: 'center' }, rise(1)]}>
              <T w="bold" style={{ fontSize: 31, lineHeight: 44, textAlign: 'center' }}>
                {'Brainy\n'}
                <T w="bold" style={{ fontSize: 24, lineHeight: 36, color: t.ok }}>تمرينك وعاداتك وأهدافك في مكان واحد</T>
              </T>
              <T style={{ color: t.mute, fontSize: 15, textAlign: 'center', lineHeight: 24 }}>ادخل مرة واحدة، والتطبيق يفتكر كل حاجة</T>
            </Animated.View>
          </View>

          <>
              <View style={{ gap: 10 }}>
                {FEATURES.map((f, i) => (
                  <Animated.View key={f.title} style={[s.glass, s.feature, rise(2 + i)]}>
                    <View style={[s.fIcon, { backgroundColor: tint(f.color, 0.14), borderColor: tint(f.color, 0.35) }]}>
                      <Ionicons name={f.icon} size={20} color={f.color} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <T w="semi" style={{ fontSize: 15 }}>{f.title}</T>
                      <T style={{ fontSize: 12.5, color: t.mute, lineHeight: 19 }}>{f.sub}</T>
                    </View>
                  </Animated.View>
                ))}
              </View>

              <Animated.View style={[{ gap: 8 }, rise(5)]}>
                <Pressable
                  onPress={signIn}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel="كمّل بحساب Google"
                  hitSlop={{ top: 2, bottom: 2 }}
                  style={({ pressed }) => [s.google, { opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
                  {busy ? (
                    <ActivityIndicator color="#1F1F1F" />
                  ) : (
                    <>
                      <GoogleG />
                      <T w="semi" style={{ fontSize: 14, color: '#1F1F1F' }}>كمّل بحساب Google</T>
                    </>
                  )}
                </Pressable>
                {err ? <T style={{ color: t.bad, fontSize: 13, textAlign: 'center' }}>{err}</T> : null}
                <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 13 }}>
                  <Pressable onPress={fromFile} accessibilityRole="button" hitSlop={8} style={({ pressed }) => ({ minHeight: 40, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
                    <T w="medium" style={{ fontSize: 14, color: t.ok }}>عندي ملف نسخة</T>
                  </Pressable>
                  <Pressable onPress={finish} accessibilityRole="button" hitSlop={8} style={({ pressed }) => ({ minHeight: 40, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
                    <T w="medium" style={{ fontSize: 14, color: t.mute }}>كمّل من غير حساب</T>
                  </Pressable>
                </View>
              </Animated.View>
            </>
        </View>
      </SafeAreaView>
    </View>
  );
}

/** Dark gradient with two soft glows (teal at the top, violet at the bottom). */
function Backdrop() {
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 200">
      <Defs>
        <LinearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#071018" />
          <Stop offset="1" stopColor="#05070C" />
        </LinearGradient>
        <RadialGradient id="g1" cx="80" cy="25" r="70" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#22F3E4" stopOpacity="0.22" />
          <Stop offset="1" stopColor="#22F3E4" stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="g2" cx="10" cy="185" r="75" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#B18CFF" stopOpacity="0.18" />
          <Stop offset="1" stopColor="#B18CFF" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100" height="200" fill="url(#bg)" />
      <Rect x="0" y="0" width="100" height="200" fill="url(#g1)" />
      <Rect x="0" y="0" width="100" height="200" fill="url(#g2)" />
    </Svg>
  );
}

/** Google's "G" mark, as Google's sign-in button guidelines show it. */
function GoogleG() {
  return (
    <Svg width={18} height={18} viewBox="0 0 48 48">
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, maxWidth: 460, width: '100%', alignSelf: 'center', paddingHorizontal: 18, paddingTop: 24, paddingBottom: 16, justifyContent: 'space-between', gap: 14 },
  top: { alignItems: 'center', gap: 15, marginTop: 24 },
  logo: { width: 92, height: 92, borderRadius: 12, borderWidth: 1, backgroundColor: 'rgba(34, 243, 228, 0.08)', alignItems: 'center', justifyContent: 'center' },
  glass: { backgroundColor: 'rgba(255, 255, 255, 0.04)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)', borderRadius: 12, padding: 14 },
  feature: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  fIcon: { width: 42, height: 42, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  // Same size as every other button (Btn: 40pt), white like Google's own sign-in button.
  google: { height: 40, borderRadius: 10, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
});
