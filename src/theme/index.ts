import { createContext, useContext } from 'react';
import { useColorScheme } from 'react-native';
import type { Muscle } from '../data/program';

// Style: teal accent (ok), slate-navy for selected/emphasis (ink), soft borderless cards with a light shadow.
const light = {
  bg: '#F3F6F9',
  card: '#FFFFFF',
  fg: '#1E2833',
  mute: '#687B90',
  line: '#E3E9EF',
  soft: '#EEF2F6',
  ink: '#3E5A76',
  onInk: '#FFFFFF',
  ok: '#1BA6A8',
  onOk: '#FFFFFF',
  okText: '#0B7F82',
  okSoft: '#DCF3F3',
  warn: '#A35F00',
  warnSoft: '#FFF0DC',
  bad: '#C62828', // missing input (a set ticked without weight or reps)
  shadow: '0px 3px 14px rgba(30, 50, 70, 0.08)',
  /** Neon theme only: thin borders and glows instead of soft shadows. */
  neon: false,
  border: 'transparent',
  /** One color per section (أقسامك): the hub, and the habits and goals pages. */
  sec: { gym: '#0072B2', habits: '#CC79A7', goals: '#009E73' },
  tag: { heavy: '#3E5A76', fail: '#3E5A76', drop: '#3E5A76' },
  protein: '#0072B2',
  carbs: '#E69F00',
  carbsText: '#A86F00',
  fat: '#009E73',
  veg: '#8A939E',
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
  bg: '#0E1318',
  card: '#171E26',
  fg: '#E6ECF1',
  mute: '#94A5B6',
  line: '#25303B',
  soft: '#1F2832',
  ink: '#557797',
  onInk: '#FFFFFF',
  ok: '#2BC0C2',
  onOk: '#0E1318',
  okText: '#4DD2D4',
  okSoft: '#113437',
  warn: '#F2B04A',
  warnSoft: '#3A2C12',
  bad: '#FF6B6B',
  shadow: '0px 3px 14px rgba(0, 0, 0, 0.35)',
  neon: false,
  border: 'transparent',
  sec: { gym: '#3FA3E0', habits: '#E08CC0', goals: '#2FC496' },
  tag: { heavy: '#557797', fail: '#557797', drop: '#557797' },
  protein: '#3FA3E0',
  carbs: '#F0B23A',
  carbsText: '#F0B23A',
  fat: '#2FC496',
  veg: '#9AA3AE',
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

/**
 * Neon: near-black surfaces, thin cyan-tinted borders, glowing accents. Used by the workout tab only
 * (docs/mockups/workout-neon.html). Muscle hues follow the Okabe–Ito order, brightened to read on black.
 */
export const neon: Theme = {
  ...dark,
  bg: '#05070C',
  card: '#0C111C',
  fg: '#E9F1FF',
  mute: '#7D8AA3',
  line: '#17202F',
  soft: '#121A2A',
  ink: '#0F1828',
  onInk: '#E9F1FF',
  ok: '#22F3E4',
  onOk: '#001614',
  okText: '#22F3E4',
  okSoft: '#0E2A2E',
  warn: '#FFB020',
  warnSoft: '#2A2210',
  bad: '#FF4D6D',
  shadow: '0px 0px 0px rgba(0, 0, 0, 0)',
  neon: true,
  border: '#1A2638',
  sec: { gym: '#3FB6FF', habits: '#FF6AD5', goals: '#3BFFB0' },
  tag: { heavy: '#FF7A1A', fail: '#FF3DCB', drop: '#B18CFF' },
  muscle: {
    chest: '#3FB6FF',
    shoulders: '#7FD8FF',
    triceps: '#FF6AD5',
    back: '#FF7A1A',
    biceps: '#FFC53D',
    quads: '#3BFFB0',
    hams: '#E6FF3B',
    calves: '#AAB4C3',
  },
};

/**
 * Warm: the sections, habits and goals pages. The neon layout (thin borders,
 * glowing rings and dots) in warm colors: cream and ink by day, warm black with a gold accent by night, and a soft
 * blue, pink and green for the gym, habits and goals.
 */
export const warm: Theme = {
  ...light,
  bg: '#F6F3EE',
  card: '#FFFDF9',
  fg: '#1F1D1A',
  mute: '#8C857A',
  line: '#ECE6DC',
  soft: '#F0EBE3',
  ink: '#1F1D1A',
  onInk: '#F6F3EE',
  ok: '#1F1D1A',
  onOk: '#F6F3EE',
  okText: '#1F1D1A',
  okSoft: '#EDE7DD',
  warn: '#A8660F',
  warnSoft: '#FBEFD5',
  shadow: '0px 4px 18px rgba(80, 60, 30, 0.07)',
  neon: true,
  border: '#E9E2D6',
  sec: { gym: '#5B7FE0', habits: '#E0609B', goals: '#3E9A68' },
};

export const warmDark: Theme = {
  ...dark,
  bg: '#14120F',
  card: '#1D1A16',
  fg: '#F3EEE6',
  mute: '#9B9387',
  line: '#2C2822',
  soft: '#26221D',
  ink: '#F3EEE6',
  onInk: '#14120F',
  ok: '#F2C14E',
  onOk: '#14120F',
  okText: '#F2C14E',
  okSoft: '#3A3120',
  warn: '#F2B04A',
  warnSoft: '#3A2C12',
  shadow: '0px 0px 0px rgba(0, 0, 0, 0)',
  neon: true,
  border: '#2E2A23',
  sec: { gym: '#8FA9FF', habits: '#FF8FC0', goals: '#7FD49C' },
};

/** The warm theme that follows the phone's light or dark setting. */
export function useWarm(): Theme {
  return useColorScheme() === 'dark' ? warmDark : warm;
}

/** Screens can force a theme for everything inside them (the workout tab uses `neon`). */
const Forced = createContext<Theme | null>(null);
export const ThemeProvider = Forced.Provider;

export function useTheme(): Theme {
  const forced = useContext(Forced);
  const scheme = useColorScheme();
  return forced ?? (scheme === 'dark' ? dark : light);
}

/** Glow around something in `color` — only in the neon theme. */
export const glow = (t: Theme, color: string, r = 10): string | undefined => (t.neon ? `0px 0px ${r}px ${tint(color, 0.6)}` : undefined);

export const F = {
  body: 'ReadexPro_400Regular',
  medium: 'ReadexPro_500Medium',
  semi: 'ReadexPro_600SemiBold',
  bold: 'ReadexPro_700Bold',
  num: 'Inter_600SemiBold',
  numBold: 'Inter_700Bold',
  numRegular: 'Inter_400Regular',
  quran: 'AmiriQuran_400Regular',
};

/** Mix a hex color with the background for tinted fills. */
export function tint(hex: string, alpha: number): string {
  const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
  return hex + a;
}
