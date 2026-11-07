// A global undo snackbar for reversible actions (ticking a set/meal/habit, logging water, switching a day). The write
// happens right away; a short bar at the bottom offers "تراجع" to put it back. One host (`UndoBar` in the root
// layout). zustand so any screen can raise it. Destructive actions use the confirm dialog instead (`./confirm`).
import { create } from 'zustand';

type UndoState = {
  message: string | null;
  onUndo: (() => void) | null;
  /** Bumped on every show so the host restarts its auto-hide timer. */
  seq: number;
  show: (message: string, onUndo: () => void) => void;
  run: () => void;
  dismiss: () => void;
};

export const useUndo = create<UndoState>((set, get) => ({
  message: null,
  onUndo: null,
  seq: 0,
  show: (message, onUndo) => set((s) => ({ message, onUndo, seq: s.seq + 1 })),
  run: () => {
    get().onUndo?.();
    set({ message: null, onUndo: null });
  },
  dismiss: () => set({ message: null, onUndo: null }),
}));

/** Show the undo bar after a reversible write. `onUndo` puts things back. */
export const showUndo = (message: string, onUndo: () => void) => useUndo.getState().show(message, onUndo);
