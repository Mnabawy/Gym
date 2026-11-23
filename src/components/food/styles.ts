import { StyleSheet } from 'react-native';
import type { Theme } from '../../theme';

/** Food chip colors: protein blue, carbs orange, fat green, veg grey. */
export const typeColor = (t: Theme, ty: string) => (ty === 'p' ? t.protein : ty === 'c' ? t.carbs : ty === 'f' ? t.fat : t.veg);

/** Shared styles of the food tab's cards and sheets. */
export const fs = StyleSheet.create({
  item: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  swipeCard: { borderRadius: 12, overflow: 'hidden' },
  swipeRow: { marginHorizontal: -12 },
  rowPad: { paddingHorizontal: 12 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  wbtn: { width: 36, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  input: { height: 44, borderRadius: 12, paddingHorizontal: 12, fontSize: 15, outlineWidth: 0 },
  wadd: { height: 32, borderRadius: 10, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  swap: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, minHeight: 48 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
});
