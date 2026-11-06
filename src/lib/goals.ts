// Goals (the الأهداف section): one big goal with a number (money, hours, books…), the road to it in stages with small
// tasks, every bit of progress you log, wins (yours and the ones the app sees: 10/25/50/75/100% and each stage done),
// a weekly review (what you did, what stopped you, the next step) and a nudge when nothing moved for a while.
// Saved as JSON in storage meta `goals`. Pure — unit tested in __tests__/goals.test.ts.
import { addDays, daysBetween } from './gaps';

export const GOALS_KEY = 'goals';
/** Days without a review before the weekly review shows. */
export const REVIEW_EVERY = 7;
/** Days with nothing logged before the goal page nudges. */
export const IDLE_DAYS = 7;
/** Shares of the way that count as a win. */
export const MILESTONES = [0.1, 0.25, 0.5, 0.75, 1] as const;

export type Task = { id: string; title: string; done: string | null };
export type Stage = { id: string; title: string; note?: string; tasks: Task[] };
export type Entry = { id: string; date: string; amount: number; note?: string };
export type Win = { id: string; date: string; title: string; auto?: boolean };
export type Review = { date: string; did: string; blocked: string; next: string };
export type Goal = {
  id: string;
  name: string;
  icon: string;
  color: string;
  /** What the number counts: "$", "ساعة", "كتاب"… */
  unit: string;
  /** Where you are on day one, and where you want to be. */
  start: number;
  target: number;
  startDate: string;
  /** The date you're aiming for (optional). */
  due: string | null;
  why: string;
  stages: Stage[];
  entries: Entry[];
  wins: Win[];
  reviews: Review[];
};

export const GOAL_ICONS = ['cash', 'trending-up', 'briefcase', 'school', 'book', 'code-slash', 'home', 'car', 'airplane', 'trophy', 'rocket', 'flag'] as const;
export const GOAL_COLORS = ['#3E9A68', '#5B7FE0', '#D9902B', '#D55E00', '#E0609B', '#7A5CFA', '#1BA6A8', '#C62828'] as const;

const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const str = (s: unknown) => (typeof s === 'string' ? s : '');
const num = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? n : null);
const arr = (a: unknown): unknown[] => (Array.isArray(a) ? a : []);
type Obj = Record<string, unknown>;
const obj = (o: unknown): o is Obj => !!o && typeof o === 'object';

export function parseGoals(raw: string | null): Goal[] {
  let data: unknown;
  try {
    data = JSON.parse(raw ?? '[]');
  } catch {
    return [];
  }
  const seen = new Set<string>();
  const out: Goal[] = [];
  for (const g of arr(data)) {
    if (!obj(g) || typeof g.id !== 'string' || seen.has(g.id) || !str(g.name).trim()) continue;
    const start = num(g.start) ?? 0;
    const target = num(g.target);
    if (target === null || target === start || !isDate(g.startDate)) continue;
    seen.add(g.id);
    out.push({
      id: g.id,
      name: str(g.name).trim(),
      icon: str(g.icon) || GOAL_ICONS[0],
      color: /^#[0-9a-f]{6}$/i.test(str(g.color)) ? str(g.color) : GOAL_COLORS[0],
      unit: str(g.unit).trim(),
      start,
      target,
      startDate: g.startDate,
      due: isDate(g.due) ? g.due : null,
      why: str(g.why),
      stages: arr(g.stages).filter(obj).filter((s) => typeof s.id === 'string' && str(s.title).trim()).map((s) => ({
        id: s.id as string,
        title: str(s.title).trim(),
        ...(str(s.note) ? { note: str(s.note) } : {}),
        tasks: arr(s.tasks).filter(obj).filter((t) => typeof t.id === 'string' && str(t.title).trim())
          .map((t) => ({ id: t.id as string, title: str(t.title).trim(), done: isDate(t.done) ? t.done : null })),
      })),
      entries: arr(g.entries).filter(obj).filter((e) => typeof e.id === 'string' && isDate(e.date) && num(e.amount) !== null)
        .map((e) => ({ id: e.id as string, date: e.date as string, amount: e.amount as number, ...(str(e.note) ? { note: str(e.note) } : {}) }))
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
      wins: arr(g.wins).filter(obj).filter((w) => typeof w.id === 'string' && isDate(w.date) && str(w.title).trim())
        .map((w) => ({ id: w.id as string, date: w.date as string, title: str(w.title).trim() })),
      reviews: arr(g.reviews).filter(obj).filter((r) => isDate(r.date))
        .map((r) => ({ date: r.date as string, did: str(r.did), blocked: str(r.blocked), next: str(r.next) }))
        .sort((a, b) => (a.date < b.date ? -1 : 1)),
    });
  }
  return out;
}

export const goalId = (now: number = Date.now(), n = 0) => `g${now.toString(36)}${n ? `-${n}` : ''}`;

/** Where you are now: the starting point plus everything logged. */
export const current = (g: Goal) => g.start + g.entries.reduce((a, e) => a + e.amount, 0);

/** Share of the way from start to target, 0–1 (works for goals that go down too). */
export const progress = (g: Goal, at = current(g)) => Math.max(0, Math.min(1, (at - g.start) / (g.target - g.start)));

export const stageDone = (s: Stage) => s.tasks.length > 0 && s.tasks.every((t) => t.done);

/** The stage you're on: the first one not done (−1 once every stage is done). */
export const currentStage = (g: Goal) => g.stages.findIndex((s) => !stageDone(s));

/** The next thing to do: the first open task of the stage you're on. */
export function nextTask(g: Goal): { stage: Stage; task: Task } | null {
  const i = currentStage(g);
  if (i < 0) return null;
  const stage = g.stages[i];
  const task = stage.tasks.find((t) => !t.done);
  return task ? { stage, task } : null;
}

export type Pace = {
  /** Gained so far, in the goal's unit (negative = went the wrong way). */
  gained: number;
  remaining: number;
  /** Average per 30 days since the start (counted as a month at least). */
  perMonth: number;
  /** When you'll get there at this rate (null: not moving towards it yet, or already there). */
  eta: string | null;
  /** Needed per 30 days to make the due date (null: no due date, or there already). */
  needPerMonth: number | null;
  daysLeft: number | null;
};

export function pace(g: Goal, today: string): Pace {
  const now = current(g);
  const dir = Math.sign(g.target - g.start);
  const gained = now - g.start;
  const remaining = g.target - now;
  // At least a month: a big first entry on day one shouldn't read as that much every day.
  const days = Math.max(30, daysBetween(g.startDate, today) + 1);
  const perDay = gained / days;
  const there = remaining * dir <= 0;
  const eta = !there && perDay * dir > 0 && g.entries.length ? addDays(today, Math.ceil(remaining / perDay)) : null;
  const daysLeft = g.due ? daysBetween(today, g.due) : null;
  const needPerMonth = g.due && !there ? (remaining / Math.max(1, daysLeft ?? 1)) * 30 : null;
  return { gained, remaining: there ? 0 : remaining, perMonth: perDay * 30, eta, needPerMonth, daysLeft };
}

/** The wins the app sees by itself: each milestone share crossed (the day it happened) and each stage finished. */
export function autoWins(g: Goal, fmt: (n: number) => string = String): Win[] {
  const out: Win[] = [];
  let at = g.start;
  let m = 0;
  for (const e of g.entries) {
    at += e.amount;
    while (m < MILESTONES.length && progress(g, at) >= MILESTONES[m]) {
      const share = MILESTONES[m];
      const value = g.start + (g.target - g.start) * share;
      out.push({ id: `m${share}`, date: e.date, title: share === 1 ? `وصلت للهدف: ${fmt(g.target)} 🎉` : `عدّيت ${Math.round(share * 100)}% (${fmt(value)})`, auto: true });
      m++;
    }
  }
  for (const s of g.stages) {
    if (!stageDone(s)) continue;
    const date = s.tasks.reduce((a, t) => (t.done! > a ? t.done! : a), '');
    out.push({ id: `s${s.id}`, date, title: `خلّصت مرحلة: ${s.title}`, auto: true });
  }
  return out;
}

/** Your wins and the app's, newest first. */
export const allWins = (g: Goal, fmt?: (n: number) => string) => [...g.wins, ...autoWins(g, fmt)].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

/** The last day anything happened on the goal (progress, a task, a review, a win), or its start. */
export function lastActivity(g: Goal): string {
  let d = g.startDate;
  const see = (x: string | null | undefined) => {
    if (x && x > d) d = x;
  };
  g.entries.forEach((e) => see(e.date));
  g.stages.forEach((s) => s.tasks.forEach((t) => see(t.done)));
  g.reviews.forEach((r) => see(r.date));
  g.wins.forEach((w) => see(w.date));
  return d;
}

export const idleDays = (g: Goal, today: string) => Math.max(0, daysBetween(lastActivity(g), today));

/** Whether the weekly review is due: a week since the last one (or since the start). */
export const reviewDue = (g: Goal, today: string) => daysBetween(g.reviews[g.reviews.length - 1]?.date ?? g.startDate, today) >= REVIEW_EVERY;

/** Ticks a task on (today) or off. */
export function toggleTask(g: Goal, taskId: string, today: string): Goal {
  return { ...g, stages: g.stages.map((s) => ({ ...s, tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, done: t.done ? null : today } : t)) })) };
}

/** Adds a review, replacing one already written today. */
export function addReview(g: Goal, r: Review): Goal {
  return { ...g, reviews: [...g.reviews.filter((x) => x.date !== r.date), r].sort((a, b) => (a.date < b.date ? -1 : 1)) };
}

/** Moves a stage up (−1) or down (+1). */
export function moveStage(g: Goal, id: string, by: -1 | 1): Goal {
  const i = g.stages.findIndex((s) => s.id === id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= g.stages.length) return g;
  const stages = [...g.stages];
  [stages[i], stages[j]] = [stages[j], stages[i]];
  return { ...g, stages };
}

/** A number with thousands separators and the unit ($ in front, words after). */
export function fmtAmount(n: number, unit: string): string {
  const r = Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 10) / 10;
  const s = r.toLocaleString('en-US');
  if (!unit) return s;
  return /^[$€£]$/.test(unit) ? `${r < 0 ? '-' : ''}${unit}${s.replace('-', '')}` : `${s} ${unit}`;
}
