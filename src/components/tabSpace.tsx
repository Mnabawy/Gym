// Geometry of the floating tab bar (src/components/TabBar.tsx), the room pages leave for it, and whether it's hidden
// (it slides away while you scroll down and comes back when you scroll up). Kept apart from the bar so `Screen`
// (ui.tsx) can use it without importing the bar.
import { createContext, useContext, useRef } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

export const BAR_H = 64;
/** How far the bar (and what floats on it: the rest timer, the tasks + button) moves down to hide. */
export const BAR_SHIFT = BAR_H + 8;

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

/** Whether the bar is hidden right now (scrolled down). */
export const useBarHidden = create<{ hidden: boolean; set: (h: boolean) => void }>((set, get) => ({
  hidden: false,
  set: (h) => {
    if (get().hidden !== h) set({ hidden: h });
  },
}));

/** onScroll for a tab's page: down hides the bar, up (or near the top) shows it. Nothing outside the tabs. */
export function useHideOnScroll(on: boolean) {
  const last = useRef(0);
  return (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!on) return;
    const y = e.nativeEvent.contentOffset.y;
    const dy = y - last.current;
    last.current = y;
    const { set } = useBarHidden.getState();
    if (y < 24) set(false);
    else if (dy > 6) set(true);
    else if (dy < -6) set(false);
  };
}
