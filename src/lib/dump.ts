// فضّي دماغك: a brain dump. You write everything on your mind, one line each, without sorting; then sort each line:
// a task (to مهامي, with a day), a worry (let it go, or a day to think about it), an idea (kept), or a two-minute
// thing you just did. Why: unfinished things keep coming back to mind (the Zeigarnik effect), but a specific plan for
// them is enough to quiet them, even before they're done (Masicampo & Baumeister 2011, "Consider it done!",
// J Pers Soc Psychol 101(4) 667–683); writing a specific to-do list for 5 minutes at bedtime helped people fall
// asleep about 9 minutes faster (Scullin et al. 2018, J Exp Psychol Gen 147(1) 139–146). The capture-then-sort
// order and the two-minute rule are David Allen's (Getting Things Done, 2001). Saved in meta `dump`. Pure.

import { addDays, weekdayOf } from './dates';
import { isRec, keepExtra, parseList } from './records';

export const DUMP_KEY = 'dump';

export type DumpKind = 'new' | 'worry' | 'idea';
/** `day`: a worry's day to think about it (until then it stays out of the way). */
export type DumpItem = { id: string; text: string; at: string; kind: DumpKind; day?: string };

const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

const DUMP_FIELDS = new Set(['id', 'text', 'at', 'kind', 'day']);

/** One stored item, or null when this build can't read it. Fields it doesn't know are kept (records.ts). */
export function parseDumpItem(x: unknown): DumpItem | null {
  if (!isRec(x) || typeof x.id !== 'string' || typeof x.text !== 'string' || !x.text.trim() || !isDate(x.at)) return null;
  const kind: DumpKind = x.kind === 'worry' || x.kind === 'idea' ? x.kind : 'new';
  return keepExtra<DumpItem>(x, DUMP_FIELDS, { id: x.id, text: x.text.trim(), at: x.at, kind, ...(kind === 'worry' && isDate(x.day) ? { day: x.day } : {}) });
}

export const parseDump = (raw: string | null): DumpItem[] => parseList(raw, parseDumpItem);

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
  return addDays(today, ((5 - weekdayOf(today) + 7) % 7) || 7);
}
