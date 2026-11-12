// Goal steps ↔ مهامي. Pick a stretch of days on the goals page and see every open step your goals have planned in it
// (the date you set on the step, or the one the goal's schedule spreads it to); turn the ones you pick into tasks in
// مهامي. Each such task carries a link back (`Task.goal` = goal id + step id): ticking it ticks the step on the
// goal's road, ticking the step ticks the task, and the task row shows the goal's name and opens it.
// Pure — unit tested in __tests__/goalTasks.test.ts.
import { schedule, type Goal, type Stage, type Task as Step } from './goals';
import type { GoalLink, Space, Task } from './tasks';

export type PlannedStep = { goal: Goal; stage: Stage; step: Step; date: string };

/** The goals that plan steps: running ones (not a big goal, not put off for later). */
const planning = (goals: readonly Goal[]) => goals.filter((g) => !g.umbrella && !g.later);

/** Every open step planned from `from` to `to` (inclusive), by date then goal order. */
export function stepsBetween(goals: readonly Goal[], from: string, to: string): PlannedStep[] {
  const out: PlannedStep[] = [];
  planning(goals).forEach((g) => {
    const plan = schedule(g);
    for (const stage of g.stages) {
      for (const step of stage.tasks) {
        if (step.done) continue;
        const date = step.due ?? plan?.task[step.id];
        if (date && date >= from && date <= to) out.push({ goal: g, stage, step, date });
      }
    }
  });
  const order = new Map(goals.map((g, i) => [g.id, i]));
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : order.get(a.goal.id)! - order.get(b.goal.id)!));
}

const same = (l: GoalLink | undefined, goal: string, step: string) => !!l && l.goal === goal && l.step === step;

/** The task made from a step, if there is one. */
export const taskFor = (tasks: readonly Task[], goal: string, step: string) => tasks.find((t) => same(t.goal, goal, step)) ?? null;

/**
 * New tasks for the steps picked, skipping any that already has one. Each goes on its planned day (a day already past
 * goes on today, so it isn't born late), on the list `space`.
 */
export function stepsToTasks(picked: readonly PlannedStep[], tasks: readonly Task[], today: string, space: Space, id: (i: number) => string): Task[] {
  return picked
    .filter((p) => !taskFor(tasks, p.goal.id, p.step.id))
    .map((p, i) => ({
      id: id(i),
      title: p.step.title,
      due: p.date < today ? today : p.date,
      time: null,
      priority: 3 as const,
      subs: [],
      repeat: null,
      remind: false,
      done: null,
      created: today,
      ...(space === 'work' ? { space } : {}),
      goal: { goal: p.goal.id, step: p.step.id },
    }));
}

/** A linked task was ticked on or off: the step on its goal follows. Null when nothing changes. */
export function stepFollows(goals: readonly Goal[], task: Task): Goal | null {
  if (!task.goal) return null;
  const g = goals.find((x) => x.id === task.goal!.goal);
  if (!g) return null;
  let changed = false;
  const stages = g.stages.map((s) => ({
    ...s,
    tasks: s.tasks.map((st) => {
      if (st.id !== task.goal!.step || st.done === task.done) return st;
      changed = true;
      return { ...st, done: task.done };
    }),
  }));
  return changed ? { ...g, stages } : null;
}

/** A step was ticked on or off on the goal's road: its task follows (`done` = the step's new state). */
export function taskFollows(tasks: readonly Task[], goal: string, step: string, done: string | null): Task[] | null {
  let changed = false;
  const next = tasks.map((t) => {
    if (!same(t.goal, goal, step) || t.repeat || !!t.done === !!done) return t;
    changed = true;
    return { ...t, done };
  });
  return changed ? next : null;
}

/** How many open steps are planned on each day (dots on the period calendar). */
export function plannedCounts(goals: readonly Goal[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of stepsBetween(goals, '0000-01-01', '9999-12-31')) out[p.date] = (out[p.date] ?? 0) + 1;
  return out;
}
