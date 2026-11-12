import React, { useEffect, useState } from 'react';
import { Animated, Keyboard, KeyboardAvoidingView, LayoutAnimation, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextProps, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Svg, { Circle } from 'react-native-svg';
import Ionicons from '@expo/vector-icons/Ionicons';
import { F, font, glow, tint, useTheme } from '../theme';
import { usePop, useTween } from '../lib/motion';
import { Fade, Press } from './Motion';
import { TAG_INFO } from '../data/rules';
import type { Tag } from '../data/program';

/** Whether the keyboard is up (Android and iOS), e.g. to drop a footer's bottom inset while it is. */
export function useKeyboardShown(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const a = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setOn(true));
    const b = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setOn(false));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);
  return on;
}

/**
 * Put first in every TextInput's style. Android pads a text field's text box and font; with the system font that cut
 * the Arabic text off while typing in 44pt fields. Explicit paddingTop (multiline fields) still wins over this.
 */
export const INPUT: TextStyle = Platform.OS === 'android' ? { paddingVertical: 0, includeFontPadding: false, textAlignVertical: 'center' } : {};

/** App-wide text size: screens write sizes at full scale and every T draws them this much smaller (the user wants a small font everywhere). */
export const TEXT_SCALE = 0.9;

export function T({ style, w = 'body', ...p }: TextProps & { w?: keyof typeof F }) {
  const t = useTheme();
  const flat = StyleSheet.flatten([{ color: t.fg, fontSize: 15 }, font(w), style]) ?? {};
  const size = { fontSize: (flat.fontSize ?? 15) * TEXT_SCALE, ...(flat.lineHeight ? { lineHeight: flat.lineHeight * TEXT_SCALE } : null) };
  // The phone's text-size setting still applies, capped so a big system font doesn't blow up the compact layout.
  return <Text maxFontSizeMultiplier={1.15} {...p} style={[flat, size]} />;
}

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Round 44pt header button (back, settings). */
export function HeaderBtn({ icon, label, onPress, style, color }: { icon: IconName; label: string; onPress: () => void; style?: ViewStyle; color?: string }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [s.round, { opacity: pressed ? 0.35 : 1 }, style]}>
      <Ionicons name={icon} size={24} color={color ?? t.ok} />
    </Pressable>
  );
}

/** `action` sits at the end of the header (left in RTL), opposite the back button. */
/** `dense`: tighter gaps and side padding (the workout tab). */
/** Page with a header: back button (if any) and the title at the start (right), the page's buttons at the end (left). */
/** `aside`: small extra shown on the same line right after the title (e.g. the to-do page's date and count). */
export function Screen({ title, sub, children, footer, onBack, action, dense, aside, header }: { title: string; sub?: string; children: React.ReactNode; footer?: React.ReactNode; onBack?: () => void; action?: React.ReactNode; dense?: boolean; aside?: React.ReactNode; header?: React.ReactNode }) {
  const t = useTheme();
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: t.bg }}>
      {/* The app draws edge to edge, so Android doesn't shrink the screen for the keyboard: this lifts the page and its
          footer (e.g. the to-do quick-add bar) above it, on both phones. */}
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={[s.scroll, dense ? s.dense : null]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {/* A page can draw its own header instead (the to-do page). */}
        {header ?? <View style={s.head}>
          {/* RTL: back sits at the start (right) and points right. */}
          {onBack ? <HeaderBtn icon="chevron-forward" label="رجوع" onPress={onBack} /> : null}
          <View style={s.titles}>
            {aside ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: '100%' }}>
                <T w="bold" style={{ fontSize: 24, lineHeight: 32 }} numberOfLines={1}>{title}</T>
                {aside}
              </View>
            ) : (
              <T w="bold" style={{ fontSize: 24, lineHeight: 32 }} numberOfLines={1}>{title}</T>
            )}
            {sub ? <T style={{ color: t.mute, fontSize: 13 }} numberOfLines={2}>{sub}</T> : null}
          </View>
          {action}
        </View>}
        <Fade style={{ gap: dense ? 6 : 8 }}>{children}</Fade>
      </ScrollView>
      {footer}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[{ backgroundColor: t.card, borderRadius: 12 }, style]}>{children}</View>;
}

/** Small muted heading above a group of content. */
export function Label({ children, color }: { children: React.ReactNode; color?: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, paddingHorizontal: 16 }}>
      {color ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} /> : null}
      {/* flexGrow: on Android a shrink-wrapped Arabic label can measure a hair too narrow and lose its last word. */}
      <T style={{ color: t.mute, fontSize: 13, flexGrow: 1, flexShrink: 1 }}>{children}</T>
    </View>
  );
}

/** Small popup with a title and a short explanation (tags, tips). Tap anywhere or "تمام" to close. */
export function InfoPopup({ visible, onClose, title, body }: { visible: boolean; onClose: () => void; title: React.ReactNode; body: string }) {
  const t = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={s.popBack}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="قفل" />
        <View accessibilityViewIsModal style={[s.pop, { backgroundColor: t.card, boxShadow: '0px 10px 30px rgba(0, 0, 0, 0.18)' }]}>
          <View style={{ alignItems: 'flex-start' }}>{title}</View>
          <T style={{ fontSize: 15, lineHeight: 25 }}>{body}</T>
          <Btn label="تمام" kind="solid" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

/** Popup with a title, a close button and any content (swap list, plates, notes, backups). Tap outside to close. */
export function Sheet({ visible, onClose, title, sub, children }: { visible: boolean; onClose: () => void; title: string; sub?: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      {/* Modals are their own window on Android: swipe rows inside need their own gesture root. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardAvoidingView behavior="padding" style={s.popBack}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="قفل" />
        <View accessibilityViewIsModal style={[s.pop, { backgroundColor: t.card, boxShadow: '0px 10px 30px rgba(0, 0, 0, 0.18)', maxHeight: '88%' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <T w="bold" style={{ fontSize: 16 }}>{title}</T>
              {sub ? <T style={{ color: t.mute, fontSize: 12.5, lineHeight: 19 }}>{sub}</T> : null}
            </View>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="قفل" style={({ pressed }) => ({ width: 32, height: 32, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
              <Ionicons name="close" size={22} color={t.mute} />
            </Pressable>
          </View>
          <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ gap: 8, paddingBottom: 4 }} keyboardShouldPersistTaps="handled" nestedScrollEnabled showsVerticalScrollIndicator>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

/** Technique tag (تقيل / فشل / دروب). Tapping it explains what to do; pass `info={false}` for a plain label. */
export function TagBadge({ tag, info = true }: { tag: Tag; info?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!tag) return null;
  const badge = <TagLabel tag={tag} />;
  if (!info) return badge;
  return (
    <>
      <Pressable onPress={() => setOpen(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`${TAG_INFO[tag].label}، اعرف المطلوب`} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
        {badge}
      </Pressable>
      <InfoPopup visible={open} onClose={() => setOpen(false)} title={<TagLabel tag={tag} />} body={TAG_INFO[tag].long} />
    </>
  );
}

function TagLabel({ tag }: { tag: Exclude<Tag, null> }) {
  const t = useTheme();
  const filled = tag === 'heavy';
  const c = t.tag[tag];
  return (
    <View
      style={{
        borderRadius: 999,
        paddingHorizontal: 9,
        paddingVertical: 1,
        backgroundColor: filled ? c : 'transparent',
        borderWidth: filled ? 0 : 1.5,
        borderColor: c,
        borderStyle: tag === 'drop' ? 'dashed' : 'solid',
        boxShadow: glow(t, c, 8),
      }}>
      <T w="semi" style={{ fontSize: 12, color: filled ? (t.neon ? t.bg : t.onInk) : c }}>{TAG_INFO[tag].label}</T>
    </View>
  );
}

/** Rounded pill: slate-navy when selected, soft grey otherwise. `color` adds a dot (muscle). */
export function Pill({ label, on, onPress, num, color }: { label: string; on: boolean; onPress: () => void; num?: boolean; color?: string }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      hitSlop={4}
      onPress={onPress}
      style={{ minHeight: 32, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, backgroundColor: on ? t.ok : t.soft }}>
      {color ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, borderWidth: on ? 1 : 0, borderColor: t.onOk }} /> : null}
      <T w={num ? 'num' : 'medium'} style={{ fontSize: 13, color: on ? t.onOk : t.fg }}>{label}</T>
    </Pressable>
  );
}

/** Tinted pill with a color dot (muscle or food type). */
export function ColorChip({ label, color, size = 13 }: { label: string; color: string; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: tint(color, 0.15), borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2 }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
      <T style={{ fontSize: size }}>{label}</T>
    </View>
  );
}

/** `short` is the one-letter name shown when the chip isn't selected; `details` is the color legend shown when it is. */
export type DayChip = { key: number; label: string; short: string; colors: string[]; details: { color?: string; label: string }[] };
/** `dense`: one-line legend and a shorter row (the workout tab). */
export function DayChips({ days, value, today, onChange, dense }: { days: DayChip[]; value: number; today: number; onChange: (k: number) => void; dense?: boolean }) {
  const t = useTheme();
  const pick = (k: number) => {
    if (k === value) return;
    LayoutAnimation.configureNext(LayoutAnimation.create(180, 'easeInEaseOut', 'opacity'));
    onChange(k);
  };
  return (
    <View style={[s.chips, dense ? { minHeight: 54 } : null]}>
      {days.map((d) => {
        const on = d.key === value;
        const isToday = d.key === today;
        return (
          <Pressable
            key={d.key}
            accessibilityRole="button"
            accessibilityLabel={isToday ? `${d.label} · النهارده` : d.label}
            accessibilityState={{ selected: on }}
            hitSlop={2}
            onPress={() => pick(d.key)}
            style={[
              on ? s.chipOn : s.chipOff,
              { backgroundColor: on ? t.ink : t.soft },
              t.neon ? { borderWidth: 1, borderColor: on ? t.ok : t.border, boxShadow: on ? glow(t, t.ok, 12) : undefined } : null,
              dense && on ? { paddingVertical: 6 } : null,
            ]}>
            {on ? (
              <>
                <View style={s.chipHead}>
                  <T w="bold" style={{ fontSize: 14, color: t.onInk, flexShrink: 1 }} numberOfLines={1} adjustsFontSizeToFit>{d.label}</T>
                  {isToday ? <View style={[s.todayDot, { backgroundColor: t.ok, borderColor: t.onInk }]} /> : null}
                </View>
                <View style={dense ? { flexDirection: 'row', gap: 10 } : { gap: 4 }}>
                  {d.details.map((x, i) => (
                    <View key={i} style={[s.legendRow, dense ? { flexShrink: 1 } : null]}>
                      {x.color ? <View style={[s.legendDot, { backgroundColor: x.color }]} /> : null}
                      <T style={{ fontSize: 11, color: t.onInk, opacity: x.color ? 0.92 : 0.7, flexShrink: 1 }} numberOfLines={1} adjustsFontSizeToFit>{x.label}</T>
                    </View>
                  ))}
                </View>
              </>
            ) : (
              <>
                <T w="semi" style={{ fontSize: 15, lineHeight: 22, color: t.fg }}>{d.short}</T>
                <View style={[s.bar, { backgroundColor: t.line }]}>
                  {d.colors.map((c, i) => (
                    <View key={i} style={{ flex: 1, backgroundColor: c }} />
                  ))}
                </View>
                {isToday ? <View style={[s.todayDot, s.todayCorner, { backgroundColor: t.ok, borderColor: t.soft }]} /> : null}
              </>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Bar that grows smoothly to `value` (0–1). */
export function Progress({ value, color, height = 6, track }: { value: number; color?: string; height?: number; track?: string }) {
  const t = useTheme();
  const v = useTween(clamp01(value), 380);
  return (
    <View style={{ height, backgroundColor: track ?? t.soft, borderRadius: height / 2, overflow: 'hidden' }}>
      <Animated.View style={{ width: v.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }), height: '100%', borderRadius: height / 2, backgroundColor: color ?? t.ok, boxShadow: glow(t, color ?? t.ok, 6) }} />
    </View>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const web = Platform.OS === 'web';

/** Current number of an Animated.Value as state (web: SVG props can't take animated values there). */
function useFrames(v: Animated.Value, on: boolean, start: number): number {
  const [n, setN] = useState(start);
  useEffect(() => {
    if (!on) return;
    const id = v.addListener(({ value }) => setN(value));
    return () => v.removeListener(id);
  }, [v, on]);
  return n;
}

/** Circular progress; children render in the middle. It sweeps to a new value unless `animated` is false (the rest timer ticks on its own). */
export function Ring({ value, size = 60, stroke = 5, color, track, children, animated = true }: { value: number; size?: number; stroke?: number; color?: string; track?: string; children?: React.ReactNode; animated?: boolean }) {
  const t = useTheme();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = clamp01(value);
  const tw = useTween(v, 600);
  const frame = useFrames(tw, animated && web, v);
  if (animated && web)
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={track ?? t.soft} strokeWidth={stroke} fill="none" />
          {frame > 0.004 ? (
            <Circle cx={size / 2} cy={size / 2} r={r} stroke={color ?? t.ok} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${c} ${c}`} strokeDashoffset={c * (1 - frame)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
          ) : null}
        </Svg>
        {children}
      </View>
    );
  if (animated)
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={track ?? t.soft} strokeWidth={stroke} fill="none" />
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color ?? t.ok}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${c} ${c}`}
            strokeDashoffset={tw.interpolate({ inputRange: [0, 1], outputRange: [c, 0] })}
            opacity={tw.interpolate({ inputRange: [0, 0.004, 1], outputRange: [0, 1, 1] })}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
        {children}
      </View>
    );
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track ?? t.soft} strokeWidth={stroke} fill="none" />
        {v > 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color ?? t.ok}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${c} ${c}`}
            strokeDashoffset={c * (1 - v)}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </Svg>
      {children}
    </View>
  );
}

/** The app's one button size: 40pt tall (44pt touch target with hitSlop), one line of 14pt text that shrinks to fit. */
/** `danger`: every delete button — red text on a soft red (`dangerSolid`: white on red, for the last step of a wipe). */
export function Btn({ label, onPress, kind = 'ghost', style }: { label: string; onPress: () => void; kind?: 'ghost' | 'solid' | 'danger' | 'dangerSolid'; style?: ViewStyle }) {
  const t = useTheme();
  const bg = kind === 'solid' ? t.ok : kind === 'danger' ? tint(t.bad, 0.12) : kind === 'dangerSolid' ? t.bad : t.okSoft;
  const fg = kind === 'solid' ? t.onOk : kind === 'danger' ? t.bad : kind === 'dangerSolid' ? '#FFFFFF' : t.okText;
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={{ top: 2, bottom: 2 }}
      scale={0.96}
      // iOS: filled (tint) or tinted (soft tint behind tint text); shrinks a little under the finger.
      style={[s.btn, { backgroundColor: bg }, style]}>
      <T w="semi" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={{ fontSize: 15, color: fg }}>
        {label}
      </T>
    </Press>
  );
}

/** Check button used for sets and meals. Ticking it pops and fills with color. */
export function Check({ on, onPress, label, compact }: { on: boolean; onPress: () => void; label: string; compact?: boolean }) {
  const t = useTheme();
  const fill = useTween(on ? 1 : 0, 180, true);
  const pop = usePop(on, on ? 0.8 : 0.92);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      hitSlop={compact ? 5 : 0}
      style={compact ? { width: 42, height: 36 } : { width: 48, height: 44 }}>
      <Animated.View style={[s.check, { backgroundColor: t.soft, transform: [{ scale: pop }], boxShadow: on ? glow(t, t.ok, 12) : undefined }]}>
        <T w="bold" style={{ color: t.mute, fontSize: 18 }}>✓</T>
        <Animated.View style={[s.check, StyleSheet.absoluteFill, { backgroundColor: t.ok, opacity: fill }]}>
          <T w="bold" style={{ color: t.onOk, fontSize: 18 }}>✓</T>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

/** − value + counter. Buttons dim at the limits. */
export function Stepper({ value, min, max, step = 1, onChange, label, format, compact }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; label: string; format?: (v: number) => string; compact?: boolean }) {
  const t = useTheme();
  const pop = usePop(value, 0.8);
  const btn = (dir: -1 | 1) => {
    const off = dir < 0 ? value <= min : value >= max;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${dir > 0 ? 'زوّد' : 'قلّل'} ${label}`}
        accessibilityState={{ disabled: off }}
        disabled={off}
        hitSlop={compact ? 7 : 4}
        onPress={() => onChange(Math.min(max, Math.max(min, value + dir * step)))}
        style={({ pressed }) => [s.stepBtn, compact ? s.stepBtnSm : null, { backgroundColor: t.soft, opacity: off ? 0.35 : pressed ? 0.7 : 1 }]}>
        <Ionicons name={dir > 0 ? 'add' : 'remove'} size={compact ? 17 : 20} color={t.fg} />
      </Pressable>
    );
  };
  return (
    <View style={s.stepper}>
      {btn(-1)}
      <Animated.View style={{ transform: [{ scale: pop }] }}>
        <T w="numBold" style={{ minWidth: compact ? 40 : 46, textAlign: 'center', fontSize: compact ? 14 : 16 }} accessibilityLabel={`${label}: ${format ? format(value) : value}`}>
          {`\u2066${format ? format(value) : value}\u2069`}
        </T>
      </Animated.View>
      {btn(1)}
    </View>
  );
}

/** Settings row with a switch. The whole row is the touch target; the switch is just the picture (drawn by hand: RN Web's Switch breaks in RTL). */
export function SwitchRow({ label, sub, value, onChange, disabled }: { label: string; sub?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={sub}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={[s.row, { opacity: disabled ? 0.45 : 1 }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <T w="medium">{label}</T>
        {sub ? <T style={{ color: t.mute, fontSize: 12.5, lineHeight: 19 }}>{sub}</T> : null}
      </View>
      {/* RTL: off = thumb at the start (right), on = end (left), like the system switch. */}
      <View
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={[s.track, { backgroundColor: value ? t.green : t.soft, alignItems: value ? 'flex-end' : 'flex-start' }]}>
        <View style={s.thumb} />
      </View>
    </Pressable>
  );
}

/** Settings row: label (+ hint) at the start, any control at the end. */
export function Row({ label, sub, children }: { label: string; sub?: string; children?: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={s.row}>
      <View style={{ flex: 1, gap: 2 }}>
        <T w="medium">{label}</T>
        {sub ? <T style={{ color: t.mute, fontSize: 12.5, lineHeight: 19 }}>{sub}</T> : null}
      </View>
      {children}
    </View>
  );
}

/**
 * Two-way switch with both labels (خاص / شغل, الصباح / المساء), small enough to sit next to a page title: the white
 * knob fades onto the side that's on; a tap anywhere flips it.
 */
export function MiniSwitch<K extends string>({ options, value, onChange, label }: { options: readonly [readonly [K, string], readonly [K, string]]; value: K; onChange: (k: K) => void; label: string }) {
  const t = useTheme();
  const second = value === options[1][0];
  const cur = options.find((o) => o[0] === value)?.[1] ?? '';
  return (
    <Pressable
      onPress={() => onChange(second ? options[0][0] : options[1][0])}
      hitSlop={8}
      accessibilityRole="switch"
      accessibilityState={{ checked: second }}
      accessibilityLabel={`${label}: ${cur}`}
      accessibilityHint={`دوس تبدّل بين ${options[0][1]} و${options[1][1]}`}
      style={[s.mini, { backgroundColor: t.segBar }]}>
      {options.map(([k, l]) => (
        <MiniHalf key={k} label={l} on={value === k} />
      ))}
    </Pressable>
  );
}

function MiniHalf({ label, on }: { label: string; on: boolean }) {
  const t = useTheme();
  const v = useTween(on ? 1 : 0, 180, true);
  return (
    <View style={s.miniHalf}>
      <Animated.View style={[StyleSheet.absoluteFill, s.miniKnob, { backgroundColor: t.segOn, opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] }]} />
      <T w={on ? 'semi' : 'medium'} numberOfLines={1} style={{ fontSize: 12.5, color: on ? t.fg : t.mute }}>{label}</T>
    </View>
  );
}

/** Hairline between rows inside a Card. */
export function Sep() {
  const t = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.line, marginStart: 16 }} />;
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

const s = StyleSheet.create({
  mini: { flexDirection: 'row', height: 30, borderRadius: 15, padding: 2 },
  miniHalf: { minWidth: 44, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  miniKnob: { borderRadius: 13, boxShadow: '0px 1px 3px rgba(0,0,0,0.15)' },
  scroll: { paddingHorizontal: 16, paddingTop: 2, paddingBottom: 120, gap: 8, maxWidth: 620, width: '100%', alignSelf: 'center' },
  dense: { paddingHorizontal: 12, gap: 6 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingBottom: 2, minHeight: 44 },
  titles: { flex: 1, minWidth: 0, alignItems: 'flex-start' },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  track: { width: 51, height: 31, borderRadius: 16, padding: 2, justifyContent: 'center' },
  thumb: { width: 27, height: 27, borderRadius: 14, backgroundColor: '#FFFFFF', boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.25)' },
  check: { flex: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  popBack: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.4)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  pop: { width: '100%', maxWidth: 380, borderRadius: 14, padding: 16, gap: 10 },
  btn: { height: 40, paddingHorizontal: 14, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepBtn: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  stepBtnSm: { width: 30, height: 30, borderRadius: 9 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 16, paddingVertical: 8 },
  // Inactive chips are 40pt wide + 2pt hitSlop each side = 44pt touch target; the selected chip takes the rest.
  chips: { flexDirection: 'row', gap: 4, minHeight: 72 }, // fits name + 2 legend lines, so the row doesn't jump between days
  chipOff: { width: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 6 },
  chipOn: { flex: 1, minWidth: 0, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 8, justifyContent: 'center', gap: 4 },
  chipHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  todayDot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1.5 },
  todayCorner: { position: 'absolute', top: 5, end: 5 },
  bar: { flexDirection: 'row', width: 20, height: 4, borderRadius: 2, overflow: 'hidden' },
});
