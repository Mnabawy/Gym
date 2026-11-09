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

/** Deleting a big goal keeps the goals under it, as goals of their own. */
export function deleteGoal(id: string) {
  const list = readGoals().filter((g) => g.id !== id).map((g) => (g.parent === id ? (({ parent: _p, weight: _w, ...rest }) => rest)(g) : g));
  storage.setMeta(GOALS_KEY, JSON.stringify(list));
  useDataVersion.getState().bump();
}
