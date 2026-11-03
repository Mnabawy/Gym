// Tiny change counter so screens re-read storage after a write.
import { create } from 'zustand';

export const useDataVersion = create<{ v: number; bump: () => void }>((set) => ({
  v: 0,
  bump: () => set((s) => ({ v: s.v + 1 })),
}));
