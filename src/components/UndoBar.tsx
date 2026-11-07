import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T } from './ui';
import { useUndo } from '../lib/undo';
import { tap } from '../lib/timer';
import { useTheme } from '../theme';

const SHOW_MS = 5000;

/**
 * The global undo snackbar: a bar pinned to the bottom with the last reversible action and a "تراجع" button, gone on
 * its own after a few seconds. Mounted once in the root layout as an overlay (box-none so it never blocks the screen).
 */
export function UndoBar() {
  const t = useTheme();
  const inset = useSafeAreaInsets();
  const message = useUndo((s) => s.message);
  const seq = useUndo((s) => s.seq);
  const run = useUndo((s) => s.run);
  const dismiss = useUndo((s) => s.dismiss);
  const y = useRef(new Animated.Value(80)).current;

  useEffect(() => {
    if (!message) return;
    Animated.spring(y, { toValue: 0, useNativeDriver: true, speed: 16, bounciness: 4 }).start();
    const id = setTimeout(() => dismiss(), SHOW_MS);
    return () => clearTimeout(id);
  }, [message, seq, y, dismiss]);

  useEffect(() => {
    if (!message) y.setValue(80);
  }, [message, y]);

  if (!message) return null;
  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end', padding: 12, paddingBottom: inset.bottom + 70 }]}>
      <Animated.View style={[s.bar, { backgroundColor: t.ink, transform: [{ translateY: y }] }]}>
        <T style={{ flex: 1, color: t.onInk ?? '#FFFFFF', fontSize: 13.5 }} numberOfLines={1}>{message}</T>
        <Pressable
          onPress={() => { tap(); run(); }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="تراجع"
          style={({ pressed }) => [s.undo, { opacity: pressed ? 0.6 : 1 }]}>
          <Ionicons name="arrow-undo" size={16} color={t.onInk ?? '#FFFFFF'} />
          <T w="bold" style={{ color: t.onInk ?? '#FFFFFF', fontSize: 13.5 }}>تراجع</T>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, paddingVertical: 11, paddingHorizontal: 14, boxShadow: '0px 6px 20px rgba(0,0,0,0.3)' },
  undo: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 4 },
});
