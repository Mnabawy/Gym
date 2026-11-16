// Keeps a goal's step and the task made from it (src/lib/goalTasks.ts) ticked together, in storage.
import { readGoals, saveGoal } from './goalStore';
import { stepFollows, taskFollows } from './goalTasks';
import { readTasks, writeTasks } from './taskStore';

/**
 * After a task was ticked on or off: tick its goal's step to match. Returns how to put the step back (for undo): only
 * that step's tick, on the goal as it is then, so anything else changed on the goal meanwhile (a sync) stays.
 */
export function stepFollowsTask(taskId: string): (() => void) | null {
  const task = readTasks().find((t) => t.id === taskId);
  if (!task?.goal || task.repeat) return null;
  const goals = readGoals();
  const was = goals.find((g) => g.id === task.goal!.goal)?.stages.flatMap((s) => s.tasks).find((st) => st.id === task.goal!.step);
  const g = stepFollows(goals, task);
  if (!g || !was) return null;
  saveGoal(g);
  return () => {
    const back = stepFollows(readGoals(), { ...task, done: was.done });
    if (back) saveGoal(back);
  };
}

/** After a step was ticked on or off on the goal's road: tick its task to match. */
export function taskFollowsStep(goalId: string, stepId: string, done: string | null) {
  const next = taskFollows(readTasks(), goalId, stepId, done);
  if (next) writeTasks(next);
}
