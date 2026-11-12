// Keeps a goal's step and the task made from it (src/lib/goalTasks.ts) ticked together, in storage.
import { readGoals, saveGoal } from './goalStore';
import { stepFollows, taskFollows } from './goalTasks';
import { readTasks, writeTasks } from './taskStore';

/** After a task was ticked on or off: tick its goal's step to match. Returns how to put the goal back (for undo). */
export function stepFollowsTask(taskId: string): (() => void) | null {
  const task = readTasks().find((t) => t.id === taskId);
  if (!task?.goal || task.repeat) return null;
  const goals = readGoals();
  const before = goals.find((g) => g.id === task.goal!.goal);
  const g = stepFollows(goals, task);
  if (!g || !before) return null;
  saveGoal(g);
  return () => saveGoal(before);
}

/** After a step was ticked on or off on the goal's road: tick its task to match. */
export function taskFollowsStep(goalId: string, stepId: string, done: string | null) {
  const next = taskFollows(readTasks(), goalId, stepId, done);
  if (next) writeTasks(next);
}
