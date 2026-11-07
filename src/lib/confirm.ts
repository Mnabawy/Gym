// A global confirm dialog for destructive actions (deletes, clears, logging a slip). One host (`ConfirmHost` in the
// root layout) shows the question; `confirm(...)` returns a promise that resolves true/false. zustand so any screen
// can ask without threading props. See also the undo snackbar (`./undo`) for reversible actions.
import { create } from 'zustand';

export type ConfirmOpts = {
  title: string;
  body?: string;
  /** Label on the go-ahead button (default "تمام"). */
  confirmLabel?: string;
  /** Red go-ahead button for deletes. */
  danger?: boolean;
};

type ConfirmState = {
  opts: ConfirmOpts | null;
  resolve: ((ok: boolean) => void) | null;
  ask: (opts: ConfirmOpts) => Promise<boolean>;
  answer: (ok: boolean) => void;
};

export const useConfirm = create<ConfirmState>((set, get) => ({
  opts: null,
  resolve: null,
  ask: (opts) =>
    new Promise<boolean>((resolve) => {
      // Any pending question is answered "no" before a new one replaces it.
      get().resolve?.(false);
      set({ opts, resolve });
    }),
  answer: (ok) => {
    get().resolve?.(ok);
    set({ opts: null, resolve: null });
  },
}));

/** Ask the user to confirm; resolves true if they go ahead. Usage: `if (await confirm({ title, danger: true })) delete()`. */
export const confirm = (opts: ConfirmOpts) => useConfirm.getState().ask(opts);
