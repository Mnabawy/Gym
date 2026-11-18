// Geometry of the floating tab bar (src/components/TabBar.tsx) and the room pages leave for it. Kept apart from the
// bar so `Screen` (ui.tsx) can read it without importing the bar.
import { createContext, useContext } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const BAR_H = 64;

/** Gap between the bar and the bottom edge: the system navigation bar, at least 12pt (rounded screen corners). */
export function useBarBottom(): number {
  const inset = useSafeAreaInsets();
  return Math.max(inset.bottom, 12) + 4;
}

const Space = createContext(0);

/** Room a page needs at its bottom so nothing ends up under the floating bar (0 outside the tabs). */
export const useTabBarSpace = () => useContext(Space);

/** Wraps the tabs navigator: its pages get the bar's room from useTabBarSpace(). */
export function TabBarSpace({ children }: { children: React.ReactNode }) {
  const bottom = useBarBottom();
  return <Space.Provider value={bottom + BAR_H + 8}>{children}</Space.Provider>;
}
