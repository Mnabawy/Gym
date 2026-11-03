import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { buzz, useTimer } from '../lib/timer';
import { formatClock } from '../lib/logic';
import { T } from './ui';
import { useTheme } from '../theme';

export function TimerBar() {
  const t = useTheme();
  const { endAt, label, add, stop } = useTimer();
  const [now, setNow] = useState(() => Date.now());
  const fired = useRef<number | null>(null);

  useEffect(() => {
    if (!endAt) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [endAt]);

  useEffect(() => {
    if (endAt && now >= endAt && fired.current !== endAt) {
      fired.current = endAt;
      buzz();
    }
  }, [now, endAt]);

  if (!endAt) return null;
  const left = endAt - now;
  const over = left <= 0;
  return (
    <View style={[s.bar, { backgroundColor: t.ink, paddingBottom: 10 }]} accessibilityLiveRegion="polite">
      <View style={{ flex: 1 }}>
        <T style={{ color: t.onInk, opacity: 0.75, fontSize: 12 }}>{over ? 'يلا المجموعة الجاية' : `راحة · ${label}`}</T>
        <T w="numBold" style={{ color: over ? t.ok : t.onInk, fontSize: 30, lineHeight: 36 }}>{formatClock(left)}</T>
      </View>
      <Pressable onPress={() => add(30)} style={[s.btn, { borderColor: t.onInk + '55' }]} accessibilityRole="button">
        <T w="semi" style={{ color: t.onInk }}>+30 ث</T>
      </Pressable>
      <Pressable onPress={stop} style={[s.btn, { borderColor: t.onInk + '55' }]} accessibilityRole="button">
        <T w="semi" style={{ color: t.onInk }}>خلاص</T>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 10 },
  btn: { minHeight: 44, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, justifyContent: 'center' },
});
