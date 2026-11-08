// Opening another app on the phone (Android): a habit can carry the package of an app to open (e.g. a Quran app for
// the daily wird). Pure parsing here; opening is in appsIO.ts.

/** An Android package name, e.g. "org.goldenquran.freesoft". */
export const isPackage = (s: string) => /^[a-zA-Z][\w]*(\.[a-zA-Z_][\w]*)+$/.test(s) && s.length <= 150;

/**
 * Takes what you pasted: a Google Play link (…/store/apps/details?id=PACKAGE&hl=ar, market://details?id=…) or the
 * package itself. Returns the package, or null when it isn't one.
 */
export function packageFrom(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  const m = s.match(/[?&]id=([^&#\s]+)/);
  const p = m ? decodeURIComponent(m[1]) : s;
  return isPackage(p) ? p : null;
}
