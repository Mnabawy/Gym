// The one way to tick a task or a goal's step: a task made from a step (src/lib/goalTasks.ts) and the step stay ticked
// together, both writes in one transaction (atomic.ts), and the undo puts both back the same way. Screens call
// `tickTask` (مهامي) and `tickStep` (a goal's road, the goals page) and never write the other side themselves.
import { atomic } from './atomic';
import { findStep, setStepDone, toggleStep } from './goals';
import { readGoals, saveGoal } from './goalStore';
import { stepFollows, stepsToTasks, taskFollows, type PlannedStep } from './goalTasks';
import { revertTasks, toggleTask, type Space } from './tasks';
import { readTasks, writeTasks } from './taskStore';

export type Undo = () => void;

/** Puts a step's tick back to `done` on the goal as it is now (anything else changed on it meanwhile stays). */
function stepBack(goalId: string, stepId: string, done: string | null) {
  const g = readGoals().find((x) => x.id === goalId);
  if (!g) return;
  const next = setStepDone(g, stepId, done);
  if (next !== g) saveGoal(next);
}

/**
 * Ticks a task on (`today`) or off — a repeating one leaves a done copy with id `newId` (tasks.ts `toggleTask`) — and the
 * goal step it was made from follows. Undo is an inverse patch: only the tasks this changed (`revertTasks`) and only
 * that step's tick go back, so a sync or another edit meanwhile stays.
 */
export function tickTask(id: string, today: string, newId: string): Undo {
  return atomic(() => {
    const before = readTasks();
    const after = toggleTask(before, id, today, newId);
    writeTasks(after);
    const task = after.find((t) => t.id === id);
    let step: { goal: string; step: string; was: string | null } | null = null;
    if (task?.goal && !task.repeat) {
      const goals = readGoals();
      const g = goals.find((x) => x.id === task.goal!.goal);
      const was = g && findStep(g, task.goal.step);
      const next = stepFollows(goals, task);
      if (was && next) {
        saveGoal(next);
        step = { goal: task.goal.goal, step: task.goal.step, was: was.done };
      }
    }
    return () =>
      atomic(() => {
        writeTasks(revertTasks(readTasks(), before, after));
        if (step) stepBack(step.goal, step.step, step.was);
      });
  });
}

/** Ticks a goal's step on (`today`) or off, and the task made from it follows. Undo puts both back. Null when the goal or step is gone. */
export function tickStep(goalId: string, stepId: string, today: string): Undo | null {
  return atomic(() => {
    const g = readGoals().find((x) => x.id === goalId);
    const st = g && findStep(g, stepId);
    if (!g || !st) return null;
    const was = st.done;
    const next = toggleStep(g, stepId, today);
    saveGoal(next);
    const tasksBefore = readTasks();
    const tasksAfter = taskFollows(tasksBefore, goalId, stepId, findStep(next, stepId)!.done);
    if (tasksAfter) writeTasks(tasksAfter);
    return () =>
      atomic(() => {
        stepBack(goalId, stepId, was);
        if (tasksAfter) writeTasks(revertTasks(readTasks(), tasksBefore, tasksAfter));
      });
  });
}

/** Turns the picked steps into tasks in مهامي (skipping any that already has one). Returns how many, and the undo. */
export function stepsIntoTasks(picked: readonly PlannedStep[], today: string, space: Space, id: (i: number) => string): { made: number; undo: Undo } {
  const before = readTasks();
  const made = stepsToTasks(picked, before, today, space, id);
  const after = [...before, ...made];
  if (made.length) writeTasks(after);
  return { made: made.length, undo: () => writeTasks(revertTasks(readTasks(), before, after)) };
}
