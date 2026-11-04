// Tiny change counters so screens re-read storage after a write.
import { create } from 'zustand';

type Bus = {
  /** Any write: screens re-read storage. */
  v: number;
  /** Writes that exercise cards can't know about (clearing a day, changing the plan): cards remount and re-read. */
  cards: number;
  /** A card's own write (a set ticked): everything else refreshes, the card keeps its state (and its animations). */
  bump: () => void;
  bumpAll: () => void;
};

export const useDataVersion = create<Bus>((set) => ({
  v: 0,
  cards: 0,
  bump: () => set((s) => ({ v: s.v + 1 })),
  bumpAll: () => set((s) => ({ v: s.v + 1, cards: s.cards + 1 })),
}));
