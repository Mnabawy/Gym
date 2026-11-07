import React, { useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Ring, T } from './ui';
import { useTween } from '../lib/motion';
import { clean, cleanDays, longest, milestone, runLabel, target, type Quit } from '../lib/quit';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export const NIGHT = '#17122A';

/** The deep night card behind a quit: a soft glow of its color in the corner. */
export function NightCard({ color, children, style }: { color: string; children: React.ReactNode; style?: object }) {
  return (
    <View style={[s.card, style]}>
      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id="glow" cx="85" cy="10" r="90" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={color} stopOpacity="0.45" />
            <Stop offset="1" stopColor={color} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill="url(#glow)" />
      </Svg>
      {children}
    </View>
  );
}

const pad = (n: number) => String(n).padStart(2, '0');

/** The ring to your next milestone with the clean time inside; `big` adds the live d:h:m:s boxes under it. */
export function CleanRing({ q, now, size }: { q: Quit; now: number; size: number }) {
  const c = clean(q, now);
  const m = milestone(c.ms);
  const under = c.days < 1;
  return (
    <View style={{ borderRadius: size / 2, boxShadow: `0px 0px ${size / 6}px ${q.color}66` }}>
      <Ring value={m.share} size={size} stroke={Math.max(5, size / 18)} color={q.color} track="rgba(255,255,255,0.1)">
        <T w="numBold" style={{ color: '#FFFFFF', fontSize: size / 3.4, lineHeight: size / 2.9 }}>{under ? `${c.hours}` : String(c.days)}</T>
        <T w="semi" style={{ color: 'rgba(255,255,255,0.7)', fontSize: Math.max(11, size / 13) }}>{under ? 'ساعة' : c.days === 1 ? 'يوم' : 'يوم نضيف'}</T>
      </Ring>
    </View>
  );
}

export function Clock({ q, now }: { q: Quit; now: number }) {
  const c = clean(q, now);
  const box = (v: string, l: string) => (
    <View style={s.box}>
      <T w="numBold" style={{ color: '#FFFFFF', fontSize: 24 }}>{v}</T>
      <T style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11 }}>{l}</T>
    </View>
  );
  return (
    <View style={{ flexDirection: 'row', gap: 8, direction: 'ltr' }}>
      {box(String(c.days), 'يوم')}
      {box(pad(c.hours), 'ساعة')}
      {box(pad(c.minutes), 'دقيقة')}
      {box(pad(c.seconds), 'ثانية')}
    </View>
  );
}

/** "فاضل 2 يوم على أسبوع" */
export function nextLine(q: Quit, now: number): string {
  const c = clean(q, now);
  const m = milestone(c.ms);
  const left = m.next * 86400000 - c.ms;
  const name = m.next === 7 ? 'أسبوع' : m.next === 14 ? 'أسبوعين' : m.next === 30 ? 'شهر' : m.next === 60 ? 'شهرين' : m.next === 90 ? '3 شهور' : m.next === 180 ? '6 شهور' : m.next % 365 === 0 ? `${m.next / 365 === 1 ? 'سنة' : `${m.next / 365} سنين`}` : `${m.next} يوم`;
  return `فاضل ${runLabel(left)} على ${name}`;
}

function Stat({ icon, label }: { icon: IconName; label: string }) {
  return (
    <View style={s.stat}>
      <Ionicons name={icon} size={13} color="rgba(255,255,255,0.75)" />
      <T w="semi" style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12 }} numberOfLines={1}>{label}</T>
    </View>
  );
}

/** One bad habit on the بطّل list: a modern night card — glassy icon, clean-time ring, a target bar, and the urge button. */
export function QuitCard({ q, now, onOpen, onUrge }: { q: Quit; now: number; onOpen: () => void; onUrge: () => void }) {
  const tg = target(q, now);
  const d = cleanDays(q, now);
  const best = longest(q, now);
  const [scale] = useState(() => new Animated.Value(1));
  const spring = (to: number) => Animated.spring(scale, { toValue: to, useNativeDriver: true, speed: 50, bounciness: 3 }).start();
  const bar = useTween(Math.max(0.015, tg.share), 500);
  const gold = tg.done;

  return (
    <NightCard color={q.color} style={{ gap: 15 }}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <Pressable
          onPress={onOpen}
          onPressIn={() => spring(0.97)}
          onPressOut={() => spring(1)}
          accessibilityRole="button"
          accessibilityLabel={q.password ? 'عادة محمية' : q.name}
          style={{ gap: 15 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
            <View style={[s.badge, { backgroundColor: `${q.color}26`, borderColor: `${q.color}66` }]}>
              <Ionicons name={q.icon as IconName} size={21} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1, gap: 1 }}>
              {!q.password ? <T w="bold" style={{ color: '#FFFFFF', fontSize: 16 }} numberOfLines={1}>{q.name}</T> : null}
              <T style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12.5 }} numberOfLines={1}>{nextLine(q, now)}</T>
            </View>
            {q.password ? <Ionicons name="lock-closed" size={14} color="rgba(255,255,255,0.4)" /> : null}
            <Ionicons name="chevron-back" size={18} color="rgba(255,255,255,0.4)" />
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <CleanRing q={q} now={now} size={98} />
            <View style={{ flex: 1, gap: 11 }}>
              <View style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <T style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>{gold ? 'وصلت هدفك' : `هدفك ${q.targetDays} يوم`}</T>
                  <T w="numBold" style={{ color: gold ? '#FFD700' : '#FFFFFF', fontSize: 12.5 }}>{gold ? '🎉' : `فاضل ${tg.left}`}</T>
                </View>
                <View style={s.track}>
                  <Animated.View style={{ height: '100%', borderRadius: 4, backgroundColor: gold ? '#FFD700' : q.color, width: bar.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }), boxShadow: `0px 0px 10px ${gold ? '#FFD700' : q.color}` }} />
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Stat icon="trophy" label={runLabel(best)} />
                <Stat icon="calendar" label={`${Math.round(d.rate * 100)}% نضيف`} />
              </View>
            </View>
          </View>
        </Pressable>
      </Animated.View>

      <Pressable onPress={onUrge} accessibilityRole="button" accessibilityLabel="جالي إلحاح" style={({ pressed }) => [s.urge, { backgroundColor: q.color, boxShadow: `0px 2px 20px ${q.color}99`, opacity: pressed ? 0.85 : 1 }]}>
        <Ionicons name="pulse" size={18} color="#FFFFFF" />
        <T w="bold" style={{ color: '#FFFFFF', fontSize: 15 }}>جالي إلحاح</T>
      </Pressable>
    </NightCard>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: 28, overflow: 'hidden', padding: 18, backgroundColor: NIGHT },
  box: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.08)' },
  badge: { width: 42, height: 42, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  track: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.14)', overflow: 'hidden' },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 10, paddingVertical: 5, paddingHorizontal: 9 },
  urge: { flexDirection: 'row', gap: 8, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
