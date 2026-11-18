import { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { Quote } from '../data/workoutQuotes';
import { tint, useTheme } from '../theme';
import { T } from './ui';

const native = Platform.OS !== 'web';

/** Popup after the last set of the day's workout: it's done, what's next, and a hadith or a fact about training. */
export function WorkoutDonePopup({ visible, title, next, quote, onClose }: { visible: boolean; title: string; next: string | null; quote: Quote; onClose: () => void }) {
  const t = useTheme();
  const [pop] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!visible) return;
    pop.setValue(0);
    Animated.timing(pop, { toValue: 1, duration: 420, delay: 80, easing: Easing.out(Easing.back(1.4)), useNativeDriver: native }).start();
  }, [visible, pop]);

  const hadith = quote.kind === 'hadith';
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="قفل">
        <Animated.View style={[s.wrap, { opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] }]}>
          {/* Taps inside the card shouldn't close it. */}
          <Pressable accessibilityViewIsModal onPress={() => {}} style={[s.card, { backgroundColor: t.card, boxShadow: '0px 18px 48px rgba(0, 0, 0, 0.28)' }]}>
            <View style={{ alignItems: 'center', gap: 6, paddingTop: 8 }}>
              <View style={[s.badge, { backgroundColor: tint(t.ok, 0.12), borderColor: tint(t.ok, 0.28) }]}>
                <Ionicons name="trophy" size={30} color="#E0A400" />
              </View>
              <T w="bold" style={{ fontSize: 20, textAlign: 'center' }}>خلصت التمرين 💪</T>
              <T style={{ fontSize: 13.5, color: t.mute, textAlign: 'center' }}>{next ? `${title} · الجاي: ${next}` : title}</T>
            </View>

            <View style={[s.quote, { borderColor: tint(t.ok, 0.28), backgroundColor: t.soft }]}>
              <T w="medium" style={{ color: t.mute, fontSize: 12.5, textAlign: 'center' }}>{hadith ? 'قال رسول الله ﷺ' : 'تعرف إن…'}</T>
              <T w={hadith ? 'semi' : 'medium'} style={{ fontSize: hadith ? 17 : 15.5, lineHeight: hadith ? 30 : 26, textAlign: 'center' }}>
                {hadith ? `«${quote.text}»` : quote.text}
              </T>
              <T style={{ color: t.okText, fontSize: 12.5, textAlign: 'center' }}>{quote.source}</T>
            </View>

            <Pressable onPress={onClose} accessibilityRole="button" style={({ pressed }) => [s.btn, { backgroundColor: t.ok, opacity: pressed ? 0.85 : 1 }]}>
              <T w="semi" style={{ color: t.onOk, fontSize: 14 }}>تمام</T>
            </Pressable>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(8, 14, 20, 0.62)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  wrap: { width: '100%', maxWidth: 420 },
  card: { borderRadius: 12, padding: 12, gap: 12 },
  badge: { width: 60, height: 60, borderRadius: 30, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  quote: { borderWidth: 1, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 14, gap: 8 },
  btn: { height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, // same size as Btn
});
