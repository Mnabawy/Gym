import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Ring, T } from './ui';
import { clean, milestone, runLabel, type Quit } from '../lib/quit';

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

const s = StyleSheet.create({
  card: { borderRadius: 28, overflow: 'hidden', padding: 18, backgroundColor: NIGHT },
  box: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.08)' },
});
