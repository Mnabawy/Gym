// Your own app color (settings → لون التطبيق): any hex you type becomes the accent everywhere — buttons, ticks,
// rings, links, glows. Text in that color is darkened (light themes) or lightened (dark themes) until it reads at
// WCAG AA contrast (4.5:1) on the background. Pure — unit tested in __tests__/color.test.ts.

/** "#abc", "abc", "#AABBCC", "aabbcc" (Arabic-Indic digits too) → "#AABBCC"; anything else → null. */
export function normHex(input: string): string | null {
  const s = input
    .trim()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(s)) return `#${s.split('').map((c) => c + c).join('')}`.toUpperCase();
  if (/^[0-9a-f]{6}$/i.test(s)) return `#${s}`.toUpperCase();
  return null;
}

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (c: number[]) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`.toUpperCase();

/** Relative luminance (WCAG 2). */
export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** `w` of `a` mixed with the rest of `b`. */
export function mix(a: string, b: string, w: number): string {
  const [p, q] = [rgb(a), rgb(b)];
  return toHex(p.map((v, i) => v * w + q[i] * (1 - w)));
}

export const isDark = (bg: string) => luminance(bg) < 0.2;

/** The color pushed toward black (light background) or white (dark background) until it reads on `bg`. */
export function readable(color: string, bg: string, min = 4.5): string {
  const to = isDark(bg) ? '#FFFFFF' : '#000000';
  for (let w = 1; w >= 0; w -= 0.05) {
    const c = mix(color, to, w);
    if (contrast(c, bg) >= min) return c;
  }
  return to;
}

export type AccentTokens = { ok: string; okText: string; onOk: string; okSoft: string };

/** The theme's accent tokens for your color on a background. */
export function accentTokens(hex: string, bg: string): AccentTokens {
  const light = '#FFFFFF';
  const dark = '#111111';
  return {
    ok: hex,
    okText: readable(hex, bg),
    onOk: contrast(light, hex) >= contrast(dark, hex) ? light : dark,
    okSoft: mix(hex, bg, isDark(bg) ? 0.22 : 0.16),
  };
}

/** Ready colors under the color box. */
export const ACCENT_PRESETS = ['#B93435', '#1BA6A8', '#2563EB', '#7C3AED', '#DB2777', '#DC2626', '#EA580C', '#CA8A04', '#16A34A', '#1F1D1A'] as const;
