import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { buzz, useTimer } from '../lib/timer';
import { formatClock } from '../lib/logic';
import { Ring, T } from './ui';
import { useTheme } from '../theme';

export function TimerBar() {
  const t = useTheme();
  const { endAt, total, label, add, stop } = useTimer();
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
    <View style={[s.bar, { backgroundColor: t.ink, boxShadow: t.shadow }]} accessibilityLiveRegion="polite">
      <Ring value={over ? 1 : left / (total * 1000)} size={62} stroke={5} color={t.ok} track="rgba(255,255,255,0.18)">
        <T w="numBold" style={{ color: '#FFFFFF', fontSize: 15 }}>{formatClock(left)}</T>
      </Ring>
      <View style={{ flex: 1, minWidth: 0 }}>
        <T w="bold" style={{ color: over ? t.ok : '#FFFFFF', fontSize: 15 }}>{over ? 'يلا المجموعة الجاية' : 'راحة'}</T>
        <T w="num" style={{ color: '#FFFFFF', opacity: 0.75, fontSize: 12.5 }} numberOfLines={1}>{label}</T>
      </View>
      <Pressable onPress={() => add(30)} style={s.btn} accessibilityRole="button">
        <T w="semi" style={{ color: '#FFFFFF' }}>+30 ث</T>
      </Pressable>
      <Pressable onPress={stop} style={[s.btn, { backgroundColor: t.ok, borderColor: t.ok }]} accessibilityRole="button">
        <T w="semi" style={{ color: '#FFFFFF' }}>خلاص</T>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 12, marginBottom: 8, padding: 10, borderRadius: 20 },
  btn: { minHeight: 44, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)', justifyContent: 'center' },
});
