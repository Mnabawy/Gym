// Error log: the last errors the app caught (a screen that crashed, a sync or backup that failed quietly), kept on this
// phone only (meta `errLog`, phone-only in cloudSync `isLocalMeta`) so they can be read and copied from settings
// («سجل الأخطاء»). `report` never throws: it is called from catch blocks and from the crash screen.
import { storage } from './storage';

export const ERR_LOG_KEY = 'errLog';
export const ERR_MAX = 50;
const MSG_MAX = 500;
const STACK_MAX = 2000;

/** One caught error. `n`: how many times in a row the same error came back (e.g. sync offline), newest `at`. */
export type ErrEntry = { at: number; where: string; msg: string; stack?: string; n?: number };

const cut = (s: string, max: number) => (s.length > max ? `${s.slice(0, max)}…` : s);

function safeString(v: unknown): string {
  try {
    return String(v);
  } catch {
    return 'unprintable error';
  }
}

/** An entry for any thrown value (Error or not). Never throws. */
export function toEntry(e: unknown, where: string, at: number): ErrEntry {
  let msg = 'unknown error';
  let stack: string | undefined;
  try {
    if (e instanceof Error) {
      msg = `${e.name && e.name !== 'Error' ? `${e.name}: ` : ''}${safeString(e.message)}`;
      if (typeof e.stack === 'string' && e.stack) stack = cut(e.stack, STACK_MAX);
    } else if (typeof e === 'string') msg = e;
    else if (e && typeof e === 'object') {
      const m = (e as { message?: unknown }).message;
      msg = typeof m === 'string' ? m : JSON.stringify(e) ?? safeString(e);
    } else msg = safeString(e);
  } catch {
    msg = 'unprintable error';
  }
  const out: ErrEntry = { at, where: cut(safeString(where), 80), msg: cut(msg, MSG_MAX) };
  if (stack) out.stack = stack;
  return out;
}

/** The stored log, newest first; anything unreadable is dropped. */
export function parseErrLog(raw: string | null | undefined): ErrEntry[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is ErrEntry => !!x && typeof x === 'object' && typeof x.at === 'number' && typeof x.where === 'string' && typeof x.msg === 'string').slice(0, ERR_MAX);
  } catch {
    return [];
  }
}

/** Adds an entry first and keeps the newest `cap`. The same error right after itself is counted, not repeated. */
export function addErr(list: readonly ErrEntry[], e: ErrEntry, cap = ERR_MAX): ErrEntry[] {
  const top = list[0];
  if (top && top.where === e.where && top.msg === e.msg) return [{ ...e, n: (top.n ?? 1) + 1 }, ...list.slice(1)].slice(0, cap);
  return [e, ...list].slice(0, cap);
}

/** Notes a caught error (console.warn + the phone's error log). Never throws, also when storage is broken. */
export function report(e: unknown, where: string): void {
  let entry: ErrEntry | null = null;
  try {
    entry = toEntry(e, where, Date.now());
    console.warn(`[${entry.where}]`, e);
  } catch {}
  if (!entry) return;
  try {
    storage.setMeta(ERR_LOG_KEY, JSON.stringify(addErr(parseErrLog(storage.getMeta(ERR_LOG_KEY)), entry)));
  } catch {}
}

/** The log, newest first ([] when storage can't be read). */
export function readErrLog(): ErrEntry[] {
  try {
    return parseErrLog(storage.getMeta(ERR_LOG_KEY));
  } catch {
    return [];
  }
}

export function clearErrLog(): void {
  try {
    storage.setMeta(ERR_LOG_KEY, '');
  } catch {}
}

const stamp = (at: number) => {
  try {
    return new Date(at).toISOString();
  } catch {
    return String(at);
  }
};

/** Plain text of entries, to copy and send. */
export function errText(list: readonly ErrEntry[], head?: string): string {
  const parts = list.map((x) => [`${stamp(x.at)} [${x.where}]${x.n && x.n > 1 ? ` ×${x.n}` : ''}`, x.msg, x.stack ?? ''].filter(Boolean).join('\n'));
  return [head, ...parts].filter(Boolean).join('\n\n');
}
