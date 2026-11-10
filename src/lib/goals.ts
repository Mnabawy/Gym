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

/** `due`: a date you set for this step yourself; without it the step gets one from `schedule`. `note`: its details (text and/or "• " bullets, src/lib/notes.ts). */
export type Task = { id: string; title: string; done: string | null; due?: string; note?: string };
/**
 * `until`: the date you set for the stage to be finished by; without it `schedule` works it out.
 * `amount`: the stage's share of the goal's number you set yourself (e.g. 20,000 of 100,000); with the goal split
 * (`Goal.split`) the stages without one share the rest evenly (`amountOf`). What you log fills the stages in road
 * order, each one's amount taken off before the next: the stage is done only once its amount is filled.
 */
export type Stage = { id: string; title: string; note?: string; until?: string; amount?: number; tasks: Task[] };
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
  /** The goal's number is split over the stages (see `amountOf`). */
  split?: boolean;
  /** A big goal (هدف كبير) that holds other goals instead of stages; see "Big goals" below. */
  umbrella?: boolean;
  /** The big goal this one sits under, and how much it counts there (1 عادي, 2 مهم, 3 الأهم). */
  parent?: string;
  weight?: number;
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
        ...(isDate(s.until) ? { until: s.until } : {}),
        ...(num(s.amount) !== null && (s.amount as number) > 0 ? { amount: s.amount as number } : {}),
        tasks: arr(s.tasks).filter(obj).filter((t) => typeof t.id === 'string' && str(t.title).trim())
          .map((t) => ({ id: t.id as string, title: str(t.title).trim(), done: isDate(t.done) ? t.done : null, ...(isDate(t.due) ? { due: t.due } : {}), ...(str(t.note).trim() ? { note: str(t.note) } : {}) })),
      })),
      entries: arr(g.entries).filter(obj).filter((e) => typeof e.id === 'string' && isDate(e.date) && num(e.amount) !== null)
        .map((e) => ({ id: e.id as string, date: e.date as string, amount: e.amount as number, ...(str(e.note) ? { note: str(e.note) } : {}) }))
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
      wins: arr(g.wins).filter(obj).filter((w) => typeof w.id === 'string' && isDate(w.date) && str(w.title).trim())
        .map((w) => ({ id: w.id as string, date: w.date as string, title: str(w.title).trim() })),
      reviews: arr(g.reviews).filter(obj).filter((r) => isDate(r.date))
        .map((r) => ({ date: r.date as string, did: str(r.did), blocked: str(r.blocked), next: str(r.next) }))
        .sort((a, b) => (a.date < b.date ? -1 : 1)),
      ...(g.split === true ? { split: true } : {}),
      ...(g.umbrella === true ? { umbrella: true } : {}),
      ...(g.umbrella !== true && typeof g.parent === 'string' && g.parent && g.parent !== g.id ? { parent: g.parent } : {}),
      ...(g.weight === 2 || g.weight === 3 ? { weight: g.weight } : {}),
    });
  }
  return out;
}

export const goalId = (now: number = Date.now(), n = 0) => `g${now.toString(36)}${n ? `-${n}` : ''}`;

/** Where you are now: the starting point plus everything logged. */
export const current = (g: Goal) => g.start + g.entries.reduce((a, e) => a + e.amount, 0);

/** Share of the way from start to target, 0–1 (works for goals that go down too). */
export const progress = (g: Goal, at = current(g)) => Math.max(0, Math.min(1, (at - g.start) / (g.target - g.start)));

/** Whether the number has got to `v` (either way: goals that go down reach it from above). */
export const reached = (g: Goal, v: number, at = current(g)) => (g.target > g.start ? at >= v - 1e-9 : at <= v + 1e-9);

/** The day the logged progress first got to `v`, or null if it hasn't (or the start already was there: the goal's start day). */
export function reachDate(g: Goal, v: number): string | null {
  let at = g.start;
  if (reached(g, v, at)) return g.startDate;
  for (const e of g.entries) {
    at += e.amount;
    if (reached(g, v, at)) return e.date;
  }
  return null;
}

/** +1 for goals that go up, −1 for goals that go down. */
const dir = (g: Goal) => (g.target > g.start ? 1 : -1);

/**
 * A stage's amount: the one you set, or, once the goal is split, an even share of what's left of the goal after the
 * amounts you set (so setting one takes it off the total and the others shrink). Null when the goal isn't split.
 */
export function amountOf(g: Goal, i: number): number | null {
  const st = g.stages[i];
  if (!st || !(g.split || g.stages.some((x) => x.amount !== undefined))) return null;
  if (st.amount !== undefined) return st.amount;
  const own = g.stages.reduce((a, x) => a + (x.amount ?? 0), 0);
  const auto = g.stages.filter((x) => x.amount === undefined).length;
  return Math.max(0, Math.abs(g.target - g.start) - own) / auto;
}

/** The point on the goal's number where a stage's amount is all filled: the start plus its amount and all before it. */
export function stageEnd(g: Goal, i: number): number | null {
  if (amountOf(g, i) === null) return null;
  let sum = 0;
  for (let k = 0; k <= i; k++) sum += amountOf(g, k) ?? 0;
  return g.start + dir(g) * sum;
}

/**
 * How full a stage's amount is: what you put in it (after the stages before it took theirs), out of its amount,
 * and what's left. Null when the goal isn't split.
 */
export function stageFill(g: Goal, i: number, at = current(g)): { got: number; of: number; left: number } | null {
  const end = stageEnd(g, i);
  const of = amountOf(g, i);
  if (end === null || of === null) return null;
  const got = Math.max(0, Math.min(of, of - dir(g) * (end - at)));
  return { got, of, left: of - got };
}

/** How much of the goal no stage takes (0 while some stage shares the rest; negative when the stages ask for more). */
export function unassigned(g: Goal): number {
  const own = g.stages.reduce((a, x) => a + (x.amount ?? 0), 0);
  const left = Math.abs(g.target - g.start) - own;
  return g.stages.some((x) => x.amount === undefined) && left > 0 ? 0 : left;
}

/** Split the goal's number over the stages (all shares even until you set one), or stop splitting it. */
export function setSplit(g: Goal, on: boolean): Goal {
  return on ? { ...g, split: true } : { ...g, split: undefined, stages: g.stages.map(({ amount: _a, ...x }) => x) };
}

/**
 * A stage is done once all its steps are ticked and, if it has an amount and you pass the goal, that amount is
 * filled. A stage with an amount and no steps is done by the number alone.
 */
export function stageDone(s: Stage, g?: Goal): boolean {
  const ticked = s.tasks.every((t) => t.done);
  const end = g ? stageEnd(g, g.stages.indexOf(s)) : null;
  if (g && end !== null) return ticked && reached(g, end);
  return s.tasks.length > 0 && ticked;
}

/** The stage you're on: the first one not done (−1 once every stage is done). */
export const currentStage = (g: Goal) => g.stages.findIndex((s) => !stageDone(s, g));

/** Every stage back to an even share of the goal (the amounts you set are cleared). */
export const spreadMilestones = (g: Goal): Goal => ({ ...g, split: true, stages: g.stages.map(({ amount: _a, ...x }) => x) });

/** Where each stage's amount ends on the goal's number, in road order (none when the goal isn't split). */
export const milestones = (g: Goal) => g.stages.flatMap((s, i) => {
  const at = stageEnd(g, i);
  return at === null ? [] : [{ stage: s, i, at, done: reached(g, at) }];
});

/** The next thing to do: the first open task of the stage you're on. */
/**
 * The next step to do: the first open one in the stage you're on, or, when that stage only waits for its amount (all
 * its steps ticked), the first open one after it.
 */
export function nextTask(g: Goal): { stage: Stage; task: Task } | null {
  const i = currentStage(g);
  if (i < 0) return null;
  for (const stage of g.stages.slice(i)) {
    const task = stage.tasks.find((t) => !t.done);
    if (task) return { stage, task };
  }
  return null;
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
    if (!stageDone(s, g)) continue;
    const end = stageEnd(g, g.stages.indexOf(s));
    const date = s.tasks.reduce((a, t) => (t.done! > a ? t.done! : a), end !== null ? reachDate(g, end) ?? '' : '');
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
/** A copy of a step right under it, open and with its details; its own date isn't copied (the schedule gives it one). */
export function duplicateTask(g: Goal, taskId: string, newId: string): Goal {
  return {
    ...g,
    stages: g.stages.map((st) => {
      const i = st.tasks.findIndex((x) => x.id === taskId);
      if (i < 0) return st;
      const { due: _d, ...src } = st.tasks[i];
      const copy: Task = { ...src, id: newId, done: null };
      return { ...st, tasks: [...st.tasks.slice(0, i + 1), copy, ...st.tasks.slice(i + 1)] };
    }),
  };
}

/**
 * A copy of a stage right under it: same title, details and steps, all open; its own end date and amount aren't
 * copied (the schedule and the split give it theirs). `newId(n)` makes the ids (0 = the stage, 1… = its steps).
 */
export function duplicateStage(g: Goal, stageId: string, newId: (n: number) => string): Goal {
  const i = g.stages.findIndex((x) => x.id === stageId);
  if (i < 0) return g;
  const { until: _u, amount: _a, ...src } = g.stages[i];
  const copy: Stage = { ...src, id: newId(0), tasks: src.tasks.map(({ due: _d, ...x }, k) => ({ ...x, id: newId(k + 1), done: null })) };
  return { ...g, stages: [...g.stages.slice(0, i + 1), copy, ...g.stages.slice(i + 1)] };
}

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

export type GoalWeek = { id: string; name: string; color: string; unit: string; gained: number; tasks: number; share: number };

/** Each goal's week (from–to): what you added, how many tasks you finished, and how far it is now. */
export function goalsWeek(goals: readonly Goal[], from: string, to: string): GoalWeek[] {
  const inWeek = (d: string | null) => !!d && d >= from && d <= to;
  const asOf = (g: Goal): Goal => ({ ...g, entries: g.entries.filter((e) => e.date <= to) });
  const gainedIn = (g: Goal) => g.entries.filter((e) => inWeek(e.date)).reduce((a, e) => a + e.amount, 0);
  const ticked = (g: Goal) => g.stages.reduce((a, s) => a + s.tasks.filter((t) => inWeek(t.done)).length, 0);
  return goals
    .filter((g) => g.startDate <= to)
    .map((g) => {
      // A big goal's week is its goals' week: their steps, their gains (when they count what it counts) and its share.
      const kids = g.umbrella ? kidsOf(goals, g.id) : [];
      const sum = g.umbrella && sumsUp(g, kids);
      return {
        id: g.id,
        name: g.name,
        color: g.color,
        unit: g.unit,
        gained: gainedIn(g) + (sum ? kids.reduce((a, k) => a + gainedIn(k), 0) : 0),
        tasks: ticked(g) + kids.reduce((a, k) => a + ticked(k), 0),
        share: g.umbrella ? umbrellaProgress(asOf(g), kids.map(asOf)) : progress(asOf(g)),
      };
    });
}

/** Puts a step (from the weekly review) first among the open tasks of the stage you're on, or in a new stage once all are done. */
export function addNextStep(g: Goal, title: string, id: string): Goal {
  const task = { id, title, done: null };
  const i = currentStage(g);
  if (i < 0) return { ...g, stages: [...g.stages, { id: `${id}s`, title: 'الجاي', tasks: [task] }] };
  return { ...g, stages: g.stages.map((s, j) => (j === i ? { ...s, tasks: [...s.tasks.filter((t) => t.done), task, ...s.tasks.filter((t) => !t.done)] } : s)) };
}

export type Schedule = {
  /** The date each step is planned for (yours if you set one, else spread out). */
  task: Record<string, string>;
  /** Each stage's window, and whether its end is one you set. */
  stage: Record<string, { from: string; to: string; fixed: boolean }>;
};

const dayNum = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / 86400000);
const dayStr = (n: number) => new Date(n * 86400000).toISOString().slice(0, 10);

/**
 * Spreads the steps over the goal's time frame (start day → due day): every step gets an even share of the time, in
 * road order, and each stage ends on its last step's day. Dates you set yourself (a step's `due`, a stage's `until`)
 * are kept and the steps around them are spread between them instead. An empty stage counts as one step so it still
 * gets some time. Null when the goal has no due date.
 */
export function schedule(g: Goal): Schedule | null {
  if (!g.due || !g.stages.length) return null;
  type Slot = { pos: number; fixed?: string; task?: string; stage?: string };
  const slots: Slot[] = [];
  let p = 0;
  for (const st of g.stages) {
    for (const t of st.tasks) slots.push({ pos: ++p, fixed: t.due, task: t.id });
    if (!st.tasks.length) p++;
    slots.push({ pos: p, fixed: st.until, stage: st.id });
  }
  const anchors = [{ pos: 0, day: dayNum(g.startDate) }, ...slots.filter((x) => x.fixed).map((x) => ({ pos: x.pos, day: dayNum(x.fixed!) })), { pos: p, day: dayNum(g.due) }];
  const at = (pos: number) => {
    let a = anchors[0];
    let b = anchors[anchors.length - 1];
    for (const x of anchors) {
      if (x.pos <= pos && x.pos >= a.pos) a = x;
      if (x.pos >= pos && x.pos <= b.pos) b = x;
    }
    if (b.pos === a.pos) return a.day;
    return Math.round(a.day + ((b.day - a.day) * (pos - a.pos)) / (b.pos - a.pos));
  };
  const out: Schedule = { task: {}, stage: {} };
  let from = g.startDate;
  for (const x of slots) {
    const day = x.fixed ?? dayStr(at(x.pos));
    if (x.task) out.task[x.task] = day;
    else if (x.stage) {
      out.stage[x.stage] = { from, to: day, fixed: !!x.fixed };
      from = day;
    }
  }
  return out;
}

// ---- Big goals (هدف كبير): a goal that holds other goals ----
// A goal hierarchy (Duckworth, "Grit" 2016, after Gollwitzer / Carver & Scheier): a top goal that gives the meaning, a
// few mid-level goals that serve it, and the daily steps under those. Kept to two levels on purpose: a big goal holds
// goals, a goal holds stages and steps. When the goals under it count the same thing as the big goal (all money),
// their gains add up to its number; otherwise it shows the weighted share of the way they've each gone.
// FOCUS_MAX: more than a few goals running at once spreads the effort thin (Locke & Latham 2002 on goal conflict;
// the "3 goals" rule many planners use), so the app warns from the fourth one on, without blocking it.

export const FOCUS_MAX = 3;
/** Days with nothing logged before a goal under a big one counts as stalled (واقف). */
export const STALL_DAYS = 14;
export const WEIGHTS: Record<number, string> = { 1: 'عادي', 2: 'مهم', 3: 'الأهم' };

/** The goals under a big goal, in their saved order. */
export const kidsOf = (goals: readonly Goal[], id: string) => goals.filter((k) => k.parent === id && !k.umbrella);
/** A goal's big goal, if the one it points to still exists. */
export const parentOf = (goals: readonly Goal[], g: Goal) => (g.parent ? goals.find((u) => u.id === g.parent && u.umbrella) ?? null : null);

/** Whether a big goal's number is the sum of its goals' gains (they all count what it counts). */
export const sumsUp = (u: Goal, kids: readonly Goal[]) => kids.length > 0 && kids.every((k) => k.unit === u.unit);

/** Where a big goal stands on its own number: its own logged progress plus what each goal under it gained. */
export const umbrellaValue = (u: Goal, kids: readonly Goal[]) => current(u) + kids.reduce((a, k) => a + (current(k) - k.start), 0);

/**
 * How far a big goal is (0–1): by its number when its goals add up to it, else the share of the way they've gone,
 * each counted by its weight. No goals under it yet: its own logged progress.
 */
export function umbrellaProgress(u: Goal, kids: readonly Goal[]): number {
  if (!kids.length) return progress(u);
  if (sumsUp(u, kids)) return progress(u, umbrellaValue(u, kids));
  const w = kids.reduce((a, k) => a + (k.weight ?? 1), 0);
  return kids.reduce((a, k) => a + progress(k) * (k.weight ?? 1), 0) / w;
}

/** How much one goal adds to its big goal (0–1 of the big goal's way). */
export function share(u: Goal, kids: readonly Goal[], k: Goal): number {
  if (sumsUp(u, kids)) return Math.max(0, (current(k) - k.start) / (u.target - u.start));
  const w = kids.reduce((a, x) => a + (x.weight ?? 1), 0);
  return (progress(k) * (k.weight ?? 1)) / w;
}

/** The goals under a big one that are still running (not at their target). */
export const activeKids = (kids: readonly Goal[]) => kids.filter((k) => progress(k) < 1);

/** A goal under a big one with nothing logged or ticked for STALL_DAYS. */
export const stalled = (k: Goal, today: string) => progress(k) < 1 && idleDays(k, today) >= STALL_DAYS;

/** The goal that most needs you today: a stalled one first, then the one furthest behind (by weight). */
export function needsYou(kids: readonly Goal[], today: string): Goal | null {
  const open = activeKids(kids);
  if (!open.length) return null;
  return [...open].sort((a, b) => Number(stalled(b, today)) - Number(stalled(a, today)) || (b.weight ?? 1) - (a.weight ?? 1) || progress(a) - progress(b))[0];
}
