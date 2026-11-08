import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { T } from './ui';
import { from12, to12 } from '../lib/tasks';
import { useTheme } from '../theme';

const SIZE = 236;
const R = 92;
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * A clock face to pick the time: tap the hour, then the minutes (5-minute marks, ± for one minute), and ص / م.
 * The dial is drawn by angle, so it's the same left to right whatever the layout direction.
 */
export function ClockPicker({ value, onChange }: { value: number; onChange: (m: number) => void }) {
  const t = useTheme();
  const [mode, setMode] = useState<'h' | 'm'>('h');
  const { h, min, pm } = to12(value);
  const set = (nh: number, nm: number, npm: boolean) => onChange(from12(nh, nm, npm));
  const marks = mode === 'h' ? Array.from({ length: 12 }, (_, i) => i + 1) : Array.from({ length: 12 }, (_, i) => i * 5);
  const sel = mode === 'h' ? h : min;
  // Hand: hours sit on their mark; minutes point to the exact minute.
  const angle = mode === 'h' ? (h % 12) * 30 : min * 6;

  return (
    <View style={{ alignItems: 'center', gap: 8 }}>
      <View style={[s.read, { direction: 'ltr' }]}>
        <Pressable onPress={() => setMode('h')} accessibilityRole="button" accessibilityLabel="الساعة" style={[s.seg, { backgroundColor: mode === 'h' ? t.ok : t.soft }]}>
          <T w="numBold" style={{ fontSize: 30, color: mode === 'h' ? t.onOk : t.fg }}>{pad(h)}</T>
        </Pressable>
        <T w="numBold" style={{ fontSize: 30 }}>:</T>
        <Pressable onPress={() => setMode('m')} accessibilityRole="button" accessibilityLabel="الدقايق" style={[s.seg, { backgroundColor: mode === 'm' ? t.ok : t.soft }]}>
          <T w="numBold" style={{ fontSize: 30, color: mode === 'm' ? t.onOk : t.fg }}>{pad(min)}</T>
        </Pressable>
        <View style={{ gap: 4, marginStart: 6 }}>
          {[false, true].map((p) => (
            <Pressable key={String(p)} onPress={() => set(h, min, p)} accessibilityRole="button" accessibilityState={{ selected: pm === p }} style={[s.ampm, { backgroundColor: pm === p ? t.fg : t.soft }]}>
              <T w="semi" style={{ fontSize: 13, color: pm === p ? t.bg : t.fg }}>{p ? 'م' : 'ص'}</T>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={[s.dial, { backgroundColor: t.soft, direction: 'ltr' }]}>
        <View style={[s.hand, { backgroundColor: t.ok, transform: [{ rotate: `${angle}deg` }] }]} />
        <View style={[s.center, { backgroundColor: t.ok }]} />
        {marks.map((n, i) => {
          const a = (i + (mode === 'h' ? 1 : 0)) * 30 * (Math.PI / 180);
          const x = SIZE / 2 + R * Math.sin(a) - 20;
          const y = SIZE / 2 - R * Math.cos(a) - 20;
          const on = sel === n;
          return (
            <Pressable
              key={n}
              onPress={() => {
                if (mode === 'h') {
                  set(n, min, pm);
                  setMode('m');
                } else set(h, n, pm);
              }}
              accessibilityRole="button"
              accessibilityLabel={mode === 'h' ? `الساعة ${n}` : `${n} دقيقة`}
              style={[s.num, { left: x, top: y, backgroundColor: on ? t.ok : 'transparent' }]}>
              <T w={on ? 'numBold' : 'num'} style={{ fontSize: 15, color: on ? t.onOk : t.fg }}>{mode === 'h' ? String(n) : pad(n)}</T>
            </Pressable>
          );
        })}
      </View>

      {mode === 'm' ? (
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <Pressable onPress={() => onChange((value + 1440 - 1) % 1440)} accessibilityRole="button" accessibilityLabel="دقيقة أقل" style={[s.step, { backgroundColor: t.soft }]}>
            <Ionicons name="remove" size={20} color={t.fg} />
          </Pressable>
          <T style={{ fontSize: 12.5, color: t.mute }}>دقيقة</T>
          <Pressable onPress={() => onChange((value + 1) % 1440)} accessibilityRole="button" accessibilityLabel="دقيقة زيادة" style={[s.step, { backgroundColor: t.soft }]}>
            <Ionicons name="add" size={20} color={t.fg} />
          </Pressable>
        </View>
      ) : (
        <T style={{ fontSize: 12.5, color: t.mute }}>اختار الساعة، وبعدها الدقايق</T>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  read: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  seg: { minWidth: 72, height: 60, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  ampm: { width: 44, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  dial: { width: SIZE, height: SIZE, borderRadius: SIZE / 2 },
  hand: { position: 'absolute', width: 2, height: R, left: SIZE / 2 - 1, top: SIZE / 2 - R, transformOrigin: 'bottom' },
  center: { position: 'absolute', width: 8, height: 8, borderRadius: 4, left: SIZE / 2 - 4, top: SIZE / 2 - 4 },
  num: { position: 'absolute', width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  step: { width: 44, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
