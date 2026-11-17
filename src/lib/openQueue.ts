// Pages opened from a notification tap (`data.url`). On a cold start the tap arrives before the app has finished
// its launch redirect (welcome), so the page waits here until the app says it's ready, then opens once.
// The same tap can come twice (the launch response and the listener): `first` tells them apart.

export type OpenQueue = {
  /** True the first time a notification response id is seen, false for a repeat of the same tap. */
  first: (id: string) => boolean;
  /** Opens a page now if the app is ready, else keeps it (the last one tapped) for `ready`. */
  open: (url: string) => void;
  /** The app is ready to navigate: opens the waiting page, and later ones right away. */
  ready: () => void;
};

export function openQueue(navigate: (url: string) => void): OpenQueue {
  let isReady = false;
  let pending: string | null = null;
  const handled = new Set<string>();
  return {
    first(id) {
      if (handled.has(id)) return false;
      handled.add(id);
      return true;
    },
    open(url) {
      if (isReady) navigate(url);
      else pending = url;
    },
    ready() {
      isReady = true;
      if (pending) {
        const u = pending;
        pending = null;
        navigate(u);
      }
    },
  };
}
