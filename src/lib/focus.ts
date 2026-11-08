// بومودورو (focus section): work and study in focus blocks with short breaks and a long break every few blocks.
// The Pomodoro Technique (Francesco Cirillo): 25 minutes of focus, a 5-minute break, and after 4 blocks a longer one
// (15–30 minutes). Lengths are yours to change. The clock runs on an end time, so it stays right with the app closed;
// a focus block counts once it reaches its end (or, skipped early, for the whole minutes you put in).
// Sessions in meta `focus`, settings in `focusCfg`, the running clock in `focusState` (this phone only).
// Pure — unit tested in __tests__/focus.test.ts.
import { addDays } from './gaps';

export const FOCUS_KEY = 'focus';
export const FOCUS_CFG_KEY = 'focusCfg';
export const FOCUS_STATE_KEY = 'focusState';
const MIN = 60_000;

export type Kind = 'work' | 'study';
export const KINDS: Record<Kind, string> = { work: 'شغل', study: 'مذاكرة' };
export type Session = { id: string; kind: Kind; start: number; end: number; min: number; date: string; task?: string };
export type Cfg = { focus: number; short: number; long: number; every: number; auto: boolean };
export const DEFAULT_CFG: Cfg = { focus: 25, short: 5, long: 15, every: 4, auto: false };
export type Phase = 'focus' | 'short' | 'long';
export const PHASE_AR: Record<Phase, string> = { focus: 'تركيز', short: 'راحة قصيرة', long: 'راحة طويلة' };

export type State = {
  phase: Phase;
  /** Focus blocks done in this round (the long break comes at `every`). */
  round: number;
  /** Running: when the phase ends. */
  endAt: number | null;
  /** Paused: ms left. Idle when both are null. */
  left: number | null;
  /** Focus already put in before this run (pauses), and when this run started. */
  spent: number;
  runFrom: number | null;
  /** When this focus block first started. */
  startedAt: number | null;
  kind: Kind;
  task?: string;
};
export const IDLE: State = { phase: 'focus', round: 0, endAt: null, left: null, spent: 0, runFrom: null, startedAt: null, kind: 'work' };

const num = (x: unknown, lo: number, hi: number, d: number) => (typeof x === 'number' && isFinite(x) ? Math.min(hi, Math.max(lo, Math.round(x))) : d);
const obj = (raw: string | null): Record<string, unknown> | null => {
  try {
    const v: unknown = JSON.parse(raw ?? 'null');
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};
const isKind = (x: unknown): x is Kind => x === 'work' || x === 'study';

export function parseCfg(raw: string | null): Cfg {
  const o = obj(raw) ?? {};
  return {
    focus: num(o.focus, 5, 120, DEFAULT_CFG.focus),
    short: num(o.short, 1, 30, DEFAULT_CFG.short),
    long: num(o.long, 5, 60, DEFAULT_CFG.long),
    every: num(o.every, 2, 8, DEFAULT_CFG.every),
    auto: o.auto === true,
  };
}

export function parseState(raw: string | null): State {
  const o = obj(raw);
  if (!o) return IDLE;
  const n = (x: unknown) => (typeof x === 'number' && isFinite(x) ? x : null);
  return {
    phase: o.phase === 'short' || o.phase === 'long' ? o.phase : 'focus',
    round: num(o.round, 0, 8, 0),
    endAt: n(o.endAt),
    left: n(o.left),
    spent: n(o.spent) ?? 0,
    runFrom: n(o.runFrom),
    startedAt: n(o.startedAt),
    kind: isKind(o.kind) ? o.kind : 'work',
    ...(typeof o.task === 'string' && o.task ? { task: o.task } : {}),
  };
}

export function parseSessions(raw: string | null): Session[] {
  let v: unknown;
  try {
    v = JSON.parse(raw ?? '[]');
  } catch {
    return [];
  }
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: Session[] = [];
  for (const x of v) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    if (typeof o.id !== 'string' || seen.has(o.id) || typeof o.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.date)) continue;
    if (typeof o.min !== 'number' || o.min < 1 || typeof o.start !== 'number' || typeof o.end !== 'number') continue;
    seen.add(o.id);
    out.push({ id: o.id, kind: isKind(o.kind) ? o.kind : 'work', start: o.start, end: o.end, min: Math.round(o.min), date: o.date, ...(typeof o.task === 'string' && o.task ? { task: o.task } : {}) });
  }
  return out;
}

export const phaseMs = (p: Phase, c: Cfg) => (p === 'focus' ? c.focus : p === 'short' ? c.short : c.long) * MIN;
export const running = (s: State) => s.endAt != null;
export const paused = (s: State) => s.endAt == null && s.left != null;
/** Ms left in the phase (full length when idle). */
export const remaining = (s: State, c: Cfg, now: number) => (s.endAt != null ? Math.max(0, s.endAt - now) : s.left ?? phaseMs(s.phase, c));

/** Start, or resume after a pause. */
export function start(s: State, c: Cfg, now: number): State {
  if (running(s)) return s;
  const left = s.left ?? phaseMs(s.phase, c);
  return { ...s, endAt: now + left, left: null, runFrom: now, startedAt: s.startedAt ?? now };
}

export function pause(s: State, now: number): State {
  if (!running(s)) return s;
  return { ...s, endAt: null, left: Math.max(0, s.endAt! - now), spent: s.spent + (s.phase === 'focus' && s.runFrom != null ? now - s.runFrom : 0), runFrom: null };
}

/** Back to the start of this phase. */
export const reset = (s: State): State => ({ ...s, endAt: null, left: null, spent: 0, runFrom: null, startedAt: null });

/** Focus put in so far in this block (ms). */
export const focused = (s: State, now: number) => (s.phase !== 'focus' ? 0 : s.spent + (s.endAt != null && s.runFrom != null ? Math.min(now, s.endAt) - s.runFrom : 0));

/**
 * Ends the phase — on time (`done`) or skipped — and moves on: after focus a short break, or the long one every
 * `every` blocks; after a break, focus. A focus block logs a session: its full length on time, or the whole minutes
 * put in when skipped (nothing under a minute). With `auto`, the next phase starts right away.
 */
export function finish(s: State, c: Cfg, now: number, done: boolean, id: string, date: string): { state: State; session: Session | null } {
  let session: Session | null = null;
  let next: State;
  if (s.phase === 'focus') {
    const min = done ? c.focus : Math.floor(focused(s, now) / MIN);
    const end = done && s.endAt != null ? s.endAt : now;
    if (min >= 1) session = { id, kind: s.kind, start: s.startedAt ?? end - min * MIN, end, min, date, ...(s.task ? { task: s.task } : {}) };
    // A skipped block with nothing in it doesn't count toward the long break.
    const round = s.round + (session ? 1 : 0);
    const long = round >= c.every;
    next = { ...IDLE, kind: s.kind, ...(s.task ? { task: s.task } : {}), phase: session ? (long ? 'long' : 'short') : 'short', round: long ? 0 : round };
  } else {
    next = { ...IDLE, kind: s.kind, ...(s.task ? { task: s.task } : {}), phase: 'focus', round: s.round };
  }
  // Auto: the next phase starts where this one ended (on time) or now (skipped).
  if (c.auto) next = start(next, c, done && s.endAt != null ? Math.min(now, s.endAt) : now);
  return { state: next, session };
}

// ——— Stats ———

export const minutesOn = (list: readonly Session[], date: string) => list.reduce((a, x) => a + (x.date === date ? x.min : 0), 0);
export const countOn = (list: readonly Session[], date: string) => list.filter((x) => x.date === date).length;
/** Minutes per day for 7 days ending on `last`. */
export const week = (list: readonly Session[], last: string) => Array.from({ length: 7 }, (_, i) => addDays(last, i - 6)).map((d) => ({ date: d, min: minutesOn(list, d) }));
/** Days in a row with focus, up to today (today not done yet doesn't break it). */
export function streak(list: readonly Session[], today: string): number {
  const days = new Set(list.map((x) => x.date));
  let d = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}
/** Minutes per kind between two days (the weekly report). */
export function minutesBetween(list: readonly Session[], from: string, to: string): Record<Kind, number> {
  const out: Record<Kind, number> = { work: 0, study: 0 };
  for (const x of list) if (x.date >= from && x.date <= to) out[x.kind] += x.min;
  return out;
}
/** «1:05 س» / «45 د». */
export const minAr = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} س` : `${m} د`);
export const clock = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
