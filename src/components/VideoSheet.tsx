import { useEffect, useState } from 'react';
import { Animated, Easing, Linking, Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { videoUrl, viewsAr, type FormVideo } from '../data/videos';
import { native, useReducedMotion } from '../lib/motion';
import { useTheme } from '../theme';
import { Btn, T } from './ui';
import { YouTubePlayer } from './YouTubePlayer';

/**
 * Bottom sheet that plays an exercise's form video inside the app: the backdrop fades in while the sheet springs up,
 * and slides back down on close. Closing unmounts the player right away, so playback stops.
 */
export function VideoSheet({ video, name, visible, onClose }: { video: FormVideo; name: string; visible: boolean; onClose: () => void }) {
  const t = useTheme();
  const win = useWindowDimensions();
  const inset = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const [a] = useState(() => new Animated.Value(0));
  // Keep the modal up until the slide-out ends.
  const [shown, setShown] = useState(visible);
  if (visible && !shown) setShown(true);
  useEffect(() => {
    if (!shown) return;
    const anim = visible
      ? Animated.spring(a, { toValue: 1, friction: 9, tension: 70, useNativeDriver: native })
      : Animated.timing(a, { toValue: 0, duration: reduce ? 0 : 220, easing: Easing.in(Easing.cubic), useNativeDriver: native });
    if (visible && reduce) a.setValue(1);
    else anim.start(({ finished }) => finished && !visible && setShown(false));
    return () => anim.stop();
  }, [visible, shown, reduce, a]);
  const maxW = Math.min(win.width - 32, 560);
  // Shorts are vertical (9:16): as tall as fits, about two thirds of the screen. Others are 16:9 across the sheet.
  const size = video.short
    ? (() => {
        const h = Math.min(win.height * 0.62, (maxW * 16) / 9);
        return { width: (h * 9) / 16, height: h };
      })()
    : { width: maxW, height: (maxW * 9) / 16 };

  return (
    <Modal visible={shown} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: a }]}>
        <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="قفل الفيديو" />
      </Animated.View>
      <Animated.View
        style={[s.sheet, { backgroundColor: t.card, paddingBottom: 16 + inset.bottom, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [win.height, 0] }) }] }]}
        accessibilityViewIsModal>
        <View style={s.head}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <T w="num" style={{ fontSize: 16.5 }} numberOfLines={1}>{name}</T>
            <T style={{ color: t.mute, fontSize: 12.5 }} numberOfLines={1}>{`الوضعية الصحيحة · ${video.channel}`}</T>
          </View>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="قفل" hitSlop={6} style={[s.close, { backgroundColor: t.soft }]}>
            <Ionicons name="close" size={22} color={t.fg} />
          </Pressable>
        </View>
        <View style={[s.player, size]}>{visible ? <YouTubePlayer id={video.id} /> : null}</View>
        <T style={{ color: t.mute, fontSize: 12, textAlign: 'center' }}>{`${viewsAr(video.views)} مشاهدة على يوتيوب · محتاج نت`}</T>
        <Btn label="افتح في يوتيوب" onPress={() => Linking.openURL(videoUrl(video)).catch(() => {})} />
      </Animated.View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(8, 14, 20, 0.6)' },
  sheet: { position: 'absolute', bottom: 0, start: 0, end: 0, borderTopStartRadius: 24, borderTopEndRadius: 24, paddingTop: 14, paddingHorizontal: 16, gap: 12, alignItems: 'stretch' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  player: { alignSelf: 'center', borderRadius: 16, overflow: 'hidden', backgroundColor: '#000' },
});
