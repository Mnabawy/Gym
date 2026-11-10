import { createContext, useContext, useMemo } from 'react';
import { Platform, useColorScheme, type TextStyle } from 'react-native';
import type { Muscle } from '../data/program';
import { accentTokens } from '../lib/color';
import { useSettings } from '../lib/settings';

// Style: Apple's own apps (iOS system colors, UIColor semantic colors). Grey grouped background, white cards with no
// shadow, black text, grey secondary text and one tint (your app color, system blue by default) for what you tap.
const light = {
  bg: '#F2F2F7', // systemGroupedBackground
  card: '#FFFFFF', // secondarySystemGroupedBackground
  fg: '#000000', // label
  mute: '#8A8A8E', // secondaryLabel on white
  line: '#C6C6C8', // opaqueSeparator
  soft: '#EEEEF0', // tertiarySystemFill on white
  ink: '#1C1C1E',
  onInk: '#FFFFFF',
  ok: '#007AFF', // systemBlue (replaced by settings accent)
  onOk: '#FFFFFF',
  okText: '#007AFF',
  okSoft: '#E5F1FF',
  warn: '#C93400', // systemOrange, darkened for text
  warnSoft: '#FFF2E0',
  bad: '#FF3B30', // systemRed — missing input (a set ticked without weight or reps)
  green: '#34C759', // systemGreen — switches
  shadow: '0px 0px 0px rgba(0, 0, 0, 0)',
  /** Bordered look (old warm pages): off everywhere now. */
  neon: false,
  border: 'transparent',
  /** iOS segmented control: the track and the selected segment (white on grey in light, grey on near-black in dark). */
  segBar: 'rgba(118, 118, 128, 0.12)',
  segOn: '#FFFFFF',
  /** One color per section (iOS system colors), used sparingly (icons, rings). */
  sec: { gym: '#007AFF', habits: '#FF2D55', goals: '#34C759', quit: '#5856D6', tasks: '#FF3B30', focus: '#FF9500' },
  tag: { heavy: '#1C1C1E', fail: '#1C1C1E', drop: '#1C1C1E' },
  protein: '#007AFF',
  carbs: '#FF9500',
  carbsText: '#C93400',
  fat: '#34C759',
  veg: '#8E8E93',
  muscle: {
    chest: '#0072B2',
    shoulders: '#3A9FD9',
    triceps: '#C2669B',
    back: '#D55E00',
    biceps: '#D98E00',
    quads: '#009E73',
    hams: '#B9A200',
    calves: '#7A8290',
  } as Record<Muscle, string>,
};

const dark: typeof light = {
  bg: '#000000',
  card: '#1C1C1E',
  fg: '#FFFFFF',
  mute: '#8D8D93',
  line: '#38383A',
  soft: '#2C2C2E',
  ink: '#E5E5EA',
  onInk: '#000000',
  ok: '#0A84FF',
  onOk: '#FFFFFF',
  okText: '#0A84FF',
  okSoft: '#0A2A4D',
  warn: '#FF9F0A',
  warnSoft: '#3A2A10',
  bad: '#FF453A',
  green: '#30D158',
  shadow: '0px 0px 0px rgba(0, 0, 0, 0)',
  neon: false,
  border: 'transparent',
  segBar: 'rgba(118, 118, 128, 0.24)',
  segOn: '#636366',
  sec: { gym: '#0A84FF', habits: '#FF375F', goals: '#30D158', quit: '#5E5CE6', tasks: '#FF453A', focus: '#FF9F0A' },
  tag: { heavy: '#E5E5EA', fail: '#E5E5EA', drop: '#E5E5EA' },
  protein: '#0A84FF',
  carbs: '#FF9F0A',
  carbsText: '#FF9F0A',
  fat: '#30D158',
  veg: '#98989D',
  muscle: {
    chest: '#3FA3E0',
    shoulders: '#7CC6F0',
    triceps: '#E08CC0',
    back: '#F07C3A',
    biceps: '#F0B23A',
    quads: '#2FC496',
    hams: '#D9C640',
    calves: '#9AA3AE',
  },
};

export type Theme = typeof light;

/** The old warm look (habits, goals, quit, welcome) is the same Apple look now; the names stay for those pages. */
export const warm: Theme = light;
export const warmDark: Theme = dark;

/** The warm theme that follows the phone's light or dark setting. */
export function useWarm(): Theme {
  return useColorScheme() === 'dark' ? warmDark : warm;
}

/** Screens can force a theme for everything inside them (the warm pages, the welcome screen). */
const Forced = createContext<Theme | null>(null);
export const ThemeProvider = Forced.Provider;

export function useTheme(): Theme {
  const forced = useContext(Forced);
  const scheme = useColorScheme();
  const accent = useSettings((s) => s.accent);
  const base = forced ?? (scheme === 'dark' ? dark : light);
  // System blue is a touch lighter in dark mode, like iOS.
  const hex = accent === '#007AFF' && base.bg === dark.bg ? '#0A84FF' : accent;
  return useMemo(() => (hex ? { ...base, ...accentTokens(hex, base.bg) } : base), [base, hex]);
}

/** Glow around something in `color` — only in the bordered (warm) look. */
export const glow = (t: Theme, color: string, r = 10): string | undefined => (t.neon ? `0px 0px ${r}px ${tint(color, 0.6)}` : undefined);

/** Apple's font: the system font (SF Pro + SF Arabic on iPhone, Roboto + Noto on Android), weights by name. */
const SYS = Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' }) as string;
export const F = {
  body: SYS,
  medium: SYS,
  semi: SYS,
  bold: SYS,
  num: SYS,
  numBold: SYS,
  numRegular: SYS,
  quran: 'AmiriQuran_400Regular',
};
const W = { body: '400', medium: '500', semi: '600', bold: '700', num: '600', numBold: '700', numRegular: '400', quran: '400' } as const;

/** fontFamily + fontWeight (+ even-width digits for the number styles) for a text style. */
export function font(w: keyof typeof F): TextStyle {
  return { fontFamily: F[w], fontWeight: W[w], ...(w.startsWith('num') ? { fontVariant: ['tabular-nums'] } : null) };
}

/** Mix a hex color with the background for tinted fills. */
export function tint(hex: string, alpha: number): string {
  const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
  return hex + a;
}
