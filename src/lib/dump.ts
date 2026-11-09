// فضّي دماغك: a brain dump. You write everything on your mind, one line each, without sorting; then sort each line:
// a task (to مهامي, with a day), a worry (let it go, or a day to think about it), an idea (kept), or a two-minute
// thing you just did. Why: unfinished things keep coming back to mind (the Zeigarnik effect), but a specific plan for
// them is enough to quiet them, even before they're done (Masicampo & Baumeister 2011, "Consider it done!",
// J Pers Soc Psychol 101(4) 667–683); writing a specific to-do list for 5 minutes at bedtime helped people fall
// asleep about 9 minutes faster (Scullin et al. 2018, J Exp Psychol Gen 147(1) 139–146). The capture-then-sort
// order and the two-minute rule are David Allen's (Getting Things Done, 2001). Saved in meta `dump`. Pure.

export const DUMP_KEY = 'dump';

export type DumpKind = 'new' | 'worry' | 'idea';
/** `day`: a worry's day to think about it (until then it stays out of the way). */
export type DumpItem = { id: string; text: string; at: string; kind: DumpKind; day?: string };

const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

export function parseDump(raw: string | null): DumpItem[] {
  try {
    const v = JSON.parse(raw ?? '[]');
    if (!Array.isArray(v)) return [];
    const seen = new Set<string>();
    return v.flatMap((x) => {
      if (!x || typeof x !== 'object' || typeof x.id !== 'string' || seen.has(x.id) || typeof x.text !== 'string' || !x.text.trim() || !isDate(x.at)) return [];
      seen.add(x.id);
      const kind: DumpKind = x.kind === 'worry' || x.kind === 'idea' ? x.kind : 'new';
      return [{ id: x.id, text: x.text.trim(), at: x.at, kind, ...(kind === 'worry' && isDate(x.day) ? { day: x.day } : {}) }];
    });
  } catch {
    return [];
  }
}

/** Lines typed or pasted at once become one item each (empty lines and bullet marks dropped). */
export function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[•\-*]\s*/, '').trim())
    .filter(Boolean);
}

export const dumpId = (now: number, n = 0) => `d${now.toString(36)}${n ? n.toString(36) : ''}`;

/** Adds lines at the top: the newest batch first, in the order you wrote it. */
export function addLines(items: readonly DumpItem[], text: string, today: string, now: number): DumpItem[] {
  const fresh = splitLines(text).map((t, i) => ({ id: dumpId(now, i), text: t, at: today, kind: 'new' as const }));
  return [...fresh, ...items];
}

export const setKind = (items: readonly DumpItem[], id: string, kind: DumpKind, day?: string): DumpItem[] =>
  items.map((x) => (x.id !== id ? x : { id: x.id, text: x.text, at: x.at, kind, ...(kind === 'worry' && day ? { day } : {}) }));

export const removeItem = (items: readonly DumpItem[], id: string) => items.filter((x) => x.id !== id);

/** The page's groups: what's left to sort, worries whose day has come (or with no day), the ones waiting, and ideas. */
export function dumpView(items: readonly DumpItem[], today: string) {
  return {
    unsorted: items.filter((x) => x.kind === 'new'),
    worriesNow: items.filter((x) => x.kind === 'worry' && (!x.day || x.day <= today)),
    worriesLater: items.filter((x) => x.kind === 'worry' && x.day && x.day > today),
    ideas: items.filter((x) => x.kind === 'idea'),
  };
}

/** The next Friday after `today` (the week's quiet day to think things over); a week later if today is Friday. */
export function nextFriday(today: string): string {
  const d = new Date(`${today}T12:00:00`);
  const add = ((5 - d.getDay() + 7) % 7) || 7;
  d.setDate(d.getDate() + add);
  return d.toISOString().slice(0, 10);
}
