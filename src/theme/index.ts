import { useColorScheme } from 'react-native';
import type { Muscle } from '../data/program';

const light = {
  bg: '#F4F5F7',
  card: '#FFFFFF',
  fg: '#14181F',
  mute: '#5E6875',
  line: '#E2E5EA',
  soft: '#EEF0F3',
  ink: '#14181F',
  onInk: '#FFFFFF',
  ok: '#0E8A5F',
  okSoft: '#DDF3EA',
  warn: '#A35F00',
  warnSoft: '#FFF1D9',
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
  bg: '#0F1216',
  card: '#181C22',
  fg: '#E9ECF0',
  mute: '#9AA4B1',
  line: '#2A3038',
  soft: '#20252C',
  ink: '#E9ECF0',
  onInk: '#0F1216',
  ok: '#3CC48F',
  okSoft: '#163A2C',
  warn: '#F2B04A',
  warnSoft: '#3A2C12',
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
export const useTheme = (): Theme => (useColorScheme() === 'dark' ? dark : light);

export const F = {
  body: 'ReadexPro_400Regular',
  medium: 'ReadexPro_500Medium',
  semi: 'ReadexPro_600SemiBold',
  bold: 'ReadexPro_700Bold',
  num: 'Inter_600SemiBold',
  numBold: 'Inter_700Bold',
  numRegular: 'Inter_400Regular',
};

/** Mix a hex color with the background for tinted fills. */
export function tint(hex: string, alpha: number): string {
  const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
  return hex + a;
}
