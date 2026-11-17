// The app's sections are the bottom tabs (src/app/(tabs)/_layout.tsx): أسبوعك, الجيم, مهامي, الأهداف, بطّل.
// What's left here is the launch handshake: pages opened from a notification tap wait until the launch redirects are done.

// Set once the tabs show (after the welcome redirect, if any).
let seen = false;
const waiting = new Set<() => void>();
export const hubSeen = () => {
  seen = true;
  for (const f of [...waiting]) f();
  waiting.clear();
};
/** Runs `f` once the tabs have been shown (the launch redirects are done); right away if they already have. */
export function afterHub(f: () => void): () => void {
  if (seen) {
    f();
    return () => {};
  }
  waiting.add(f);
  return () => waiting.delete(f);
}
