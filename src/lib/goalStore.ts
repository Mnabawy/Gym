// Reading and writing goals in storage meta (src/lib/goals.ts), with a data-version bump so screens re-read.
import { useDataVersion } from './bus';
import { GOALS_KEY, parseGoals, type Goal } from './goals';
import { storage } from './storage';

export const readGoals = () => parseGoals(storage.getMeta(GOALS_KEY));

export function saveGoal(g: Goal) {
  const list = readGoals();
  const i = list.findIndex((x) => x.id === g.id);
  if (i >= 0) list[i] = g;
  else list.push(g);
  storage.setMeta(GOALS_KEY, JSON.stringify(list));
  useDataVersion.getState().bump();
}

export function deleteGoal(id: string) {
  storage.setMeta(GOALS_KEY, JSON.stringify(readGoals().filter((g) => g.id !== id)));
  useDataVersion.getState().bump();
}
