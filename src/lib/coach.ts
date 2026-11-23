// What a coach sees about a client: a small summary each phone uploads (meta never leaves as-is: only these numbers),
// and how it reads at a glance. Pure — unit tested in __tests__/coach.test.ts.
import { daysBetween } from './dates';
import type { PlateauInput } from './plateau';

export type ClientStats = {
  /** When this summary was made (ISO). */
  at: string;
  lastWorkout: string | null;
  /** Sessions trained vs owed, last 4 weeks. */
  attendance: { done: number; due: number };
  meals: number | null;
  rate: number | null;
  kg: number | null;
  stuck: string[];
  /** The plan: its days' names, goal and level (from the setup), training weekdays. */
  plan: { days: string[]; goal: string; level: string; weekdays: number[] };
};

export function clientStats(x: PlateauInput, lastWorkout: string | null, plan: ClientStats['plan'], now: Date = new Date()): ClientStats {
  return { at: now.toISOString(), lastWorkout, attendance: x.attendance, meals: x.meals, rate: x.rate, kg: x.kg, stuck: x.stuck.map((s) => s.name), plan };
}

/** A summary from the server, or null if it's not one (an old or broken row). */
export function parseStats(v: unknown): ClientStats | null {
  const o = (v ?? {}) as Record<string, unknown>;
  const a = (o.attendance ?? {}) as Record<string, unknown>;
  const p = (o.plan ?? {}) as Record<string, unknown>;
  if (typeof o.at !== 'string' || typeof a.done !== 'number' || typeof a.due !== 'number') return null;
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
  const strs = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : []);
  return {
    at: o.at,
    lastWorkout: typeof o.lastWorkout === 'string' ? o.lastWorkout : null,
    attendance: { done: a.done, due: a.due },
    meals: num(o.meals),
    rate: num(o.rate),
    kg: num(o.kg),
    stuck: strs(o.stuck),
    plan: { days: strs(p.days), goal: typeof p.goal === 'string' ? p.goal : '', level: typeof p.level === 'string' ? p.level : '', weekdays: Array.isArray(p.weekdays) ? p.weekdays.filter((d): d is number => Number.isInteger(d)) : [] },
  };
}

export type Flag = 'ok' | 'watch' | 'alert';
/** Days without training before a client needs a message. */
export const AWAY_DAYS = 5;

/** How a client is doing, worst first, with the lines that explain it. */
export function clientStatus(s: ClientStats | null, today: string): { flag: Flag; lines: string[] } {
  if (!s) return { flag: 'watch', lines: ['لسه ما بعتش بيانات'] };
  const lines: string[] = [];
  let flag: Flag = 'ok';
  const away = s.lastWorkout ? daysBetween(s.lastWorkout, today) : null;
  if (away == null) {
    lines.push('لسه ما اتمرنش');
    flag = 'watch';
  } else if (away >= AWAY_DAYS) {
    lines.push(`مااتمرنش بقاله ${away} يوم`);
    flag = 'alert';
  } else lines.push(away === 0 ? 'اتمرن النهارده' : `آخر تمرين من ${away} يوم`);
  if (s.attendance.due >= 4) {
    const r = s.attendance.done / s.attendance.due;
    lines.push(`الحضور ${s.attendance.done} من ${s.attendance.due}`);
    if (r < 0.5) flag = 'alert';
    else if (r < 0.75 && flag === 'ok') flag = 'watch';
  }
  if (s.meals != null) {
    lines.push(`الوجبات ${Math.round(s.meals * 100)}%`);
    if (s.meals < 0.7 && flag === 'ok') flag = 'watch';
  }
  if (s.stuck.length) {
    lines.push(`واقف: ${s.stuck.join('، ')}`);
    if (flag === 'ok') flag = 'watch';
  }
  if (s.rate != null && s.kg != null) lines.push(`الوزن ${s.kg} كجم (${s.rate > 0 ? '+' : ''}${s.rate} في الأسبوع)`);
  return { flag, lines };
}

/** Clients sorted for the coach: alerts first, then watch, then fine; by name within. */
export function sortClients<T extends { name: string; status: { flag: Flag } }>(list: readonly T[]): T[] {
  const rank: Record<Flag, number> = { alert: 0, watch: 1, ok: 2 };
  return [...list].sort((a, b) => rank[a.status.flag] - rank[b.status.flag] || a.name.localeCompare(b.name));
}
