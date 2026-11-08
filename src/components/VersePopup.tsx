import { useEffect, useState } from 'react';
import { Animated, AppState, Easing, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Rect } from 'react-native-svg';
import { create } from 'zustand';
import { VERSES, type Verse } from '../data/verses';
import { arabicDigits, nextVerseIndex } from '../lib/logic';
import { storage } from '../lib/storage';
import { useSettings } from '../lib/settings';
import { F, tint, useTheme } from '../theme';
import { T } from './ui';

const KEY = 'verse.last';
/** Coming back after this long counts as opening the app again (stepping out during rest doesn't). */
const AWAY_MS = 30 * 60 * 1000;
const native = Platform.OS !== 'web';

function pickVerse(): Verse {
  const raw = storage.getMeta(KEY);
  const i = nextVerseIndex(raw == null ? null : Number(raw), VERSES.length);
  storage.setMeta(KEY, String(i));
  return VERSES[i];
}

/** "سورة الشرح · ٥–٦" */
function reference(v: Verse): string {
  const a = v.ayahs;
  const range = a.length > 1 ? `${a[0]}–${a[a.length - 1]}` : `${a[0]}`;
  return `سورة ${v.surah} · ${arabicDigits(range)}`;
}

/** Tanzil puts a space before pause marks (ۖ ۗ ۚ …); dropping it seats each mark over the end of its word, as in print. */
const glueMarks = (line: string) => line.replace(/ ([ۖ-ۜ])/g, '$1');

/** Popup state. Created once per launch, so the launch verse is picked exactly once (when the setting is on). */
export const useVersePopup = create<{ verse: Verse | null; open: boolean; show: () => void; close: () => void }>((set) => {
  const first = useSettings.getState().verse ? pickVerse() : null;
  return { verse: first, open: first != null, show: () => set({ verse: pickVerse(), open: true }), close: () => set({ open: false }) };
});

/** A Quran verse shown when the app opens (cold start, or back after a long time away). Settings can turn either off. */
export function VersePopup() {
  const t = useTheme();
  const { verse, open, close } = useVersePopup();
  const [pop] = useState(() => new Animated.Value(0));

  useEffect(() => {
    let leftAt: number | null = null;
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') leftAt = Date.now();
      else if (s === 'active' && leftAt != null) {
        const { verse: on, verseOnReturn } = useSettings.getState();
        if (on && verseOnReturn && Date.now() - leftAt >= AWAY_MS) useVersePopup.getState().show();
        leftAt = null;
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!open) return;
    pop.setValue(0);
    Animated.timing(pop, { toValue: 1, duration: 420, delay: 80, easing: Easing.out(Easing.back(1.4)), useNativeDriver: native }).start();
  }, [open, verse, pop]);

  if (!verse) return null;
  const long = verse.text.join(' ').length > 110;
  const size = long ? 22 : 26;

  return (
    <Modal visible={open} transparent animationType="fade" statusBarTranslucent onRequestClose={close}>
      <Pressable style={s.backdrop} onPress={close} accessibilityLabel="قفل الآية">
        <Animated.View
          style={[s.wrap, { opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] }]}>
          {/* Taps inside the card shouldn't close it. */}
          <Pressable accessibilityViewIsModal onPress={() => {}} style={[s.card, { backgroundColor: t.card, boxShadow: '0px 18px 48px rgba(0, 0, 0, 0.28)' }]}>
            <View style={[s.frame, { borderColor: tint(t.ok, 0.28) }]}>
              <View style={[s.badge, { backgroundColor: t.card }]}>
                <Star color={t.ok} fill={tint(t.ok, 0.12)} hole={t.card} />
              </View>

              <T w="medium" style={{ color: t.mute, fontSize: 13, textAlign: 'center' }}>قال الله تعالى</T>

              <Text
                accessibilityLanguage="ar"
                style={{ fontFamily: F.quran, fontSize: size, lineHeight: size * 2, color: t.fg, textAlign: 'center', writingDirection: 'rtl', marginTop: 6 }}>
                <Text style={{ color: t.ok }}>{'﴿ '}</Text>
                {verse.text.map((line, i) => (
                  <Text key={i}>
                    {i > 0 ? <Text style={{ color: t.ok }}>{' ۝ '}</Text> : null}
                    {glueMarks(line)}
                  </Text>
                ))}
                <Text style={{ color: t.ok }}>{' ﴾'}</Text>
              </Text>

              <Divider color={tint(t.ok, 0.45)} />
              <T w="medium" style={{ color: t.okText, fontSize: 13.5, textAlign: 'center' }}>{reference(verse)}</T>
            </View>

            <Pressable
              onPress={close}
              accessibilityRole="button"
              style={({ pressed }) => [s.btn, { backgroundColor: t.ok, opacity: pressed ? 0.85 : 1 }]}>
              <T w="semi" style={{ color: t.onOk, fontSize: 14 }}>يلا بينا</T>
            </Pressable>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

/** Eight-point star (two overlapping squares) with a small ring in the middle. */
function Star({ color, fill, hole }: { color: string; fill: string; hole: string }) {
  return (
    <Svg width={52} height={52} viewBox="0 0 52 52">
      <Rect x={11} y={11} width={30} height={30} rx={2} fill={fill} stroke={color} strokeWidth={1.6} />
      <Rect x={11} y={11} width={30} height={30} rx={2} fill={fill} stroke={color} strokeWidth={1.6} transform="rotate(45 26 26)" />
      <Circle cx={26} cy={26} r={6.5} fill={hole} stroke={color} strokeWidth={1.6} />
      <Circle cx={26} cy={26} r={2} fill={color} />
    </Svg>
  );
}

/** Thin line — diamond — thin line. */
function Divider({ color }: { color: string }) {
  return (
    <View style={s.divider}>
      <View style={[s.rule, { backgroundColor: color }]} />
      <View style={[s.diamond, { borderColor: color }]} />
      <View style={[s.rule, { backgroundColor: color }]} />
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(8, 14, 20, 0.62)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  wrap: { width: '100%', maxWidth: 420 },
  card: { borderRadius: 12, padding: 10, gap: 10 },
  frame: { borderWidth: 1, borderRadius: 12, paddingTop: 40, paddingBottom: 20, paddingHorizontal: 16, marginTop: 26, alignItems: 'stretch' },
  badge: { position: 'absolute', top: -27, alignSelf: 'center', padding: 2, borderRadius: 12 },
  divider: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4, marginBottom: 8 },
  rule: { height: 1, width: 44 },
  diamond: { width: 7, height: 7, borderWidth: 1.2, transform: [{ rotate: '45deg' }] },
  btn: { height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, // same size as Btn
});
