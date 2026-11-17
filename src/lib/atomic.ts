// All-or-nothing for a store action that writes more than one key (a task and its goal step, the trash and the task
// list…): one storage transaction, so a write that throws halfway puts back the ones before it. A call inside another
// is a savepoint (storage.ts): if it throws, only its own writes go back, and an outer call that
// catches the error still commits its own.
import { storage } from './storage';

export function atomic<T>(f: () => T): T {
  let out!: T;
  storage.transaction(() => {
    out = f();
  });
  return out;
}
